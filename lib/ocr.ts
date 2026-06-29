// OCR adapter — reads amount / vendor / VAT / evidence-type from a receipt image.
// TODO: wire to Typhoon OCR (Thai) or Google Vision. Return nulls until configured.
export interface OcrResult {
  amount: number | null;
  vendor: string | null;
  vatAmount: number | null;
  evidenceType: 'receipt' | 'transfer_slip' | 'screenshot' | 'none';
  raw: any;
}

export async function runOcr(_image: Buffer): Promise<OcrResult> {
  // --- placeholder ---
  // const res = await fetch(OCR_ENDPOINT, { method:'POST', body:_image, headers:{...} });
  return { amount: null, vendor: null, vatAmount: null, evidenceType: 'receipt', raw: null };
}
