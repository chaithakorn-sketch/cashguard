import { sb } from './supabase';

// Perceptual hash for duplicate-receipt detection.
// TODO: implement pHash (e.g. sharp + DCT) — returning a stable hex string.
export async function pHash(_image: Buffer): Promise<string | null> {
  // const hash = computeDctHash(_image);
  return null;
}

/** Hamming distance helper for hex pHash strings. */
export function hamming(a: string, b: string): number {
  if (a.length !== b.length) return Infinity;
  let d = 0;
  for (let i = 0; i < a.length; i++) {
    let x = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    while (x) { d += x & 1; x >>= 1; }
  }
  return d;
}

/** Look up an existing receipt with a near-identical hash (<= threshold). */
export async function findDuplicate(hash: string | null, threshold = 6) {
  if (!hash) return null;
  const { data } = await sb.from('receipts').select('id, entry_id, phash, uploaded_at').not('phash','is',null);
  for (const r of data ?? []) {
    if (r.phash && hamming(hash, r.phash) <= threshold) return r;
  }
  return null;
}
