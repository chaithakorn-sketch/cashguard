import sharp from 'sharp';
import { sb } from './supabase';

// 64-bit DCT perceptual hash -> 16-char hex. Robust to resize / mild light/crop.
export async function pHash(image: Buffer): Promise<string | null> {
  try {
    const N = 32;
    const { data } = await sharp(image).grayscale().resize(N, N, { fit: 'fill' })
      .raw().toBuffer({ resolveWithObject: true });
    // build pixel matrix
    const px: number[][] = [];
    for (let y = 0; y < N; y++) { px[y] = []; for (let x = 0; x < N; x++) px[y][x] = data[y * N + x]; }
    // 2D DCT, keep top-left 8x8
    const M = 8;
    const dct: number[][] = [];
    for (let u = 0; u < M; u++) {
      dct[u] = [];
      for (let v = 0; v < M; v++) {
        let sum = 0;
        for (let y = 0; y < N; y++) for (let x = 0; x < N; x++)
          sum += px[y][x] * Math.cos(((2 * x + 1) * u * Math.PI) / (2 * N)) * Math.cos(((2 * y + 1) * v * Math.PI) / (2 * N));
        const cu = u === 0 ? 1 / Math.SQRT2 : 1, cv = v === 0 ? 1 / Math.SQRT2 : 1;
        dct[u][v] = 0.25 * cu * cv * sum;
      }
    }
    // median of the 64 coeffs (exclude DC at [0][0])
    const vals: number[] = [];
    for (let u = 0; u < M; u++) for (let v = 0; v < M; v++) if (!(u === 0 && v === 0)) vals.push(dct[u][v]);
    const med = vals.slice().sort((a, b) => a - b)[vals.length >> 1];
    // bits
    let bits = '';
    for (let u = 0; u < M; u++) for (let v = 0; v < M; v++) bits += dct[u][v] > med ? '1' : '0';
    // -> hex
    let hex = '';
    for (let i = 0; i < 64; i += 4) hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
    return hex;
  } catch (e) {
    console.error('pHash error', e);
    return null;
  }
}

export function hamming(a: string, b: string): number {
  if (a.length !== b.length) return Infinity;
  let d = 0;
  for (let i = 0; i < a.length; i++) {
    let x = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    while (x) { d += x & 1; x >>= 1; }
  }
  return d;
}

/**
 * Find an existing receipt that is really the same one.
 * pHash alone is too coarse for bank transfer slips — every slip from the same
 * app shares a near-identical template (logo, layout) and only differs in small
 * text, so two genuinely different slips land within Hamming distance. We therefore
 * confirm a perceptual match with the OCR amount: same look + same amount = re-send;
 * same look + different amount = different slip, not a duplicate.
 * Also limited to `windowDays` (an identical look months ago is a template coincidence).
 */
export async function findDuplicate(hash: string | null, threshold = 6, windowDays = 60, amount: number | null = null) {
  if (!hash) return null;
  const since = new Date(Date.now() - windowDays * 86400_000).toISOString();
  const { data } = await sb.from('receipts')
    .select('id, entry_id, phash, uploaded_at, entries(id, amount, vendor, description, payer_id, status, submitted_at)')
    .not('phash', 'is', null)
    .gte('uploaded_at', since);
  for (const r of data ?? []) {
    if (!r.phash || hamming(hash, r.phash) > threshold) continue;
    const prevAmt = (r as any).entries?.amount;
    if (amount != null && prevAmt != null) {
      const tol = Math.max(1, Number(prevAmt) * 0.01);
      if (Math.abs(Number(amount) - Number(prevAmt)) > tol) continue; // different amount -> not the same slip
    }
    return r;
  }
  return null;
}
