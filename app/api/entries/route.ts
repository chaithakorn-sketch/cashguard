import { NextRequest, NextResponse } from 'next/server';
import { sb } from '@/lib/supabase';
import { resolveLiffUser } from '@/lib/liff';
import { balanceFor } from '@/lib/ledger';

export const runtime = 'nodejs';

// GET /api/entries?type=expense|topup&from=ISO&to=ISO&limit=50
// Returns ONLY the caller's own entries (ownership enforced by payer_id).
// Used by the web app's list / history page.
export async function GET(req: NextRequest) {
  const u = await resolveLiffUser(req);
  if (!u) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!u.employee) return NextResponse.json({ error: 'not_registered' }, { status: 403 });

  const url = new URL(req.url);
  const type = url.searchParams.get('type');
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  const limit = Math.min(Number(url.searchParams.get('limit') || 50) || 50, 200);

  let q = sb.from('entries')
    .select('id, type, status, amount, category, category_code, vendor, description, evidence_type, spent_at, submitted_at')
    .eq('payer_id', u.employee.id)
    .order('submitted_at', { ascending: false })
    .limit(limit);
  if (type) q = q.eq('type', type);
  if (from) q = q.gte('submitted_at', from);
  if (to) q = q.lte('submitted_at', to);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const balance = await balanceFor(u.employee.id);
  return NextResponse.json({ balance, entries: data ?? [] });
}
