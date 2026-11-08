// Two kinds of group (both public.groups):
//   a shared calendar  family, a household: everyone sees one calendar; people
//                      join with the invite code and admins remove them.
//   a group            like a group chat (shared_calendar off): a few friends
//                      planning something. Anyone in it adds or removes people,
//                      anyone can leave, and a name is optional.
// Plans made for either belong to it, so everyone in it sees them.
//
// The pure parts (kept apart from the database client so tests can load them).

import { Group } from '../types';

export const isCalendar = (g: Pick<Group, 'shared_calendar'> | null | undefined) => !!g && g.shared_calendar !== false;

/** An unnamed group goes by who's in it besides you: "Ana", "Ana & Ben", "Ana, Ben & Chloe", "Ana, Ben +3". */
export function nameFromPeople(names: string[]): string {
  const first = names.map(n => n.trim().split(/\s+/)[0]).filter(Boolean);
  if (!first.length) return 'Just you';
  if (first.length === 1) return first[0];
  if (first.length <= 3) return `${first.slice(0, -1).join(', ')} & ${first[first.length - 1]}`;
  return `${first.slice(0, 2).join(', ')} +${first.length - 2}`;
}

/** How long a group can go unused before it moves to Past groups. */
export const PAST_AFTER_DAYS = 60;

/**
 * When a group was last used: its newest plan or event (a coming one counts
 * as now), or when it was made. Events and ideas are whatever's loaded.
 */
export function lastUsedAt(
  group: Pick<Group, 'id' | 'created_at'>,
  events: { group_id: string | null; invited_group_ids?: string[] | null; start_time: string }[],
  ideas: { group_id: string | null; audience_group_ids?: string[] | null; created_at: string; last_activity_at?: string | null }[],
  now = Date.now(),
): number {
  let last = new Date(group.created_at).getTime() || 0;
  for (const e of events) {
    if (e.group_id !== group.id && !e.invited_group_ids?.includes(group.id)) continue;
    last = Math.max(last, Math.min(now, new Date(e.start_time).getTime()));
  }
  for (const i of ideas) {
    if (i.group_id !== group.id && !i.audience_group_ids?.includes(group.id)) continue;
    last = Math.max(last, new Date(i.last_activity_at ?? i.created_at).getTime());
  }
  return last;
}

/** A group that's out of the way: no shared calendar, and unused for a while. */
export function isPastGroup(group: Pick<Group, 'shared_calendar'>, lastUsed: number, now = Date.now()): boolean {
  return !isCalendar(group) && now - lastUsed > PAST_AFTER_DAYS * 86400000;
}
