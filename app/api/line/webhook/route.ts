import { NextRequest, NextResponse } from 'next/server';
import { verifySignature, reply, push, getMessageContent, flexMessage } from '@/lib/line';
import { sb, unwrap } from '@/lib/supabase';
import {
  draftForNewInput, openAnyDraft, draftAwaitingAmount, attachReceipt, setAmount,
  setEvidenceNone, isReady, touch, newTopup, recentEntries, recentFinalizedEntry, receiptCount,
} from '@/lib/draft-engine';
import { balanceFor } from '@/lib/ledger';
import { pHash, findDuplicate, hamming } from '@/lib/phash';
import { uploadReceipt, signedUrl } from '@/lib/storage';
import { parseText } from '@/lib/parse';
import { findOrRegister, findEmployee } from '@/lib/register';
import { isMentioned, stripMention } from '@/lib/mention';
import { verifySlip } from '@/lib/slip';
import type { SlipResult } from '@/lib/slip';
import * as flex from '@/lib/flex';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (!verifySignature(raw, req.headers.get('x-line-signature'))) {
    return new NextResponse('bad signature', { status: 401 });
  }
  const body = JSON.parse(raw);
  const dest: string | undefined = body.destination; // the receiving bot's own userId
  for (const ev of body.events ?? []) {
    try { await handleEvent(ev, dest); } catch (e) { console.error('event error', e); }
  }
  return NextResponse.json({ ok: true });
}

// LIFF web-app edit link (opens the entry). Falls back to the in-card undo button
// when unset so nothing breaks before the web app is wired.
const EDIT_URL = process.env.LIFF_EDIT_URL || '';
const editUrlFor = (id: string) =>
  EDIT_URL ? `${EDIT_URL}${EDIT_URL.includes('?') ? '&' : '?'}entry=${id}` : undefined;

function recentLabel(x: any) {
  const d = new Date(x.submitted_at).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', timeZone: 'Asia/Bangkok' });
  const name = x.type === 'topup' ? 'เติมเงิน' : (x.vendor || x.category || x.description || 'รายการ');
  return { label: `${name} · ${d}`, amount: Number(x.amount || 0) };
}

async function resolveBranch(ev: any) {
  const gid = ev.source?.groupId;
  if (!gid) return null;
  const { data } = await sb.from('branches').select('*').eq('line_group_id', gid).maybeSingle();
  return data;
}

async function handleEvent(ev: any, dest?: string) {
  if (ev.type === 'message') return handleMessage(ev, dest);
  if (ev.type === 'postback') return handlePostback(ev);
}

// ---------------------------------------------------------------- messages
async function handleMessage(ev: any, dest?: string) {
  const userId = ev.source?.userId;
  if (!userId || !ev.message) return;
  // Only act inside a REGISTERED branch group — never in DMs or other groups.
  const branch = await resolveBranch(ev);
  if (!branch) return;
  if (ev.message.type === 'image') return handleImage(ev, userId, branch);
  if (ev.message.type === 'text') return handleText(ev, userId, branch, dest);
}

async function greet(emp: any, branch: any) {
  if (!emp?.line_user_id) return;
  await push(emp.line_user_id, [{ type: 'text',
    text: `ลงทะเบียนให้แล้วครับ: ${emp.name}${branch ? ' · ' + branch.name : ''}\nพิมพ์ทักบอทตามด้วยรายการ เช่น “@Cammo ค่าน้ำมัน 100” แล้วแนบรูปบิล` }]);
}

const TOPUP_CUE = /เติมเงิน|รับเงินสด|เงินเข้า/i;
// "@Cammo ยอด" / "เช็คยอด" / "คงเหลือ" — show the balance card (no amount involved).
const BALANCE_CUE = /^(เช็ค)?(ยอด(เงิน|คงเหลือ)?|คงเหลือ|กระเป๋า(เงิน)?|ดูยอด)\s*\??$/;

// Balance card (card 10): current float + this-month in/out for the payer.
async function handleBalance(ev: any, userId: string, branch: any) {
  const { employee: emp, justRegistered } = await findOrRegister(userId, branch?.id ?? null, ev.source?.groupId);
  if (!emp) return;
  if (justRegistered) await greet(emp, branch);
  const bal = await balanceFor(emp.id);
  const start = new Date(); start.setDate(1); start.setHours(0, 0, 0, 0);
  const { data: rows } = await sb.from('entries').select('type, amount')
    .eq('payer_id', emp.id).in('status', ['confirmed', 'flagged'])
    .gte('submitted_at', start.toISOString());
  let monthIn = 0, monthOut = 0;
  for (const r of rows ?? []) {
    const a = Number(r.amount || 0);
    if (r.type === 'topup' || r.type === 'return_refund') monthIn += a; else monthOut += a;
  }
  return reply(ev.replyToken, [flexMessage('ยอดคงเหลือ',
    flex.flexBalance({ branch: branch?.name ?? '', balance: bal, monthIn, monthOut }))]);
}

