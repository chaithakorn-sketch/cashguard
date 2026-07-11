/* DEV-ONLY: renders ONE card header at 1080x396 (3x of the 360x132 mockup) so it
   can be screenshotted into a hero image. Exact port of the 3b mockup header CSS. */
export const dynamic = 'force-dynamic';

const S = 3; // scale
const HEADERS: { name: string; eyebrow: string; title: string; pose: string; right?: number }[] = [
  { name: 'ask-evidence', eyebrow: 'รายจ่าย', title: 'ขอหลักฐาน', pose: 'welcome' },
  { name: 'success-expense', eyebrow: 'รายจ่าย', title: 'บันทึกสำเร็จ', pose: 'thumbsup', right: -6 },
  { name: 'ask-slip', eyebrow: 'เติมเงิน', title: 'ขอสลิปโอนเงิน', pose: 'welcome' },
  { name: 'success-topup', eyebrow: 'รายรับ', title: 'เติมเงินสำเร็จ', pose: 'growth', right: -10 },
  { name: 'group-expense', eyebrow: 'แจ้งเข้ากลุ่ม', title: 'ค่าใช้จ่ายใหม่', pose: 'checklist' },
  { name: 'group-topup', eyebrow: 'แจ้งเข้ากลุ่ม', title: 'เติมเงินใหม่', pose: 'growth', right: -10 },
  { name: 'group-edit', eyebrow: 'แจ้งเข้ากลุ่ม', title: 'มีการแก้ไข', pose: 'growth', right: -10 },
  { name: 'parse-fail', eyebrow: 'ระบบ', title: 'อ่านรายการไม่ได้', pose: 'warn' },
  { name: 'balance', eyebrow: 'กระเป๋าเงิน', title: 'ยอดคงเหลือ', pose: 'checklist' },
  { name: 'expired', eyebrow: 'ระบบ', title: 'รายการหมดอายุ', pose: 'wait' },
  { name: 'duplicate', eyebrow: 'ความปลอดภัย', title: 'ตรวจพบรูปซ้ำ', pose: 'inspect' },
  { name: 'suspicious', eyebrow: 'ความปลอดภัย', title: 'พบสลิปน่าสงสัย', pose: 'inspect' },
];

export default function HeaderGen({ searchParams }: { searchParams: { i?: string } }) {
  const h = HEADERS[Number(searchParams.i ?? 0)] || HEADERS[0];
  const right = (h.right ?? -8) * S;
  return (
    <div style={{ boxSizing: 'border-box', margin: 0, width: 360 * S, height: 132 * S, position: 'relative', background: '#DA1B27', overflow: 'hidden',
      padding: `${14 * S}px ${18 * S}px`, display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
      fontFamily: "-apple-system,BlinkMacSystemFont,'SF Pro Text','Helvetica Neue',Arial,sans-serif" }}>
      {/* pill */}
      <div style={{ display: 'inline-flex', alignSelf: 'flex-start', alignItems: 'center', gap: 6 * S, background: '#fff',
        padding: `${4 * S}px ${11 * S}px ${4 * S}px ${7 * S}px`, borderRadius: 999, position: 'relative', zIndex: 2, boxShadow: `0 ${1 * S}px ${3 * S}px rgba(0,0,0,.14)` }}>
        <img src="/cashguard/cammo/logo-carcam-red.png" alt="" style={{ height: 18 * S, width: 18 * S, objectFit: 'contain' }} />
        <span style={{ fontSize: 12 * S, fontWeight: 800, color: '#DA1B27', letterSpacing: '.01em' }}>Carcamstore</span>
      </div>
      {/* title block */}
      <div style={{ position: 'relative', zIndex: 2, maxWidth: 205 * S }}>
        <div style={{ fontSize: 12 * S, fontWeight: 700, letterSpacing: '.12em', color: 'rgba(255,255,255,.8)' }}>{h.eyebrow}</div>
        <div style={{ fontSize: 27 * S, fontWeight: 800, color: '#fff', lineHeight: 1.02, marginTop: 2 * S }}>{h.title}</div>
      </div>
      {/* cammo (bleeds off top-right, like the mockup) */}
      <img src={`/cashguard/cammo-hd/${h.pose}.png`} alt="" style={{ position: 'absolute', right, top: -2 * S, height: 158 * S, width: 'auto', zIndex: 1 }} />
    </div>
  );
}
