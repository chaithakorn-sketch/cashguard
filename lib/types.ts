export type EntryType =
  | 'expense' | 'topup' | 'customer_refund' | 'return_refund' | 'branch_transfer';

export type EntryStatus =
  | 'draft' | 'pending_evidence' | 'pending_amount'
  | 'confirmed' | 'flagged' | 'rejected';

export type EvidenceType = 'receipt' | 'transfer_slip' | 'screenshot' | 'none';

export type FlagKind =
  | 'duplicate' | 'backdated' | 'ocr_over' | 'ocr_under'
  | 'no_bill_freq' | 'over_cap' | 'cross_branch' | 'off_hours' | 'unverified'
  | 'slip_invalid';

export interface Employee {
  id: string; line_user_id: string; name: string;
  nickname: string | null; branch_id: string | null; status: string;
}
export interface Branch { id: string; code: string; name: string; line_group_id: string | null; }
export interface Entry {
  id: string; type: EntryType; status: EntryStatus;
  payer_id: string | null; branch_id: string | null;
  amount: number | null; ocr_amount: number | null; ocr_verified: boolean;
  category: string | null; vendor: string | null; description: string | null;
  evidence_type: EvidenceType | null;
  spent_at: string | null; submitted_at: string; basket_expires: string | null;
}
