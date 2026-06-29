import crypto from 'crypto';

const TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN!;
const SECRET = process.env.LINE_CHANNEL_SECRET!;
const API = 'https://api.line.me/v2/bot';

/** Verify x-line-signature against the raw request body. */
export function verifySignature(rawBody: string, signature: string | null): boolean {
  if (!signature) return false;
  const hmac = crypto.createHmac('SHA256', SECRET).update(rawBody).digest('base64');
  // timing-safe compare
  const a = Buffer.from(hmac);
  const b = Buffer.from(signature);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Reply within the short reply-token window. */
export async function reply(replyToken: string, messages: any[]) {
  await fetch(`${API}/message/reply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({ replyToken, messages }),
  });
}

/** Push to a user or group at any time. */
export async function push(to: string, messages: any[]) {
  await fetch(`${API}/message/push`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({ to, messages }),
  });
}

/** Download binary content (e.g. an image message) from LINE. */
export async function getMessageContent(messageId: string): Promise<Buffer> {
  const res = await fetch(`https://api-data.line.me/v2/bot/message/${messageId}/content`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  const ab = await res.arrayBuffer();
  return Buffer.from(ab);
}

export const flexMessage = (altText: string, contents: any) => ({ type: 'flex', altText, contents });
