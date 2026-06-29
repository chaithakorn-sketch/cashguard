import { sb } from './supabase';

const TIMEOUT_MIN = Number(process.env.BASKET_TIMEOUT_MINUTES || 10);

/** Get the employee's currently-open draft basket, or null. */
export async function openDraft(payerId: string) {
  const { data } = await sb.from('entries')
    .select('*')
    .eq('payer_id', payerId).eq('status', 'draft')
    .order('created_at', { ascending: false }).limit(1).maybeSingle();
  return data;
}

/** Open a fresh basket (called when first photo or amount arrives). */
export async function newDraft(payerId: string, branchId: string | null) {
  const expires = new Date(Date.now() + TIMEOUT_MIN * 60_000).toISOString();
  const { data } = await sb.from('entries')
    .insert({ type: 'expense', status: 'draft', payer_id: payerId, branch_id: branchId, basket_expires: expires })
    .select('*').single();
  return data;
}

/** Ensure a draft exists for this payer; extend the timeout window. */
export async function ensureDraft(payerId: string, branchId: string | null) {
  let d = await openDraft(payerId);
  if (!d) d = await newDraft(payerId, branchId);
  else await touch(d.id);
  return d;
}

export async function touch(id: string) {
  const expires = new Date(Date.now() + TIMEOUT_MIN * 60_000).toISOString();
  await sb.from('entries').update({ basket_expires: expires, updated_at: new Date().toISOString() }).eq('id', id);
}

/** Attach a receipt (already uploaded to storage) to the draft. */
export async function attachReceipt(entryId: string, imageUrl: string, phash: string | null, ocrRaw: any, ocrAmount: number | null, evidenceType: string) {
  await sb.from('receipts').insert({ entry_id: entryId, image_url: imageUrl, phash, ocr_raw: ocrRaw });
  const patch: any = { evidence_type: evidenceType, updated_at: new Date().toISOString() };
  if (ocrAmount != null) { patch.ocr_amount = ocrAmount; patch.ocr_verified = true; }
  await sb.from('entries').update(patch).eq('id', entryId);
  await touch(entryId);
}

/** Set the typed amount / category / vendor on the draft. */
export async function setAmount(entryId: string, fields: { amount?: number; category?: string; vendor?: string; description?: string }) {
  await sb.from('entries').update({ ...fields, updated_at: new Date().toISOString() }).eq('id', entryId);
  await touch(entryId);
}

export async function receiptCount(entryId: string) {
  const { count } = await sb.from('receipts').select('id', { count: 'exact', head: true }).eq('entry_id', entryId);
  return count ?? 0;
}

/** A draft is ready to confirm when it has both an amount and >=1 receipt. */
export async function isReady(entry: any): Promise<boolean> {
  if (entry.amount == null) return false;
  return (await receiptCount(entry.id)) >= 1;
}

/**
 * Sweep expired baskets (called by Vercel Cron).
 * Drafts with an amount but no receipt -> pending_evidence.
 * Drafts with a receipt but no amount  -> pending_amount.
 * Empty drafts -> rejected (abandoned).
 */
export async function sweepExpired() {
  const now = new Date().toISOString();
  const { data: expired } = await sb.from('entries').select('*').eq('status', 'draft').lt('basket_expires', now);
  const result = { pending_evidence: 0, pending_amount: 0, rejected: 0 };
  for (const e of expired ?? []) {
    const rc = await receiptCount(e.id);
    let next: string;
    if (e.amount != null && rc === 0) next = 'pending_evidence';
    else if (e.amount == null && rc > 0) next = 'pending_amount';
    else if (e.amount == null && rc === 0) next = 'rejected';
    else continue; // ready-but-unconfirmed: leave for now
    await sb.from('entries').update({ status: next }).eq('id', e.id);
    // @ts-ignore
    result[next]++;
  }
  return result;
}
