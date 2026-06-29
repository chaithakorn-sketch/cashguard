import { NextRequest, NextResponse } from 'next/server';
import { sweepExpired } from '@/lib/draft-engine';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse('unauthorized', { status: 401 });
  }
  const result = await sweepExpired();
  return NextResponse.json({ ok: true, ...result });
}
