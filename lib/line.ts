import crypto from 'crypto';

const TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN!;
const SECRET = process.env.LINE_CHANNEL_SECRET!;
const API = 'https://api.line.me/v2/bot';

export function verifySignature(rawBody: string, signature: string | null): boolean {
  if (!signature) return false;
  const hmac = crypto.createHmac('SHA256', SECRET).update(rawBody).digest('base64');
  const a = Buffer.from(hmac), b = Buffer.from(signature);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function reply(replyToken: string, messages: any[]) {
  await fetch(`${API}/message/reply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({ replyToken, messages }),
  });
}

export async function push(to: string, messages: any[]) {
  await fetch(`${API}/message/push`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({ to, messages }),
  });
}

export async function getMessageContent(messageId: string): Promise<{ buf: Buffer; contentType: string }> {
  const res = await fetch(`https://api-data.line.me/v2/bot/message/${messageId}/content`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  const ab = await res.arrayBuffer();
  return { buf: Buffer.from(ab), contentType: res.headers.get('content-type') || 'image/jpeg' };
}

/** Fetch a user's display name (group context if groupId given). */
export async function getProfile(userId: string, groupId?: string): Promise<{ displayName: string } | null> {
  const url = groupId
    ? `${API}/group/${groupId}/member/${userId}`
    : `${API}/profile/${userId}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}` } });
  if (!res.ok) return null;
  return res.json();
}

export const flexMessage = (altText: string, contents: any) => ({ type: 'flex', altText, contents });
