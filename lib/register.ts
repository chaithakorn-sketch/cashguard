import { sb, unwrap } from './supabase';
import { getProfile } from './line';

/**
 * Find an employee by LINE user id, or auto-register using their LINE display
 * name + the branch of the group they posted in. Returns the employee row.
 * (Auto-register is acceptable because branch groups are controlled/invite-only.)
 */
/** Look up an employee by LINE user id WITHOUT creating one (for chit-chat gating). */
export async function findEmployee(userId: string) {
  return unwrap(
    await sb.from('employees').select('*').eq('line_user_id', userId).maybeSingle(),
    'findEmployee'
  );
}

export async function findOrRegister(userId: string, branchId: string | null, groupId?: string) {
  const existing = unwrap(
    await sb.from('employees').select('*').eq('line_user_id', userId).maybeSingle(),
    'findOrRegister.lookup'
  );
  if (existing) return { employee: existing, justRegistered: false };

  const profile = await getProfile(userId, groupId);
  const name = profile?.displayName ?? 'พนักงานใหม่';
  const created = unwrap(
    await sb.from('employees')
      .insert({ line_user_id: userId, name, nickname: name, branch_id: branchId, status: 'active' })
      .select('*').single(),
    'findOrRegister.insert'
  );
  return { employee: created, justRegistered: true };
}
