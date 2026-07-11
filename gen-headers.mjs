import sharp from 'sharp';
import { readFileSync, mkdirSync } from 'fs';

const S = 4;                 // scale (mockup 360x132 -> 1440x528)
const W = 360 * S, H = 132 * S;
const OUT = 'public/cashguard/headers';
mkdirSync(OUT, { recursive: true });

const b64 = (p) => 'data:image/png;base64,' + readFileSync(p).toString('base64');
const LOGO = b64('public/cashguard/cammo/logo-carcam-red.png');
const cammo = (pose) => b64(`public/cashguard/cammo-hd/${pose}.png`);

const HEADERS = [
  { name: 'ask-evidence', eyebrow: 'รายจ่าย', title: 'ขอหลักฐาน', pose: 'welcome', right: -8 },
  { name: 'success-expense', eyebrow: 'รายจ่าย', title: 'บันทึกสำเร็จ', pose: 'thumbsup', right: -6 },
  { name: 'ask-slip', eyebrow: 'เติมเงิน', title: 'ขอสลิปโอนเงิน', pose: 'welcome', right: -8 },
  { name: 'success-topup', eyebrow: 'รายรับ', title: 'เติมเงินสำเร็จ', pose: 'growth', right: -10 },
  { name: 'group-expense', eyebrow: 'แจ้งเข้ากลุ่ม', title: 'ค่าใช้จ่ายใหม่', pose: 'checklist', right: -8 },
  { name: 'group-topup', eyebrow: 'แจ้งเข้ากลุ่ม', title: 'เติมเงินใหม่', pose: 'growth', right: -10 },
  { name: 'group-edit', eyebrow: 'แจ้งเข้ากลุ่ม', title: 'มีการแก้ไข', pose: 'growth', right: -10 },
  { name: 'parse-fail', eyebrow: 'ระบบ', title: 'อ่านรายการไม่ได้', pose: 'warn', right: -8 },
  { name: 'balance', eyebrow: 'กระเป๋าเงิน', title: 'ยอดคงเหลือ', pose: 'checklist', right: -8 },
  { name: 'expired', eyebrow: 'ระบบ', title: 'รายการหมดอายุ', pose: 'wait', right: -8 },
  { name: 'duplicate', eyebrow: 'ความปลอดภัย', title: 'ตรวจพบรูปซ้ำ', pose: 'inspect', right: -8 },
  { name: 'suspicious', eyebrow: 'ความปลอดภัย', title: 'พบสลิปน่าสงสัย', pose: 'inspect', right: -8 },
];

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const FONT = "'Sukhumvit Set','Thonburi','Noto Sans Thai',sans-serif";

// pill geometry (×S)
const pillH = 26 * S, pillX = 18 * S, pillY = 14 * S, pillR = pillH / 2;
const logoSz = 18 * S, pillPadL = 7 * S, pillPadR = 11 * S, gap = 6 * S;
const pillTextSize = 12 * S;
const pillTextW = pillTextSize * 0.62 * 'Carcamstore'.length; // estimate
const pillW = pillPadL + logoSz + gap + pillTextW + pillPadR;
const logoX = pillX + pillPadL, logoY = pillY + (pillH - logoSz) / 2;
const pillTextX = logoX + logoSz + gap, pillTextBaseline = pillY + pillH / 2 + pillTextSize * 0.35;

// title block (bottom-left)
const eyebrowSize = 12 * S, titleSize = 27 * S, blockX = 18 * S;
const titleBaseline = H - 14 * S - 10;         // near bottom padding
const eyebrowBaseline = titleBaseline - titleSize - 6 * S;

const cammoH = 158 * S;

for (const h of HEADERS) {
  const cx = W - (h.right * S) - cammoH; // square cammo => width == height
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}">
  <rect width="100%" height="100%" fill="#DA1B27"/>
  <image xlink:href="${cammo(h.pose)}" x="${cx}" y="${-2 * S}" height="${cammoH}" width="${cammoH}"/>
  <rect x="${pillX}" y="${pillY}" width="${pillW}" height="${pillH}" rx="${pillR}" fill="#ffffff"/>
  <image xlink:href="${LOGO}" x="${logoX}" y="${logoY}" width="${logoSz}" height="${logoSz}"/>
  <text x="${pillTextX}" y="${pillTextBaseline}" font-family="${FONT}" font-size="${pillTextSize}" font-weight="800" fill="#DA1B27">Carcamstore</text>
  <text x="${blockX}" y="${eyebrowBaseline}" font-family="${FONT}" font-size="${eyebrowSize}" font-weight="700" letter-spacing="${0.12 * eyebrowSize}" fill="#ffffff" opacity="0.85">${esc(h.eyebrow)}</text>
  <text x="${blockX}" y="${titleBaseline}" font-family="${FONT}" font-size="${titleSize}" font-weight="800" fill="#ffffff">${esc(h.title)}</text>
</svg>`;
  await sharp(Buffer.from(svg)).resize(1080).png({ compressionLevel: 9, quality: 88 }).toFile(`${OUT}/${h.name}.png`);
  console.log('✓', h.name);
}
console.log('done', HEADERS.length, 'headers');