// Text is processed only when the OA is @tagged (mention-gate), OR when the sender
// already has an open draft waiting for its amount (photo-first continuation).
async function handleText(ev: any, userId: string, branch: any, dest?: string) {
  const message = ev.message;
  const mentioned = isMentioned(message, dest);
  const existing = await findEmployee(userId);
  const awaitingAmount = existing ? await draftAwaitingAmount(existing.id) : null;
  if (!mentioned && !awaitingAmount) return; // not addressed, no active flow -> ignore chit-chat

  const text = stripMention(message);

  // "ตั้งชื่อ ป๊อก" — fix the auto-registered LINE display name.
  const nameCmd = text.match(/^\s*ตั้งชื่อ\s+(.{1,40})$/);
  if (nameCmd) {
    const emp = existing ?? await findEmployee(userId);
    if (!emp) return reply(ev.replyToken, [{ type: 'text', text: 'ทักบอทพร้อมรายการสักครั้งเพื่อลงทะเบียนก่อน แล้วค่อยตั้งชื่อได้ครับ' }]);
    const nick = nameCmd[1].trim();
    unwrap(await sb.from('employees').update({ nickname: nick, name: nick }).eq('id', emp.id), 'setName');
    return reply(ev.replyToken, [{ type: 'text', text: `ตั้งชื่อเป็น "${nick}" แล้วครับ` }]);
  }

  // "@Cammo ยอด" — show the balance card.
  if (BALANCE_CUE.test(text)) return handleBalance(ev, userId, branch);

  const parsed = await parseText(text);

  // "@Cammo เติมเงิน 5000" — start a top-up (asks for the slip next).
  if (TOPUP_CUE.test(text) && parsed.amount != null) return handleTopup(ev, userId, branch, parsed.amount);

  if (parsed.amount == null) {
    // Addressed but nothing parseable -> the "อ่านไม่ออก" card (only if @tagged).
    if (mentioned) return reply(ev.replyToken, [flexMessage('อ่านรายการไม่ได้', flex.flexParseFail())]);
    return;
  }

  const { employee: emp, justRegistered } = await findOrRegister(userId, branch?.id ?? null, ev.source?.groupId);
  if (!emp) return;
  if (justRegistered) await greet(emp, branch);

  // Continue the photo-first basket if there is one, else open a fresh basket.
  const draft = awaitingAmount ?? await draftForNewInput(emp.id, branch?.id ?? emp.branch_id);
  await setAmount(draft.id, {
    amount: parsed.amount,
    vendor: parsed.vendor,
    category: parsed.category_name,
    category_code: parsed.category_code,
    description: parsed.description,
  } as any);

  const fresh = unwrap(await sb.from('entries').select('*').eq('id', draft.id).single(), 'handleText.refetch');
  // Photo already here -> save now. Otherwise ask for evidence (with a no-evidence option).
  if (await isReady(fresh)) return finalizeEntry(ev, draft.id);
  return reply(ev.replyToken, [flexMessage('ส่งรูปหลักฐาน',
    flex.flexAskEvidence({ id: draft.id, amount: parsed.amount, category: parsed.category_name ?? 'อื่นๆ' }))]);
}

async function handleTopup(ev: any, userId: string, branch: any, amount: number) {
  const { employee: emp, justRegistered } = await findOrRegister(userId, branch?.id ?? null, ev.source?.groupId);
  if (!emp) return;
  if (justRegistered) await greet(emp, branch);
  const t = await newTopup(emp.id, branch?.id ?? emp.branch_id, amount);
  return reply(ev.replyToken, [flexMessage('ส่งสลิปเติมเงิน', flex.flexTopupAskSlip({ id: t.id, amount }))]);
}

