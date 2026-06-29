import { sb } from './supabase';

const BUCKET = 'cashguard-receipts';

/** Upload a receipt image buffer; returns the storage path. */
export async function uploadReceipt(entryId: string, buf: Buffer, contentType = 'image/jpeg'): Promise<string> {
  const ext = contentType.includes('png') ? 'png' : 'jpg';
  const path = `${entryId}/${Date.now()}.${ext}`;
  const { error } = await sb.storage.from(BUCKET).upload(path, buf, { contentType, upsert: false });
  if (error) throw error;
  return path; // stored in receipts.image_url
}

/** Signed URL for viewing in the dashboard (private bucket). */
export async function signedUrl(path: string, expiresSec = 3600): Promise<string | null> {
  const { data } = await sb.storage.from(BUCKET).createSignedUrl(path, expiresSec);
  return data?.signedUrl ?? null;
}
