import { sb } from './supabase';

export interface Parsed {
  amount?: number;
  vendor?: string;
  category_code?: string;
  category_name?: string;
  description?: string;
}

let aliasCache: { alias: string; canonical: string; category_code: string | null }[] | null = null;
let catCache: Record<string, string> | null = null;

async function loadRefs() {
  if (!aliasCache) {
    const { data } = await sb.from('vendor_aliases').select('alias,canonical,category_code');
    aliasCache = data ?? [];
  }
  if (!catCache) {
    const { data } = await sb.from('categories').select('code,name');
    catCache = Object.fromEntries((data ?? []).map((c: any) => [c.code, c.name]));
  }
}

// Quantity units that follow a COUNT, not a price ("3 ชิ้น", "2 รอบ").
const QTY_UNIT = /^\s*(ชิ้น|อัน|รอบ|กล่อง|ใบ|ครั้ง|คน|ที่|ขวด|แก้ว|ลัง|ชุด|กล่อง|แพ็ค|โหล|กก|กิโล|ลิตร)/;

/**
 * Pick the spend amount from free text. First-number-wins (the old behaviour)
 * grabbed quantities/phone numbers/dates — "ค่าวิน 2 รอบ 80" returned 2.
 * Priority: (1) a number glued to ฿/บาท, else (2) the largest plausible number
 * after dropping phone-like (9+ digits), date/time, and quantity counts.
 * Exported pure so it can be unit-tested without the DB.
 */
export function extractAmount(text: string): number | undefined {
  const t = text.replace(/,/g, '');

  // 1) number adjacent to a currency marker — strongest signal
  const cur = t.match(/(?:฿|บาท|thb)\s*(\d+(?:\.\d{1,2})?)|(\d+(?:\.\d{1,2})?)\s*(?:฿|บาท|thb)/i);
  if (cur) {
    const n = Number(cur[1] ?? cur[2]);
    if (isFinite(n) && n > 0) return n;
  }

  // 2) collect candidates, drop quantities / phone / date / time
  const candidates: number[] = [];
  const re = /\d+(?:\.\d{1,2})?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(t))) {
    const raw = m[0];
    const n = Number(raw);
    if (!isFinite(n) || n <= 0 || n >= 1_000_000) continue;             // 0/neg or absurd (petty cash)
    if (/^\d{9,}$/.test(raw)) continue;                                  // phone-like
    const before = t[m.index - 1] ?? '';
    const after = t.slice(m.index + raw.length, m.index + raw.length + 8);
    if (before === '/' || before === ':' || /^[/:]/.test(after)) continue; // date/time part
    if (QTY_UNIT.test(after)) continue;                                 // a count, not a price
    candidates.push(n);
  }
  if (!candidates.length) return undefined;
  return Math.max(...candidates); // the price is normally the largest remaining number
}

/**
 * Parse a free-text message into amount + vendor + category guess.
 * Vendor/category inferred from alias keywords in the DB.
 */
export async function parseText(text: string): Promise<Parsed> {
  await loadRefs();
  const lower = text.toLowerCase();
  const amount = extractAmount(text);

  let vendor: string | undefined, category_code: string | undefined;
  for (const a of aliasCache!) {
    if (lower.includes(a.alias.toLowerCase())) {
      vendor = a.canonical;
      category_code = a.category_code ?? undefined;
      break;
    }
  }
  const description = text
    .replace(/\d+(?:[.,]\d+)?/g, '')
    .replace(/฿|บาท|thb/gi, '')
    .replace(/\s+/g, ' ')
    .trim() || undefined;
  return {
    amount, vendor, category_code,
    category_name: category_code ? catCache![category_code] : undefined,
    description,
  };
}
