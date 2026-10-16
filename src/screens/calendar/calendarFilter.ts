// Which events a calendar shows. Pure, so the rules are easy to check.
//
// My calendar: everything you made or were invited to, in any group.
// A shared calendar: what's on that calendar (made in the group, or the whole
// group was invited); with `showMine`, plus your own other events marked as
// overlays. Overlays come only from your own events, so nobody else ever
// sees them, and an event on both is shown once, as the group's.

import { Event } from '../../types';

export type CalEvent = Event & { overlay?: boolean };

export function calendarEvents(
  events: Event[],
  opts: { meId: string | null; groupId: string | null; showMine: boolean },
): CalEvent[] {
  const { meId, groupId, showMine } = opts;
  const isMine = (e: Event) => !!meId && (e.created_by === meId || !!e.attendees?.includes(meId));
  const unique = new Map<string, CalEvent>();
  if (!groupId) {
    events.filter(isMine).forEach(e => { if (!unique.has(e.id)) unique.set(e.id, e); });
  } else {
    events
      .filter(e => e.group_id === groupId || !!e.invited_group_ids?.includes(groupId))
      .forEach(e => { if (!unique.has(e.id)) unique.set(e.id, e); });
    if (showMine) {
      events.filter(e => isMine(e) && !unique.has(e.id)).forEach(e => unique.set(e.id, { ...e, overlay: true }));
    }
  }
  return Array.from(unique.values());
}