// An image continues whatever draft the sender already opened by @tagging. A photo
// with no open draft is ignored — that keeps the @tag-gate intact (a photo can't
// carry a mention) and prevents stray group photos from creating records.
async function handleImage(ev: any, userId: string, branch: any) {
  const emp = await findEmployee(userId);
  if (!emp) return;
  const draft = await openAnyDraft(emp.id);
  if (!draft) {
    // No open draft: a photo that follows a just-saved entry is another page of the
    // same bill (multi-image) -> attach it to that entry. Otherwise it's a stray
    // group photo -> ignore (keeps the @tag-gate intact).
    const recent = await recentFinalizedEntry(emp.id, 2);
    if (recent) return attachExtraPhoto(ev, recent);
    return;
  }

  const { buf, contentType } = await getMessageContent(ev.message.id);
  const hash = await pHash(buf);

  // Perceptual duplicate (expense receipts only; top-up slips rely on Slip2Go's own dup check).
  if (draft.type === 'expense') {
    const dup = await findDuplicate(hash, 6, 60, draft.amount ?? null);
    if (dup) {
      const prev: any = (dup as any).entries;
      return reply(ev.replyToken, [flexMessage('ตรวจพบรูปซ้ำ', flex.flexRejectedDuplicate({
        id: draft.id,
        amount: draft.amount ?? prev?.amount ?? 0,
        prevDate: prev?.submitted_at ? new Date(prev.submitted_at).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', timeZone: 'Asia/Bangkok' }) : '-',
        prevBy: '-',
        prevItem: prev?.vendor ?? prev?.description ?? '-',
      }))]);
    }
  }

  const path = await uploadReceipt(draft.id, buf, contentType);
  // No OCR: a top-up photo is a transfer slip, an expense photo is a receipt.
  const evidenceType = draft.type === 'topup' ? 'transfer_slip' : 'receipt';
  await attachReceipt(draft.id, path, hash, null, null, evidenceType);

  // Slip verification (top-ups only, per the 13-card design — card 13). Best-effort;
  // Slip2Go needs a fetchable url, so we hand it a short-lived signed url.
  let slip: SlipResult | null = null;
  if (draft.type === 'topup') {
    const url = await signedUrl(path, 600);
    if (url) {
      slip = await verifySlip(url, draft.amount ?? null);
      await sb.from('receipts').update({
        slip_status: slip.status, slip_ref: slip.transRef, slip_raw: slip.raw, slip_checked_at: new Date().toISOString(),
      }).eq('image_url', path);
    }
  }

  const e = unwrap(await sb.from('entries').select('*').eq('id', draft.id).single(), 'handleImage.refetch');
  if (e.amount == null) {
    // Photo landed but still no amount -> ask for it (basket stays open).
    return reply(ev.replyToken, [{ type: 'text', text: 'รับรูปแล้ว พิมพ์ยอดด้วยครับ เช่น “ค่าน้ำมัน 100”' }]);
  }

  // Evidence present -> save now. A suspicious TOP-UP slip is recorded + shown as card 13.
  return finalizeEntry(ev, e.id, { slip });
}

// Attach an extra page/photo to a just-saved entry (multi-image bill). Plain-text
// reply only — no new card. Skips an exact re-send of a photo already on the entry.
async function attachExtraPhoto(ev: any, entry: any) {
  const { buf, contentType } = await getMessageContent(ev.message.id);
  const hash = await pHash(buf);
  const { data: existing } = await sb.from('receipts').select('phash').eq('entry_id', entry.id);
  if (hash && (existing ?? []).some((r: any) => r.phash && hamming(hash, r.phash) <= 6)) {
    return reply(ev.replyToken, [{ type: 'text', text: 'รูปนี้แนบให้รายการนี้ไปแล้วครับ' }]);
  }
  const path = await uploadReceipt(entry.id, buf, contentType);
  unwrap(await sb.from('receipts').insert({ entry_id: entry.id, image_url: path, phash: hash }), 'attachExtraPhoto.insert');
  // A slip on a top-up still gets verified (fraud check), best-effort.
  if (entry.type === 'topup') {
    const url = await signedUrl(path, 600);
    if (url) {
      const slip = await verifySlip(url, entry.amount ?? null);
      await sb.from('receipts').update({ slip_status: slip.status, slip_ref: slip.transRef, slip_raw: slip.raw, slip_checked_at: new Date().toISOString() }).eq('image_url', path);
    }
  }
  const n = await receiptCount(entry.id);
  const item = entry.category ?? entry.vendor ?? (entry.type === 'topup' ? 'เติมเงิน' : 'รายการ');
  return reply(ev.replyToken, [{ type: 'text', text: `📎 เพิ่มรูปที่ ${n} ให้ ${item} ฿${Number(entry.amount ?? 0).toLocaleString('en-US')} แล้วครับ` }]);
}

