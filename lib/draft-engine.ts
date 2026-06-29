import { sb, unwrap } from './supabase';

const TIMEOUT_MIN = Number(process.env.BASKET_TIMEOUT_MINUTES || 10);

/** Get the employee's currently-open expense draft basket, or null.
 *  (type='expense' so a pending top-up draft never gets reused for a bill.) */
export async function openDraft(payerId: string) {
  const { data } = await sb.from('entries')
    .select('*')
    .eq('payer_id', payerId).eq('status', 'draft').eq('type', 'expense')
    .order('created_at', { ascending: false }).limit(1).maybeSingle();
  return data;
}

/** Open a fresh basket (called when first photo or amount arrives). */
export async function newDraft(payerId: string, branchId: string | null) {
  const expires = new Date(Date.now() + TIMEOUT_MIN * 60_000).toISOString();
  return unwrap(
    await sb.from('entries')
      .insert({ type: 'expense', status: 'draft', payer_id: payerId, branch_id: branchId, basket_expires: expires })
      .select('*').single(),
    'newDraft.insert'
  );
}

/** Ensure a draft exists for this payer; extend the timeout window. */
export async function ensureDraft(payerId: string, branchId: string | null) {
  let d = await openDraft(payerId);
  if (!d) d = await newDraft(payerId, branchId);
  else await touch(d.id);
  return d;
}

/**
 * Get the payer's in-progress (incomplete) basket, or open a fresh one.
 * A basket that already has amount + receipt is "done, awaiting confirm" — a new
 * bill must NOT merge into it, so we start a new basket instead of reusing it.
 * (Multi-page: extra photos before the amount still land in the same basket.)
 */
export async function draftForNewInput(payerId: string, branchId: string | null) {
  const open = await openDraft(payerId);
  if (open && !(await isReady(open))) { await touch(open.id); return open; }
  return newDraft(payerId, branchId);
}

/** Record a cash top-up (cash added to the float). No receipt/basket — confirmed on tap. */
export async function newTopup(payerId: string, branchId: string | null, amount: number) {
  return unwrap(
    await sb.from('entries')
      .insert({ type: 'topup', status: 'draft', payer_id: payerId, branch_id: branchId, amount })
      .select('*').single(),
    'newTopup.insert'
  );
}

export async function touch(id: string) {
  const expires = new Date(Date.now() + TIMEOUT_MIN * 60_000).toISOString();
  await sb.from('entries').update({ basket_expires: expires, updated_at: new Date().toISOString() }).eq('id', id);
}

/** Attach a receipt (already uploaded to storage) to the draft. */
export async function attachReceipt(entryId: string, imageUrl: string, phash: string | null, ocrRaw: any, ocrAmount: number | null, evidenceType: string) {
  unwrap(await sb.from('receipts').insert({ entry_id: entryId, image_url: imageUrl, phash, ocr_raw: ocrRaw }), 'attachReceipt.insertReceipt');
  const patch: any = { evidence_type: evidenceType, updated_at: new Date().toISOString() };
  if (ocrAmount != null) { patch.ocr_amount = ocrAmount; patch.ocr_verified = true; }
  unwrap(await sb.from('entries').update(patch).eq('id', entryId), 'attachReceipt.updateEntry');
  await touch(entryId);
}

/** Set the typed amount / category / vendor on the draft. */
export async function setAmount(entryId: string, fields: { amount?: number; category?: string; vendor?: string; description?: string }) {
  unwrap(await sb.from('entries').update({ ...fields, updated_at: new Date().toISOString() }).eq('id', entryId), 'setAmount.update');
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
  const expired = unwrap(
    await sb.from('entries').select('*').eq('status', 'draft').eq('type', 'expense').lt('basket_expires', now),
    'sweepExpired.fetch'
  ) ?? [];
  const result = { pending_evidence: 0, pending_amount: 0, rejected: 0, remind: [] as any[] };
  for (const e of expired) {
    const rc = await receiptCount(e.id);
    if (e.amount != null && rc >= 1) { result.remind.push(e); continue; } // ready-but-unconfirmed -> nudge, keep as draft
    let next: 'pending_evidence' | 'pending_amount' | 'rejected';
    if (e.amount != null && rc === 0) next = 'pending_evidence';
    else if (e.amount == null && rc > 0) next = 'pending_amount';
    else next = 'rejected'; // abandoned (no amount, no receipt)
    unwrap(await sb.from('entries').update({ status: next }).eq('id', e.id), 'sweepExpired.update');
    result[next]++;
  }
  return result;
}
