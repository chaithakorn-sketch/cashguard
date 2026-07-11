import { NextRequest, NextResponse } from 'next/server';
import { resolveLiffUser } from '@/lib/liff';
import { balanceFor } from '@/lib/ledger';

export const runtime = 'nodejs';

// POST /api/liff/verify  ->  identity for the web app.
// Auth: Authorization: Bearer <LIFF access token>
export async function POST(req: NextRequest) {
  const u = await resolveLiffUser(req);
  if (!u) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!u.employee) return NextResponse.json({ error: 'not_registered' }, { status: 403 });
  const balance = await balanceFor(u.employee.id);
  return NextResponse.json({
    employee: {
      id: u.employee.id,
      name: u.employee.name,
      nickname: u.employee.nickname,
      branch_id: u.employee.branch_id,
    },
    balance,
  });
}
