import { NextRequest, NextResponse } from 'next/server';
import { verifySignature, reply, push, getMessageContent, flexMessage } from '@/lib/line';
import { sb, unwrap } from '@/lib/supabase';
import { draftForNewInput, openDraft, receiptCount, attachReceipt, setAmount, isReady, touch, newTopup } from '@/lib/draft-engine';
import { computeFlags } from '@/lib/flags';
import { balanceFor } from '@/lib/ledger';
import { runOcr } from '@/lib/ocr';
import { pHash, findDuplicate } from '@/lib/phash';
import { uploadReceipt } from '@/lib/storage';
import { parseText } from '@/lib/parse';
import { findOrRegister, findEmployee } from '@/lib/register';
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
  if (!userId || !ev.message) return;
  // Only act inside a REGISTERED branch group. The OA also lives in other groups
  // and DMs — ignore everything that isn't a known branch's line_group_id so we
  // never read or record messages from anywhere else.
  const branch = await resolveBranch(ev);
  if (!branch) return;
  if (ev.message.type === 'image') return handleImage(ev, userId, branch);
  if (ev.message.type === 'text') return handleText(ev, userId, branch);
}

async function greet(emp: any, branch: any) {
  if (!emp?.line_user_id) return;
  await push(emp.line_user_id, [{ type: 'text',
    text: `ลงทะเบียนให้แล้วครับ: ${emp.name}${branch ? ' · ' + branch.name : ''}\nส่งบิล (รูป + ยอด) ได้เลย` }]);
}

// A photo is always an explicit "I'm logging an expense" signal.
async function handleImage(ev: any, userId: string, branch: any) {
  const { employee: emp, justRegistered } = await findOrRegister(userId, branch?.id ?? null, ev.source?.groupId);
  if (!emp) return;
  if (justRegistered) await greet(emp, branch);

  const { buf, contentType } = await getMessageContent(ev.message.id);
  const hash = await pHash(buf);
  const ocr = await runOcr(buf); // before the dup check so the amount can disambiguate look-alike slips
  const draft = await draftForNewInput(emp.id, branch?.id ?? emp.branch_id);
  const dup = await findDuplicate(hash, 6, 60, ocr.amount ?? null);

  if (dup) {
    const prev: any = (dup as any).entries;
    return reply(ev.replyToken, [flexMessage('ตรวจพบรูปซ้ำ', flex.flexRejectedDuplicate({
      id: draft.id,
      amount: ocr.amount ?? draft.amount ?? prev?.amount ?? 0,
      prevDate: prev?.submitted_at ? new Date(prev.submitted_at).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' }) : '-',
      prevBy: '-',
      prevItem: prev?.vendor ?? prev?.description ?? '-',
    }))]);
  }

  const path = await uploadReceipt(draft.id, buf, contentType);
  await attachReceipt(draft.id, path, hash, ocr.raw, ocr.amount, ocr.evidenceType);
  const patch: any = {};
  if (ocr.vendor) patch.vendor = ocr.vendor;
  if (ocr.amount != null && draft.amount == null) patch.amount = ocr.amount; // OCR auto-fill: no typing needed
  if (Object.keys(patch).length) await setAmount(draft.id, patch);
  return maybeConfirm(ev, draft.id);
}

// Words that mark a number as money rather than group chit-chat.
const MONEY_CUE = /฿|บาท|thb|ค่า|จ่าย|ซื้อ|เบิก/i;
// Specific top-up phrases (NOT bare "เติม", which also means เติมน้ำมัน = an expense).
const TOPUP_CUE = /เติมเงิน|รับเงินสด|เงินเข้า/i;

async function handleTopup(ev: any, userId: string, branch: any, amount: number) {
  const { employee: emp, justRegistered } = await findOrRegister(userId, branch?.id ?? null, ev.source?.groupId);
  if (!emp) return;
  if (justRegistered) await greet(emp, branch);
  const t = await newTopup(emp.id, branch?.id ?? emp.branch_id, amount);
  return reply(ev.replyToken, [flexMessage('ยืนยันเติมเงิน', flex.flexTopupConfirm({ id: t.id, amount }))]);
}

