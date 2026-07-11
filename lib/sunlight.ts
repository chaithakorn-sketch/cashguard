import { sb } from './supabase';
import { push, flexMessage } from './line';

// "Sunlight": every confirmed entry / top-up / edit is broadcast to the branch's
// own LINE group, so cash movements happen in the open where the whole branch can
// see them. Best-effort by design — a missing group id or a push failure must
// never block or fail the main flow (it is called after the DB write commits).
export async function postToBranchGroup(branchId: string | null, altText: string, contents: any): Promise<void> {
  if (!branchId) return;
  try {
    const { data: br } = await sb.from('branches').select('line_group_id').eq('id', branchId).maybeSingle();
    const gid = br?.line_group_id;
    if (!gid) return;
    await push(gid, [flexMessage(altText, contents)]);
  } catch (e) {
    console.error('[sunlight] post failed', e);
  }
}
