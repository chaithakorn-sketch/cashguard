import { sb } from './supabase';
import type { FlagKind } from './types';

const TOLERANCE_ABS = 5;      // ±5 บาท
const TOLERANCE_PCT = 0.02;   // หรือ ±2%
const NO_BILL_FREQ_LIMIT = 3; // ค่าวิน/ไม่มีบิล เกินกี่ครั้งต่อวันถึง flag

export interface FlagResult { kind: FlagKind; detail: string; }

/**
 * Compute risk flags for an entry at confirm time.
 * Returns the list of flags; empty list => clean (status can be 'confirmed').
 */
export async function computeFlags(entry: any, opts: { duplicateOf?: any } = {}): Promise<FlagResult[]> {
  const flags: FlagResult[] = [];

  // 1) duplicate image (decided upstream via phash lookup)
  if (opts.duplicateOf) {
    flags.push({ kind: 'duplicate', detail: `ซ้ำกับรายการ ${opts.duplicateOf.id}` });
  }

  // 2) backdated: spent_at older than 24h before submitted_at
  if (entry.spent_at) {
    const gapMs = new Date(entry.submitted_at).getTime() - new Date(entry.spent_at).getTime();
    if (gapMs > 24 * 3600 * 1000) {
      flags.push({ kind: 'backdated', detail: 'บิลเก่ากว่า 24 ชม.' });
    }
  }

  // 3) OCR mismatch
  if (entry.ocr_amount != null && entry.amount != null) {
    const diff = Number(entry.amount) - Number(entry.ocr_amount);
    const tol = Math.max(TOLERANCE_ABS, Number(entry.ocr_amount) * TOLERANCE_PCT);
    if (diff > tol)      flags.push({ kind: 'ocr_over',  detail: 'พิมพ์ยอดสูงกว่าบิล' });
    else if (-diff > tol) flags.push({ kind: 'ocr_under', detail: 'พิมพ์ยอดต่ำกว่าบิล (เบิกบางส่วน?)' });
  } else if (!entry.ocr_verified) {
    flags.push({ kind: 'unverified', detail: 'OCR อ่านยอดไม่ได้' });
  }

  // 4) no-bill category frequency (today, same payer)
  if (entry.evidence_type === 'none' || entry.evidence_type === 'transfer_slip') {
    const since = new Date(); since.setHours(0,0,0,0);
    const { count } = await sb.from('entries')
      .select('id', { count: 'exact', head: true })
      .eq('payer_id', entry.payer_id)
      .in('evidence_type', ['none','transfer_slip'])
      .gte('submitted_at', since.toISOString());
    if ((count ?? 0) >= NO_BILL_FREQ_LIMIT) {
      flags.push({ kind: 'no_bill_freq', detail: `ไม่มีบิลครั้งที่ ${(count ?? 0) + 1} วันนี้` });
    }
  }

  // 5) cross-branch: payer's branch != entry branch
  // 6) off-hours: submitted outside 08:00–20:00 (Asia/Bangkok)
  const hr = new Date(entry.submitted_at).getUTCHours() + 7; // ICT
  const localHr = ((hr % 24) + 24) % 24;
  if (localHr < 8 || localHr >= 20) flags.push({ kind: 'off_hours', detail: 'ส่งนอกเวลางาน' });

  return flags;
}

export async function saveFlags(entryId: string, flags: FlagResult[]) {
  if (!flags.length) return;
  await sb.from('flags').insert(flags.map(f => ({ entry_id: entryId, kind: f.kind, detail: f.detail })));
}
