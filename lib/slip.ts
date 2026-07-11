// Slip verification adapter. Default provider = Slip2Go (the same service the
// CarcamStore POS already uses — reuse the same account/key). Slip2Go fetches the
// image itself, so callers must pass a PUBLIC/SIGNED url (never a data: uri).
// With no key configured this returns { status:'pending' } and thus behaves as a
// no-op stub until SLIP2GO_API_KEY is set on Vercel.
//
// Swap providers by adding another implementation behind verifySlip() — the rest
// of the app only depends on the SlipResult shape below.
export type SlipStatus = 'pass' | 'warning' | 'fail' | 'pending';

export interface SlipResult {
  status: SlipStatus;
  responseCode?: string;
  transRef?: string;        // bank reference (dedupe / audit)
  referenceId?: string;
  amount?: number | null;   // amount Slip2Go read off the slip
  sender?: string;
  recipient?: string;
  matchAmount?: boolean;
  matchRecipient?: boolean | null;
  matchDate?: boolean;
  note?: string;            // human-readable issue summary ('' when clean)
  raw?: any;
}

// Slip2Go response code -> coarse status (mirrors the POS mapping).
const STATUS_MAP: Record<string, SlipStatus> = {
  '200200': 'pass', '200000': 'pass', '200001': 'pass',
  '200401': 'warning', '200402': 'fail', '200403': 'warning',
  '200404': 'fail', '200500': 'fail', '200501': 'fail',
};

export async function verifySlip(imageUrl: string, expectedAmount?: number | null): Promise<SlipResult> {
  const key = process.env.SLIP2GO_API_KEY;
  if (!key) return { status: 'pending', note: 'ไม่มี Slip2Go API Key' };
  if (!imageUrl || imageUrl.startsWith('data:')) return { status: 'pending', note: 'ไม่มี URL สลิป' };
  try {
    const res = await fetch('https://connect.slip2go.com/api/verify-slip/qr-image-link/info', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ payload: { imageUrl, checkCondition: { checkDuplicate: true } } }),
    });
    if (!res.ok) {
      if (res.status === 401) return { status: 'pending', note: 'Slip2Go: Token ไม่ถูกต้อง' };
      if (res.status === 429) return { status: 'pending', note: 'Slip2Go: rate limit' };
      return { status: 'pending', note: `Slip2Go error: ${res.status}` };
    }
    const data = await res.json();
    const code: string = data.code || '';
    const msg: string = data.message || '';
    const d = data.data || {};
    const base: SlipStatus = STATUS_MAP[code] || (code.startsWith('2') ? 'warning' : 'pending');

    const actual = d.amount != null ? Number(d.amount) : null;
    const exp = Number(expectedAmount) || 0;
    const matchAmount = actual != null && exp > 0 ? Math.abs(actual - exp) < 1 : code === '200200';
    let matchDate = code === '200200';
    if (d.dateTime) { try { matchDate = (Date.now() - new Date(d.dateTime).getTime()) < 10 * 60 * 1000; } catch { matchDate = false; } }
    const matchRecipient = code === '200200' ? true : code === '200401' ? false : null;

    const issues: string[] = [];
    if (!matchAmount && actual != null) issues.push('ยอดเงินไม่ตรง');
    if (matchRecipient === false) issues.push('บัญชีผู้รับไม่ตรง');
    if (!matchDate && d.dateTime) issues.push('สลิปล่าช้าเกิน 10 นาที');
    if (code === '200500') issues.push('สลิปเสีย/สลิปปลอม');
    if (code === '200501') issues.push('สลิปซ้ำ');
    if (code === '200404') issues.push('ไม่พบสลิป/หมดอายุ');

    const status: SlipStatus =
      ((!matchAmount && actual != null) || code === '200500' || code === '200501' || code === '200404') ? 'fail'
      : ((matchRecipient === false) || code === '200401' || code === '200403') ? 'warning'
      : base;

    return {
      status, responseCode: code, transRef: d.transRef || '', referenceId: d.referenceId || '',
      amount: actual, sender: d.sender?.account?.name || '', recipient: d.receiver?.account?.name || '',
      matchAmount, matchRecipient, matchDate,
      note: code === '200200' ? '' : (issues.join(' · ') || msg),
      raw: data,
    };
  } catch (e) {
    console.error('[slip] error', e);
    return { status: 'pending', note: 'Network error' };
  }
}
