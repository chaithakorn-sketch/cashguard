import { sb, unwrap } from './supabase';

// Resolve a LIFF web-app caller to a CashGuard employee.
// The frontend sends the LINE LIFF access token (liff.getAccessToken()) as
//   Authorization: Bearer <token>
// We exchange it for the LINE profile (userId) and map to our employees table.
// Returns null when the header is missing/invalid.
export interface LiffUser { userId: string; employee: any | null; }

export async function resolveLiffUser(req: Request): Promise<LiffUser | null> {
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!token) return null;
  const res = await fetch('https://api.line.me/v2/profile', { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) return null;
  const profile = await res.json().catch(() => null);
  const userId = profile?.userId;
  if (!userId) return null;
  const employee = unwrap(
    await sb.from('employees').select('*').eq('line_user_id', userId).maybeSingle(),
    'resolveLiffUser'
  );
  return { userId, employee: employee ?? null };
}
