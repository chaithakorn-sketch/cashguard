import { NextRequest, NextResponse } from 'next/server';
import { verifySignature, reply, push, getMessageContent, flexMessage } from '@/lib/line';
import { sb } from '@/lib/supabase';
import { ensureDraft, attachReceipt, setAmount, isReady, touch } from '@/lib/draft-engine';
import { computeFlags } from '@/lib/flags';
import { balanceFor } from '@/lib/ledger';
import { runOcr } from '@/lib/ocr';
import { pHash, findDuplicate } from '@/lib/phash';
import { uploadReceipt } from '@/lib/storage';
import { parseText } from '@/lib/parse';
import { findOrRegister } from '@/lib/register';
import * as flex from '@/lib/flex';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (!verifySignature(raw, req.headers.get('x-line-signature'))) {
    return new NextResponse('bad signature', { status: 401 });
  }
  const body = JSON.parse(raw);
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

async function handleEvent(ev: any) {
  if (ev.type === 'message') return handleMessage(ev);
  if (ev.type === 'postback') return handlePostback(ev);
}

// ---------------------------------------------------------------- messages
async function handleMessage(ev: any) {
  const userId = ev.source?.userId;
  if (!userId) return;
  const branch = await resolveBranch(ev);
  const { employee: emp, justRegistered } = await findOrRegister(userId, branch?.id ?? null, ev.source?.groupId);
  if (!emp) return;
  if (justRegistered) {
    await push(userId, [{ type: 'text', text: `ลงทะเบียนให้แล้วครับ: ${emp.name}${branch ? ' · ' + branch.name : ''}\nส่งบิล (รูป + ยอด) ได้เลย` }]);
  }

  const draft = await ensureDraft(emp.id, branch?.id ?? emp.branch_id);

  if (ev.message.type === 'image') {
    const { buf, contentType } = await getMessageContent(ev.message.id);

    const hash = await pHash(buf);
    const dup = await findDuplicate(hash);
    if (dup) {
      const prev: any = (dup as any).entries;
      return reply(ev.replyToken, [flexMessage('ตรวจพบรูปซ้ำ', flex.flexRejectedDuplicate({
        id: draft.id,
        amount: draft.amount ?? prev?.amount ?? 0,
        prevDate: prev?.submitted_at ? new Date(prev.submitted_at).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' }) : '-',
        prevBy: '-',
        prevItem: prev?.vendor ?? prev?.description ?? '-',
      }))]);
    }

    const path = await uploadReceipt(draft.id, buf, contentType);
    const ocr = await runOcr(buf);
    await attachReceipt(draft.id, path, hash, ocr.raw, ocr.amount, ocr.evidenceType);
    if (ocr.vendor) await setAmount(draft.id, { vendor: ocr.vendor });
    return maybeConfirm(ev, draft.id);
  }

  if (ev.message.type === 'text') {
    const parsed = await parseText(ev.message.text);
    if (parsed.amount == null && !parsed.vendor && !parsed.category_code) return; // chit-chat
    await setAmount(draft.id, {
      amount: parsed.amount,
      vendor: parsed.vendor,
      category: parsed.category_name,
      category_code: parsed.category_code,
      description: parsed.description,
    } as any);
    return maybeConfirm(ev, draft.id);
  }
}

async function maybeConfirm(ev: any, entryId: string) {
  const { data: e } = await sb.from('entries').select('*').eq('id', entryId).single();
  if (await isReady(e)) {
    const ocrOk = e.ocr_verified && e.ocr_amount != null &&
      Math.abs(Number(e.amount) - Number(e.ocr_amount)) <= Math.max(5, Number(e.ocr_amount) * 0.02);
    if (e.ocr_verified && e.ocr_amount != null && !ocrOk) {
      return reply(ev.replyToken, [flexMessage('ยอดไม่ตรงบิล',
        flex.flexOcrMismatch({ id: e.id, typed: Number(e.amount), ocr: Number(e.ocr_amount) }))]);
    }
    return reply(ev.replyToken, [flexMessage('ยืนยันรายการ', flex.flexDraftConfirm({
      id: e.id, amount: Number(e.amount), vendor: e.vendor ?? 'ไม่ระบุ', category: e.category ?? 'อื่นๆ', ocrOk,
    }))]);
  }
  const need = e.amount == null ? 'พิมพ์ยอดด้วยนะครับ' : 'รอแนบบิลด้วยนะครับ';
  return reply(ev.replyToken, [{ type: 'text', text: `รับแล้ว · ${need}` }]);
}

