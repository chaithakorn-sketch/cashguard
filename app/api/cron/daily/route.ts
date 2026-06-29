import { NextRequest, NextResponse } from 'next/server';
import { sb } from '@/lib/supabase';
import { push, flexMessage } from '@/lib/line';
import { totalBalance } from '@/lib/ledger';
import * as flex from '@/lib/flex';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse('unauthorized', { status: 401 });
  }
  const since = new Date(); since.setHours(0,0,0,0);

  const { data: todays } = await sb.from('entries')
    .select('amount,type,status').gte('submitted_at', since.toISOString())
    .in('status', ['confirmed','flagged']);
  const spentToday = (todays ?? [])
    .filter((e:any)=>['expense','customer_refund'].includes(e.type))
    .reduce((s:number,e:any)=>s+Number(e.amount||0),0);

  // flagged items still unresolved
  const { data: flagged } = await sb.from('entries')
    .select('id,amount,description,vendor,flags!inner(kind,detail,resolved)')
    .eq('status','flagged');
  const items = (flagged ?? []).slice(0,5).map((e:any)=>({
    kind: (e.flags?.[0]?.kind === 'duplicate' ? 'bad' : 'warn') as 'warn'|'bad',
    title: (e.flags?.[0]?.detail ?? 'ตรวจสอบ'),
    sub: e.vendor ?? e.description ?? '',
    amount: Number(e.amount||0),
  }));

  const summary = flex.flexDailySummary({
    date: new Date().toLocaleDateString('th-TH',{day:'numeric',month:'short',year:'numeric'}),
    spentToday, totalBalance: await totalBalance(), toReview: (flagged ?? []).length, items,
  });

  if (process.env.ADMIN_GROUP_ID) {
    await push(process.env.ADMIN_GROUP_ID, [flexMessage('สรุปเงินสดย่อยวันนี้', summary)]);
  }
  return NextResponse.json({ ok: true, spentToday, toReview: (flagged ?? []).length });
}
