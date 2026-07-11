// Mention-gate: staff must @tag the OA for a group text to be processed. This
// keeps CashGuard silent during normal branch chit-chat (the AI only "wakes up"
// when addressed). LINE puts mentions in message.mention.mentionees[]; the bot's
// own mention carries isSelf:true on current webhooks. Older payloads only give a
// userId, so we also match LINE_BOT_USER_ID when it is configured.
const BOT_USER_ID = process.env.LINE_BOT_USER_ID || '';

export function isMentioned(message: any): boolean {
  const mentionees = message?.mention?.mentionees;
  if (!Array.isArray(mentionees)) return false;
  return mentionees.some(
    (m: any) => m?.isSelf === true || (BOT_USER_ID && m?.userId === BOT_USER_ID)
  );
}

// Remove the "@Cammo" token(s) so the parser sees only the expense text.
// LINE indices are UTF-16 code units, which JS String.slice already uses.
// We cut from the end so earlier spans keep their positions.
export function stripMention(message: any): string {
  const text: string = message?.text ?? '';
  const mentionees = message?.mention?.mentionees;
  if (!Array.isArray(mentionees) || !mentionees.length) return text;
  const spans = mentionees
    .filter((m: any) => typeof m.index === 'number' && typeof m.length === 'number')
    .sort((a: any, b: any) => b.index - a.index);
  let out = text;
  for (const s of spans) out = out.slice(0, s.index) + out.slice(s.index + s.length);
  return out.replace(/\s+/g, ' ').trim();
}
