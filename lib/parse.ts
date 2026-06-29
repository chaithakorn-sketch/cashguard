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

/**
 * Parse a free-text message into amount + vendor + category guess.
 * Amount = first number. Vendor/category inferred from alias keywords.
 */
export async function parseText(text: string): Promise<Parsed> {
  await loadRefs();
  const lower = text.toLowerCase();
  const m = text.replace(/,/g, '').match(/(\d+(?:\.\d{1,2})?)/);
  const amount = m ? Number(m[1]) : undefined;

  let vendor: string | undefined, category_code: string | undefined;
  for (const a of aliasCache!) {
    if (lower.includes(a.alias.toLowerCase())) {
      vendor = a.canonical;
      category_code = a.category_code ?? undefined;
      break;
    }
  }
  const description = text.replace(/(\d+(?:\.\d{1,2})?)/, '').trim() || undefined;
  return {
    amount, vendor, category_code,
    category_name: category_code ? catCache![category_code] : undefined,
    description,
  };
}
