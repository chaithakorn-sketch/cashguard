import { NextRequest, NextResponse } from 'next/server';
import { sb, unwrap } from '@/lib/supabase';
import { resolveLiffUser } from '@/lib/liff';
import { uploadReceipt, signedUrl } from '@/lib/storage';
import { pHash } from '@/lib/phash';
import { runOcr } from '@/lib/ocr';

export const runtime = 'nodejs';

// POST /api/upload  (multipart/form-data: file=<image>, entry_id=<uuid>)
// Attaches a receipt image to an entry the caller owns. Returns the signed url.
export async function POST(req: NextRequest) {
  const u = await resolveLiffUser(req);
  if (!u?.employee) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const form = await req.formData().catch(() => null);
  const file = form?.get('file') as File | null;
  const entryId = String(form?.get('entry_id') || '');
  if (!file || !entryId) return NextResponse.json({ error: 'file_and_entry_id_required' }, { status: 400 });

  const entry = unwrap(await sb.from('entries').select('id, payer_id').eq('id', entryId).single(), 'upload.fetch');
  if (!entry || entry.payer_id !== u.employee.id) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const buf = Buffer.from(await file.arrayBuffer());
  const contentType = file.type || 'image/jpeg';
  const path = await uploadReceipt(entryId, buf, contentType);
  const hash = await pHash(buf);
  const ocr = await runOcr(buf);

  unwrap(
    await sb.from('receipts').insert({ entry_id: entryId, image_url: path, phash: hash, ocr_raw: ocr.raw }),
    'upload.insertReceipt'
  );
  if (ocr.evidenceType) {
    await sb.from('entries').update({ evidence_type: ocr.evidenceType, updated_at: new Date().toISOString() }).eq('id', entryId);
  }

  return NextResponse.json({ path, url: await signedUrl(path, 3600), ocr_amount: ocr.amount ?? null });
}

// DELETE /api/upload?receipt_id=<uuid>  -> remove a receipt from an owned entry.
export async function DELETE(req: NextRequest) {
  const u = await resolveLiffUser(req);
  if (!u?.employee) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const receiptId = new URL(req.url).searchParams.get('receipt_id') || '';
  if (!receiptId) return NextResponse.json({ error: 'receipt_id_required' }, { status: 400 });

  const { data: r } = await sb.from('receipts').select('id, entry_id, image_url, entries(payer_id)').eq('id', receiptId).maybeSingle();
  if (!r) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if ((r as any).entries?.payer_id !== u.employee.id) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  await sb.storage.from('cashguard-receipts').remove([(r as any).image_url]);
  unwrap(await sb.from('receipts').delete().eq('id', receiptId), 'upload.deleteReceipt');
  return NextResponse.json({ ok: true });
}
