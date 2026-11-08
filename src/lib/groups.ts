// Two kinds of group (both public.groups):
//   a shared calendar  family, a household: everyone sees one calendar; people
//                      join with the invite code and admins remove them.
//   a group            like a group chat (shared_calendar off): a few friends
//                      planning something. Anyone in it adds or removes people,
//                      anyone can leave, and a name is optional.
// Plans made for either belong to it, so everyone in it sees them.

import { supabase } from './supabase';
export { isCalendar, nameFromPeople } from './groupKinds';
import { sendNotifications } from './notifications';

export async function addToGroup(groupId: string, userIds: string[], by?: { id: string; name: string; groupName: string }) {
  if (!userIds.length) return null;
  const { error } = await supabase.from('group_members')
    .insert(userIds.map(user_id => ({ group_id: groupId, user_id, role: 'member' as const })));
  if (error && error.code !== '23505') return error;   // 23505: already in it
  if (by) await tellAdded(userIds, by);
  return null;
}

/** "Ana added you to Holiday party 2026", for each person added. */
export async function tellAdded(userIds: string[], by: { id: string; name: string; groupName: string }) {
  const rows = userIds.filter(id => id !== by.id).map(user_id => ({
    user_id, actor_id: by.id, kind: 'group_added' as const, idea_id: null, event_id: null,
    title: `${by.name} added you to ${by.groupName}`, body: 'Find it in Friends. Plans for the group show up in Plans.',
  }));
  if (rows.length) await sendNotifications(rows as any, false);
}

export async function removeFromGroup(groupId: string, userId: string) {
  const { error } = await supabase.from('group_members').delete().eq('group_id', groupId).eq('user_id', userId);
  return error;
}

/** A name, or none (null) to go by who's in it. */
export async function renameGroup(groupId: string, name: string | null) {
  const { error } = await supabase.from('groups').update({ name: name?.trim() || null } as any).eq('id', groupId);
  return error;
}
