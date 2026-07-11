import { NextRequest, NextResponse } from 'next/server';
import { sb, unwrap } from '@/lib/supabase';
import { resolveLiffUser } from '@/lib/liff';
import { balanceFor } from '@/lib/ledger';
import { signedUrl } from '@/lib/storage';
import { postToBranchGroup } from '@/lib/sunlight';
import * as flex from '@/lib/flex';

export const runtime = 'nodejs';

const baht = (n: number) => '฿' + Number(n).toLocaleString('en-US');

// Fields the owner may edit from the web app.
const EDITABLE = ['amount', 'spent_at', 'category', 'category_code', 'vendor', 'description'] as const;

// GET /api/entries/[id]  -> single entry + receipts (signed image urls). Owner only.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const u = await resolveLiffUser(req);
  if (!u?.employee) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { data: e } = await sb.from('entries').select('*').eq('id', params.id).maybeSingle();
  if (!e) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (e.payer_id !== u.employee.id) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const { data: receipts } = await sb.from('receipts')
    .select('id, image_url, slip_status, uploaded_at').eq('entry_id', e.id);
  const withUrls = await Promise.all((receipts ?? []).map(async (r: any) => ({
    id: r.id, slip_status: r.slip_status, uploaded_at: r.uploaded_at,
    url: await signedUrl(r.image_url, 3600),
  })));

  return NextResponse.json({ entry: e, receipts: withUrls });
}

// PATCH /api/entries/[id]  -> owner edits their own entry (any time, per decision).
// Writes an immutable audit_log (before/after) and broadcasts a Sunlight edit card
// to the branch group. Body: { amount?, spent_at?, category?, category_code?, vendor?, description? }
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const u = await resolveLiffUser(req);
  if (!u?.employee) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const before = unwrap(await sb.from('entries').select('*').eq('id', params.id).single(), 'patch.fetch');
  if (before.payer_id !== u.employee.id) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  if (before.status === 'rejected') return NextResponse.json({ error: 'entry_rejected' }, { status: 409 });

  const body = await req.json().catch(() => ({}));
  const patch: Record<string, any> = {};
  for (const k of EDITABLE) if (body[k] !== undefined) patch[k] = body[k];
  if (!Object.keys(patch).length) return NextResponse.json({ error: 'no_fields' }, { status: 400 });
  patch.updated_at = new Date().toISOString();

  const after = unwrap(
    await sb.from('entries').update(patch).eq('id', params.id).select('*').single(),
    'patch.update'
  );

  // Immutable ledger: never overwrite history, record the change.
  await sb.from('audit_log').insert({
    entry_id: params.id, actor: u.employee.id, action: 'edited',
    before, after,
  });

  const balance = await balanceFor(before.payer_id);

  // Sunlight: broadcast before -> after to the branch group (best-effort).
  const changed = Object.keys(patch).filter(k => k !== 'updated_at');
  const fld = changed.join(', ');
  const beforeStr = changed.map(k => (k === 'amount' ? baht(before[k]) : String(before[k] ?? '-'))).join(' · ');
  const afterStr = changed.map(k => (k === 'amount' ? baht(after[k]) : String(after[k] ?? '-'))).join(' · ');
  await postToBranchGroup(before.branch_id, 'แก้ไขรายการ',
    flex.flexEdited({ who: u.employee.nickname ?? u.employee.name, field: fld, before: beforeStr, after: afterStr, balance }));

  return NextResponse.json({ entry: after, balance });
}
