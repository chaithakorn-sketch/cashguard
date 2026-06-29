import { NextRequest, NextResponse } from 'next/server';
import { sweepExpired } from '@/lib/draft-engine';
import { sb } from '@/lib/supabase';
import { push, flexMessage } from '@/lib/line';
import * as flex from '@/lib/flex';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse('unauthorized', { status: 401 });
  }
  const { remind, ...swept } = await sweepExpired();

  // Nudge baskets that have an amount + receipt but were never confirmed
  // (someone got the card and forgot to tap). Daily on Hobby crons.
  let reminded = 0;
  for (const e of remind) {
    let to: string | null = null;
    if (e.branch_id) {
      const { data: br } = await sb.from('branches').select('line_group_id').eq('id', e.branch_id).maybeSingle();
      to = br?.line_group_id ?? null;
    }
    if (!to) {
      const { data: emp } = await sb.from('employees').select('line_user_id').eq('id', e.payer_id).maybeSingle();
      to = emp?.line_user_id ?? null;
    }
    if (!to) continue;
    await push(to, [flexMessage('บิลรอยืนยัน', flex.flexDraftConfirm({
      id: e.id, amount: Number(e.amount), vendor: e.vendor ?? 'ไม่ระบุ', category: e.category ?? 'อื่นๆ', ocrOk: false,
    }))]);
    reminded++;
  }
  return NextResponse.json({ ok: true, ...swept, reminded });
}