// Text only counts as an expense if it has an amount AND either a money cue or a
// receipt already waiting for its amount — otherwise a stray number in normal
// group conversation ("รอบ 2", "โทร 089...") would silently create a record.
async function handleText(ev: any, userId: string, branch: any) {
  const text: string = ev.message.text ?? '';
  const parsed = await parseText(text);

  // "ตั้งชื่อ ป๊อก" — fix the auto-registered LINE display name.
  const nameCmd = text.match(/^\s*ตั้งชื่อ\s+(.{1,40})$/);
  if (nameCmd) {
    const emp = await findEmployee(userId);
    if (!emp) return reply(ev.replyToken, [{ type: 'text', text: 'ส่งบิลสักครั้งเพื่อลงทะเบียนก่อน แล้วค่อยตั้งชื่อได้ครับ' }]);
    const nick = nameCmd[1].trim();
    unwrap(await sb.from('employees').update({ nickname: nick, name: nick }).eq('id', emp.id), 'setName');
    return reply(ev.replyToken, [{ type: 'text', text: `ตั้งชื่อเป็น "${nick}" แล้วครับ` }]);
  }

  // "เติมเงิน 5000" — record a cash top-up.
  if (TOPUP_CUE.test(text) && parsed.amount != null) return handleTopup(ev, userId, branch, parsed.amount);

  const existing = await findEmployee(userId);
  let pendingAwaitingAmount = false;
  if (existing) {
    const open = await openDraft(existing.id);
    pendingAwaitingAmount = !!open && open.amount == null && (await receiptCount(open.id)) >= 1;
  }
  const hasMoneyCue = MONEY_CUE.test(text) || !!parsed.vendor || !!parsed.category_code;
  if (parsed.amount == null || !(pendingAwaitingAmount || hasMoneyCue)) return; // chit-chat

  const { employee: emp, justRegistered } = await findOrRegister(userId, branch?.id ?? null, ev.source?.groupId);
  if (!emp) return;
  if (justRegistered) await greet(emp, branch);

  const draft = await draftForNewInput(emp.id, branch?.id ?? emp.branch_id);
  await setAmount(draft.id, {
    amount: parsed.amount,
    vendor: parsed.vendor,
    category: parsed.category_name,
    category_code: parsed.category_code,
    description: parsed.description,
  } as any);
  return maybeConfirm(ev, draft.id);
}

async function maybeConfirm(ev: any, entryId: string) {
  const e = unwrap(await sb.from('entries').select('*').eq('id', entryId).single(), 'maybeConfirm.fetch');
  const ready = await isReady(e);
  console.log(`[maybeConfirm] entry=${entryId} amount=${e.amount} ocr_verified=${e.ocr_verified} ready=${ready}`);
  if (ready) {
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
  const rc = await receiptCount(e.id);
  const have: string[] = [];
  if (rc > 0) have.push(`📎 ${rc} รูป`);
  if (e.amount != null) have.push(`฿${Number(e.amount).toLocaleString('en-US')}`);
  const need = e.amount == null ? 'พิมพ์ยอดด้วยนะครับ' : 'แนบรูปบิลด้วยนะครับ';
  const head = have.length ? `รับแล้ว · ${have.join(' · ')}` : 'รับแล้ว';
  return reply(ev.replyToken, [{ type: 'text', text: `${head}\n${need}` }]);
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
    case 'void': {
      const e = unwrap(await sb.from('entries').select('*').eq('id', id).single(), 'void.fetch');
      if (!e || e.status === 'rejected') return reply(ev.replyToken, [{ type: 'text', text: 'รายการนี้ถูกยกเลิกไปแล้วครับ' }]);
      unwrap(await sb.from('entries').update({ status: 'rejected', updated_at: new Date().toISOString() }).eq('id', id), 'void.update');
      await sb.from('audit_log').insert({ entry_id: id, actor: e.payer_id ?? 'system', action: 'voided', before: { status: e.status }, after: { status: 'rejected' } });
      return reply(ev.replyToken, [{ type: 'text', text: `ยกเลิกรายการ ฿${Number(e.amount ?? 0).toLocaleString('en-US')} แล้วครับ\nพิมพ์ยอดผิด? ส่งบิล + ยอดใหม่ได้เลย` }]);
    }
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

  const flags = e.type === 'topup' ? [] : await computeFlags(e); // top-ups don't get expense flags
  const filtered = opts.allowDuplicate ? flags.filter(f => f.kind !== 'duplicate') : flags;

  const status = unwrap(await sb.rpc('confirm_entry', {
    p_entry_id: id,
    p_flags: filtered,
    p_actor: e.payer_id ?? 'system',
  }), 'confirm_entry.rpc');

  const bal = await balanceFor(e.payer_id);

  if (status === 'confirmed') {
    if (e.type === 'topup') {
      return reply(ev.replyToken, [flexMessage('เติมเงินแล้ว', flex.flexTopup({
        amount: Number(e.amount), payer: emp?.nickname ?? emp?.name ?? '-', branch: br?.name ?? '-',
        balance: bal, round: new Date().toLocaleDateString('th-TH', { day: 'numeric', month: 'short' }),
      }))]);
    }
    return reply(ev.replyToken, [flexMessage('บันทึกแล้ว', flex.flexExpenseSuccess({
      id: e.id, amount: Number(e.amount), vendor: e.vendor ?? 'ไม่ระบุ', category: e.category ?? 'อื่นๆ',
      payer: emp?.nickname ?? emp?.name ?? '-', branch: br?.name ?? '-', balance: bal,
      when: new Date().toLocaleString('th-TH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }),
    }))]);
  }

  const flaggedCard = flexMessage('รอตรวจสอบ', flex.flexFlagged({
    id: e.id, amount: Number(e.amount), item: e.description ?? e.vendor ?? '-',
    reason: filtered[0]?.detail ?? 'ตรวจสอบ',
    evidence: e.evidence_type === 'none' ? 'ไม่มีบิล' : 'มีบิล',
    who: emp?.nickname ?? '-', balance: bal,
  }));
  await reply(ev.replyToken, [flaggedCard]);
  if (process.env.ADMIN_GROUP_ID) await push(process.env.ADMIN_GROUP_ID, [flaggedCard]);
}