// ---------------------------------------------------------------- postbacks
async function handlePostback(ev: any) {
  const params = new URLSearchParams(ev.postback.data);
  const action = params.get('action');
  const id = params.get('id');
  if (!id) {
    if (action === 'topup_urgent') return reply(ev.replyToken, [{ type: 'text', text: 'แจ้งฝ่ายบัญชีเติมเงินด่วนแล้วครับ' }]);
    return;
  }

  switch (action) {
    case 'confirm':
      return confirmEntry(ev, id);
    case 'use_ocr': {
      const { data: e } = await sb.from('entries').select('ocr_amount').eq('id', id).single();
      if (e?.ocr_amount != null) await setAmount(id, { amount: Number(e.ocr_amount) });
      return confirmEntry(ev, id);
    }
    case 'use_typed':
      return confirmEntry(ev, id);
    case 'second_installment':
      return confirmEntry(ev, id, { allowDuplicate: true });
    case 'add_photo':
    case 'attach_now':
      await touch(id);
      return reply(ev.replyToken, [{ type: 'text', text: 'ส่งรูปบิลเพิ่มได้เลยครับ' }]);
    case 'retake':
      await sb.from('entries').update({ status: 'rejected' }).eq('id', id);
      return reply(ev.replyToken, [{ type: 'text', text: 'ยกเลิกรายการนี้แล้ว ถ่ายบิลใบจริงส่งใหม่ได้เลยครับ' }]);
    case 'split':
      return reply(ev.replyToken, [{ type: 'text', text: 'โหมดแยกรายการ: ส่งบิลทีละใบ พร้อมยอดของใบนั้นได้เลยครับ' }]);
    default:
      return reply(ev.replyToken, [{ type: 'text', text: `รับคำสั่ง: ${action}` }]);
  }
}

async function confirmEntry(ev: any, id: string, opts: { allowDuplicate?: boolean } = {}) {
  const { data: e } = await sb.from('entries').select('*').eq('id', id).single();
  if (!e) return;
  const { data: emp } = await sb.from('employees').select('*').eq('id', e.payer_id).maybeSingle();
  const { data: br } = await sb.from('branches').select('*').eq('id', e.branch_id).maybeSingle();

  const flags = await computeFlags(e);
  const filtered = opts.allowDuplicate ? flags.filter(f => f.kind !== 'duplicate') : flags;

  const { data: status } = await sb.rpc('confirm_entry', {
    p_entry_id: id,
    p_flags: filtered,
    p_actor: e.payer_id ?? 'system',
  });

  const bal = await balanceFor(e.payer_id);

  if (status === 'confirmed') {
    return reply(ev.replyToken, [flexMessage('บันทึกแล้ว', flex.flexExpenseSuccess({
      amount: Number(e.amount), vendor: e.vendor ?? 'ไม่ระบุ', category: e.category ?? 'อื่นๆ',
      payer: emp?.nickname ?? emp?.name ?? '-', branch: br?.name ?? '-', balance: bal,
      when: new Date().toLocaleString('th-TH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }),
    }))]);
  }

  const flaggedCard = flexMessage('รอตรวจสอบ', flex.flexFlagged({
    amount: Number(e.amount), item: e.description ?? e.vendor ?? '-',
    reason: filtered[0]?.detail ?? 'ตรวจสอบ',
    evidence: e.evidence_type === 'none' ? 'ไม่มีบิล' : 'มีบิล',
    who: emp?.nickname ?? '-', balance: bal,
  }));
  await reply(ev.replyToken, [flaggedCard]);
  if (process.env.ADMIN_GROUP_ID) await push(process.env.ADMIN_GROUP_ID, [flaggedCard]);
}