// ---------------------------------------------------------------- postbacks
async function handlePostback(ev: any) {
  const params = new URLSearchParams(ev.postback.data);
  const action = params.get('action');
  const id = params.get('id');
  if (!id) {
    if (action === 'topup_urgent') return reply(ev.replyToken, [{ type: 'text', text: 'แจ้งฝ่ายบัญชีเติมเงินด่วนแล้วครับ' }]);
    if (action === 'list') return reply(ev.replyToken, [{ type: 'text', text: EDIT_URL ? `ดูรายการทั้งหมดในเว็บแอป:\n${EDIT_URL}` : 'เปิดดูรายการทั้งหมดได้ที่เว็บแอปครับ' }]);
    return;
  }

  switch (action) {
    // ดูรายละเอียด / ดูรายการ (เดิม) — open the entry in the web app.
    case 'view':
      return reply(ev.replyToken, [{ type: 'text', text: editUrlFor(id) ? `เปิดดูรายการในเว็บแอป:\n${editUrlFor(id)}` : 'เปิดดูรายการได้ที่เว็บแอปครับ' }]);
    case 'no_evidence':
      await setEvidenceNone(id);
      return finalizeEntry(ev, id);
    case 'confirm':
    case 'use_typed': // card 13 "ยืนยันเอง" — accept the typed amount as-is
      return finalizeEntry(ev, id);
    case 'second_installment':
      return finalizeEntry(ev, id, { allowDuplicate: true });
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
      return reply(ev.replyToken, [{ type: 'text', text: `ยกเลิกรายการ ฿${Number(e.amount ?? 0).toLocaleString('en-US')} แล้วครับ\nพิมพ์ยอดผิด? ทักบอทพร้อมยอดใหม่ได้เลย` }]);
    }
    case 'split':
      return reply(ev.replyToken, [{ type: 'text', text: 'โหมดแยกรายการ: ทักบอทพร้อมยอดของใบนั้น แล้วแนบบิลทีละใบได้เลยครับ' }]);
    default:
      return reply(ev.replyToken, [{ type: 'text', text: `รับคำสั่ง: ${action}` }]);
  }
}

// Atomically confirm a draft (status + flags + audit via RPC), then reply the
// success/flagged card. The reply lands in the branch group (events are gated to
// branch groups) — that IS the Sunlight in-group post for new entries. Web edits
// use postToBranchGroup() separately since they have no reply token.
async function finalizeEntry(ev: any, id: string, opts: { allowDuplicate?: boolean; slip?: SlipResult | null } = {}) {
  const { data: e } = await sb.from('entries').select('*').eq('id', id).maybeSingle();
  if (!e) return;
  if (e.status !== 'draft') return; // already finalized (double-tap) -> ignore

  const { data: emp } = await sb.from('employees').select('*').eq('id', e.payer_id).maybeSingle();
  const { data: br } = await sb.from('branches').select('*').eq('id', e.branch_id).maybeSingle();

  // Per the 13-card design there is NO generic "risk flag" card. Expenses always
  // show the success card (card 2 with evidence / card 3 without). The only flagged
  // path is a suspicious TOP-UP slip -> card 13.
  const flags: { kind: string; detail: string }[] = [];
  if (opts.slip && (opts.slip.status === 'fail' || opts.slip.status === 'warning')) {
    flags.push({ kind: 'slip_invalid', detail: opts.slip.note || 'สลิปไม่ผ่านการตรวจ' });
  }

  unwrap(await sb.rpc('confirm_entry', {
    p_entry_id: id, p_flags: flags, p_actor: e.payer_id ?? 'system',
  }), 'confirm_entry.rpc');

  const bal = await balanceFor(e.payer_id);
  const recent = (await recentEntries(e.payer_id, e.type === 'topup' ? 'topup' : 'expense')).map(recentLabel);
  const editUrl = editUrlFor(e.id);

  const slipFlag = flags.find(f => f.kind === 'slip_invalid');
  let card: any;
  if (slipFlag) {
    // สลิปน่าสงสัย (card 13) — top-up recorded but flagged; owner alerted below.
    card = flexMessage('พบสลิปน่าสงสัย', flex.flexSuspiciousSlip({
      id: e.id, amount: Number(e.amount), item: e.description ?? e.vendor ?? 'เติมเงิน',
      reason: slipFlag.detail, who: emp?.nickname ?? '-', balance: bal,
    }));
  } else if (e.type === 'topup') {
    card = flexMessage('เติมเงินแล้ว', flex.flexTopup({
      id: e.id, amount: Number(e.amount), payer: emp?.nickname ?? emp?.name ?? '-', branch: br?.name ?? '-',
      balance: bal, round: new Date().toLocaleString('th-TH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok' }), recent, editUrl,
    }));
  } else {
    card = flexMessage('บันทึกแล้ว', flex.flexExpenseSuccess({
      id: e.id, amount: Number(e.amount), vendor: e.vendor ?? 'ไม่ระบุ', category: e.category ?? 'อื่นๆ',
      payer: emp?.nickname ?? emp?.name ?? '-', branch: br?.name ?? '-', balance: bal,
      when: new Date().toLocaleString('th-TH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok' }),
      evidence: e.evidence_type ?? undefined, recent, editUrl,
    }));
  }

  await reply(ev.replyToken, [card]);
  if (slipFlag && process.env.ADMIN_GROUP_ID) await push(process.env.ADMIN_GROUP_ID, [card]);
}
