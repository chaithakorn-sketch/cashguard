import { sb } from './supabase';

/** Current cash-in-hand for an employee (computed from the DB view). */
export async function balanceFor(employeeId: string): Promise<number> {
  const { data } = await sb.from('employee_balances').select('balance').eq('employee_id', employeeId).single();
  return Number(data?.balance ?? 0);
}

export async function totalBalance(): Promise<number> {
  const { data } = await sb.from('employee_balances').select('balance');
  return (data ?? []).reduce((s: number, r: any) => s + Number(r.balance), 0);
}

/** Employees whose balance is below threshold (for low-balance alerts). */
export async function lowBalanceEmployees(threshold = 500) {
  const { data } = await sb.from('employee_balances').select('*');
  return (data ?? []).filter((r: any) => Number(r.balance) < threshold);
}
