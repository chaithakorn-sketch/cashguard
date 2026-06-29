import { NextRequest, NextResponse } from 'next/server';
import { verifySignature, reply, getMessageContent, flexMessage } from '@/lib/line';
import { sb } from '@/lib/supabase';
import { ensureDraft, attachReceipt, setAmount, isReady } from '@/lib/draft-engine';
import { computeFlags, saveFlags } from '@/lib/flags';
import { balanceFor } from '@/lib/ledger';
import { runOcr } from '@/lib/ocr';
import { pHash, findDuplicate } from '@/lib/phash';
import * as flex from '@/lib/flex';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (!verifySignature(raw, req.headers.get('x-line-signature'))) {
    return new NextResponse('bad signature', { status: 401 });
  }
  const body = JSON.parse(raw);
  // Respond 200 fast; process events (LINE retries on non-200).
  for (const ev of body.events ?? []) {
    try { await handleEvent(ev); } catch (e) { console.error('event error', e); }
  }
  return NextResponse.json({ ok: true });
}

async function resolveBranch(ev: any) {
  const gid = ev.source?.groupId;
  if (!gid) return null;
  const { data } = await sb.from('branches').select('*').eq('line_group_id', gid).maybeSingle();
  return data;
}
async function resolveEmployee(userId: string) {
  const { data } = await sb.from('employees').select('*').eq('line_user_id', userId).maybeSingle();
  return data;
}

async function handleEvent(ev: any) {
  if (ev.type === 'message') return handleMessage(ev);
  if (ev.type === 'postback') return handlePostback(ev);
}

async function handleMessage(ev: any) {
  const userId = ev.source?.userId;
  if (!userId) return;
  const emp = await resolveEmployee(userId);
  if (!emp) {
    // Unknown sender — prompt one-time registration (TODO: registration flow)
    return reply(ev.replyToken, [{ type: 'text', text: 'ยังไม่พบข้อมูลพนักงาน กรุณาลงทะเบียนก่อนใช้งานครับ' }]);
  }
  const branch = await resolveBranch(ev);
  const draft = await ensureDraft(emp.id, branch?.id ?? emp.branch_id);

  if (ev.message.type === 'image') {
    const img = await getMessageContent(ev.message.id);
    // TODO: upload img to Supabase Storage -> imageUrl
    const imageUrl = 'storage://pending'; // placeholder until storage wired
    const hash = await pHash(img);
    const dup = await findDuplicate(hash);
    if (dup) {
      return reply(ev.replyToken, [flexMessage('ตรวจพบรูปซ้ำ',
        flex.flexRejectedDuplicate({ id: draft.id, amount: draft.amount ?? 0, prevDate: '-', prevBy: '-', prevItem: '-' }))]);
    }
    const ocr = await runOcr(img);
    await attachReceipt(draft.id, imageUrl, hash, ocr.raw, ocr.amount, ocr.evidenceType);
    return maybeConfirm(ev, draft.id);
  }

  if (ev.message.type === 'text') {
    const parsed = parseText(ev.message.text);
    if (parsed.amount == null && !parsed.vendor && !parsed.category) return; // chit-chat, ignore
    await setAmount(draft.id, parsed);
    return maybeConfirm(ev, draft.id);
  }
}

/** Very small parser: pulls the first number as amount; rest as description. */
function parseText(text: string): { amount?: number; vendor?: string; category?: string; description?: string } {
  const m = text.replace(/,/g, '').match(/(\d+(?:\.\d{1,2})?)/);
  const amount = m ? Number(m[1]) : undefined;
  const desc = text.replace(/(\d+(?:\.\d{1,2})?)/, '').trim();
  return { amount, description: desc || undefined };
}

async function maybeConfirm(ev: any, entryId: string) {
  const { data: e } = await sb.from('entries').select('*').eq('id', entryId).single();
  if (await isReady(e)) {
    const ocrOk = e.ocr_verified && e.ocr_amount != null &&
      Math.abs(Number(e.amount) - Number(e.ocr_amount)) <= Math.max(5, Number(e.ocr_amount) * 0.02);
    return reply(ev.replyToken, [flexMessage('ยืนยันรายการ',
      flex.flexDraftConfirm({ id: e.id, amount: Number(e.amount), vendor: e.vendor ?? 'ไม่ระบุ', category: e.category ?? 'อื่นๆ', ocrOk }))]);
  }
  // still incomplete -> gentle ack
  const need = e.amount == null ? 'พิมพ์ยอดด้วยนะครับ' : 'รอแนบบิลด้วยนะครับ';
  return reply(ev.replyToken, [{ type: 'text', text: `รับแล้ว · ${need}` }]);
}

async function handlePostback(ev: any) {
  const params = new URLSearchParams(ev.postback.data);
  const action = params.get('action');
  const id = params.get('id');
  if (!id) return;
  const { data: e } = await sb.from('entries').select('*').eq('id', id).single();
  if (!e) return;
  const { data: emp } = await sb.from('employees').select('*').eq('id', e.payer_id).single();
  const { data: br } = await sb.from('branches').select('*').eq('id', e.branch_id).maybeSingle();

  if (action === 'confirm') {
    const flags = await computeFlags(e);
    const status = flags.length ? 'flagged' : 'confirmed';
    await sb.from('entries').update({ status, spent_at: e.spent_at ?? e.submitted_at }).eq('id', id);
    await saveFlags(id, flags);
    const bal = await balanceFor(e.payer_id);
    if (status === 'confirmed') {
      return reply(ev.replyToken, [flexMessage('บันทึกแล้ว', flex.flexExpenseSuccess({
        amount: Number(e.amount), vendor: e.vendor ?? 'ไม่ระบุ', category: e.category ?? 'อื่นๆ',
        payer: emp?.nickname ?? emp?.name ?? '-', branch: br?.name ?? '-', balance: bal,
        when: new Date().toLocaleString('th-TH', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' }) })));
    }
    // flagged -> notify + (TODO) push to ADMIN_GROUP_ID
    return reply(ev.replyToken, [flexMessage('รอตรวจสอบ', flex.flexFlagged({
      amount: Number(e.amount), item: e.description ?? e.vendor ?? '-', reason: flags[0].detail,
      evidence: e.evidence_type === 'none' ? 'ไม่มีบิล' : 'มีบิล', who: emp?.nickname ?? '-', balance: bal })));
  }

  // other actions: split / add_photo / second_installment / retake / use_ocr / use_typed / attach_now / topup_urgent
  // TODO: implement each. For now acknowledge.
  return reply(ev.replyToken, [{ type: 'text', text: `รับคำสั่ง: ${action}` }]);
}
