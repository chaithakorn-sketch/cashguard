// OCR adapter — reads amount / vendor / VAT / evidence-type from a receipt image.
// Calls any OpenAI-compatible vision endpoint (Typhoon, Gemini-compat, OpenAI…).
// Configure via env; with no key it returns nulls so the typed-amount flow still works.
//   OCR_API_KEY   - provider key (required to enable)
//   OCR_API_URL   - chat-completions URL (default Typhoon)
//   OCR_MODEL     - vision model id
export interface OcrResult {
  amount: number | null;
  vendor: string | null;
  vatAmount: number | null;
  evidenceType: 'receipt' | 'transfer_slip' | 'screenshot' | 'none';
  raw: any;
}

const STUB: OcrResult = { amount: null, vendor: null, vatAmount: null, evidenceType: 'receipt', raw: null };

const num = (v: any): number | null => {
  if (v == null) return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/[^\d.]/g, ''));
  return isFinite(n) && n > 0 ? n : null;
};

export async function runOcr(image: Buffer): Promise<OcrResult> {
  const key = process.env.OCR_API_KEY;
  if (!key) return STUB; // not configured yet
  const url = process.env.OCR_API_URL || 'https://api.opentyphoon.ai/v1/chat/completions';
  const model = process.env.OCR_MODEL || 'typhoon-v2-vision-instruct';
  try {
    const b64 = image.toString('base64');
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        temperature: 0,
        max_tokens: 300,
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text:
              'อ่านสลิป/ใบเสร็จในรูป แล้วตอบเป็น JSON อย่างเดียว ไม่มีข้อความอื่น: ' +
              '{"amount": ยอดเงินที่จ่ายจริงเป็นตัวเลขล้วน หรือ null, ' +
              '"vendor": ชื่อร้าน/ผู้รับเงิน หรือ null, ' +
              '"vat": ภาษีมูลค่าเพิ่มเป็นตัวเลข หรือ null, ' +
              '"type": "receipt" ถ้าเป็นใบเสร็จ, "transfer_slip" ถ้าเป็นสลิปโอน, "screenshot" ถ้าเป็นภาพหน้าจอ, "none" ถ้าไม่ใช่หลักฐานการจ่าย}' },
            { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${b64}` } },
          ],
        }],
      }),
    });
    if (!res.ok) {
      console.error(`[ocr] http ${res.status}:`, await res.text().catch(() => ''));
      return STUB;
    }
    const data = await res.json();
    const txt: string = data?.choices?.[0]?.message?.content ?? '';
    const json = JSON.parse((txt.match(/\{[\s\S]*\}/) ?? ['{}'])[0]);
    const type = ['receipt', 'transfer_slip', 'screenshot', 'none'].includes(json.type) ? json.type : 'receipt';
    return {
      amount: num(json.amount),
      vendor: typeof json.vendor === 'string' && json.vendor.trim() ? json.vendor.trim() : null,
      vatAmount: num(json.vat),
      evidenceType: type,
      raw: json,
    };
  } catch (e) {
    console.error('[ocr] error', e);
    return STUB;
  }
}
