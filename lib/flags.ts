import { sb } from './supabase';
import type { FlagKind } from './types';

const TOLERANCE_ABS = 5;       // ±5 บาท
const TOLERANCE_PCT = 0.02;    // หรือ ±2%
const NO_BILL_FREQ_LIMIT = 3;  // ไม่มีบิลเกินกี่ครั้ง/วัน ถึง flag

export interface FlagResult { kind: FlagKind; detail: string; }

/** Compute risk flags for an entry at confirm time. Empty => clean. */
export async function computeFlags(entry: any, opts: { duplicateOf?: any } = {}): Promise<FlagResult[]> {
  const flags: FlagResult[] = [];

  // 1) duplicate image
  if (opts.duplicateOf) flags.push({ kind: 'duplicate', detail: 'รูปบิลซ้ำกับรายการก่อนหน้า' });

  // 2) backdated (>24h between spent_at and submitted_at)
  if (entry.spent_at) {
    const gap = new Date(entry.submitted_at).getTime() - new Date(entry.spent_at).getTime();
    if (gap > 24 * 3600 * 1000) flags.push({ kind: 'backdated', detail: 'บิลเก่ากว่า 24 ชม.' });
  }

  // 3) OCR mismatch
  if (entry.ocr_amount != null && entry.amount != null) {
    const diff = Number(entry.amount) - Number(entry.ocr_amount);
    const tol = Math.max(TOLERANCE_ABS, Number(entry.ocr_amount) * TOLERANCE_PCT);
    if (diff > tol) flags.push({ kind: 'ocr_over', detail: 'พิมพ์ยอดสูงกว่าบิล' });
    else if (-diff > tol) flags.push({ kind: 'ocr_under', detail: 'พิมพ์ยอดต่ำกว่าบิล (เบิกบางส่วน?)' });
  } else if (!entry.ocr_verified) {
    flags.push({ kind: 'unverified', detail: 'OCR อ่านยอดไม่ได้' });
  }

  // 4) no-bill frequency (same payer, today)
  if (entry.evidence_type === 'none' || entry.evidence_type === 'transfer_slip') {
    const since = new Date(); since.setHours(0, 0, 0, 0);
    const { count } = await sb.from('entries')
      .select('id', { count: 'exact', head: true })
      .eq('payer_id', entry.payer_id)
      .in('evidence_type', ['none', 'transfer_slip'])
      .gte('submitted_at', since.toISOString());
    if ((count ?? 0) >= NO_BILL_FREQ_LIMIT)
      flags.push({ kind: 'no_bill_freq', detail: `ไม่มีบิลครั้งที่ ${(count ?? 0) + 1} วันนี้` });
  }

  // 5) over category cap
  if (entry.category_code && entry.amount != null) {
    const { data: cat } = await sb.from('categories').select('cap_per_txn,name').eq('code', entry.category_code).maybeSingle();
    if (cat?.cap_per_txn != null && Number(entry.amount) > Number(cat.cap_per_txn))
      flags.push({ kind: 'over_cap', detail: `เกินเพดาน ${cat.name} (${cat.cap_per_txn}฿)` });
  }

  // 6) cross-branch (payer's home branch != entry branch)
  if (entry.payer_id && entry.branch_id) {
    const { data: emp } = await sb.from('employees').select('branch_id').eq('id', entry.payer_id).maybeSingle();
    if (emp?.branch_id && emp.branch_id !== entry.branch_id)
      flags.push({ kind: 'cross_branch', detail: 'จ่ายแทนสาขาอื่น' });
  }

  // 7) off-hours (outside 08:00–20:00 ICT)
  const localHr = (((new Date(entry.submitted_at).getUTCHours() + 7) % 24) + 24) % 24;
  if (localHr < 8 || localHr >= 20) flags.push({ kind: 'off_hours', detail: 'ส่งนอกเวลางาน' });

  return flags;
}
