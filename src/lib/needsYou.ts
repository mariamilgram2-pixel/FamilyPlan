// What's waiting on you, filed under who it's from and which group it's in,
// so People can mark them with a dot (like an unread conversation).
//
// Each item belongs to the person who's waiting: whoever invited you, asked
// for your dates, or sent the notification. Plans you organize never dot
// anyone; what they need is yours to do, not someone else's to wait on.

import { needsReply } from './rsvp';
import { awaitingYourDates } from './plans';
import { AppNotification, Event, Idea } from '../types';

const DAY = 86400000;
const OPEN_ITEMS_WITHIN_DAYS = 14;

export interface NeedsYouItem {
  key: string;
  label: string;                 // "Reply to Book club"
  short: string;                 // for a pinned tile's bubble: "Reply?"
  eventId?: string;              // where tapping it goes
  date?: string;                 // the event's start, for the calendar
  ideaId?: string;
  notificationId?: string;       // marked read when opened
}

export interface NeedsYou {
  byPerson: Map<string, NeedsYouItem[]>;
  byGroup: Map<string, NeedsYouItem[]>;
}

export function whatNeedsYou(events: Event[], ideas: Idea[], notifications: AppNotification[], meId: string | null, now = Date.now()): NeedsYou {
  const byPerson = new Map<string, NeedsYouItem[]>();
  const byGroup = new Map<string, NeedsYouItem[]>();
  if (!meId) return { byPerson, byGroup };
  const add = (map: Map<string, NeedsYouItem[]>, id: string | null | undefined, item: NeedsYouItem) => {
    if (!id || id === meId) return;
    const list = map.get(id) ?? [];
    if (!list.some(x => x.key === item.key)) list.push(item);
    map.set(id, list);
  };
  const file = (person: string | null | undefined, group: string | null | undefined, item: NeedsYouItem) => {
    add(byPerson, person, item);
    add(byGroup, group, item);
  };

  // One item per series: answering covers every occurrence.
  const seen = new Set<string>();
  events.filter(e => !e.cancelled_at && new Date(e.start_time).getTime() > now)
    .sort((a, b) => a.start_time.localeCompare(b.start_time))
    .forEach(e => {
      const series = e.series_id ?? e.id;
      if (seen.has(series)) return;
      if (needsReply(e, meId)) {
        seen.add(series);
        file(e.created_by, e.group_id, { key: `reply-${series}`, label: `Reply to ${e.title}`, short: 'Reply?', eventId: e.id, date: e.start_time });
        return;
      }
      // You're going and something's still unclaimed, soon. The organizer's waiting on it.
      const open = (e.assignments ?? []).filter(a => !a.assignee_id);
      if (open.length && e.created_by !== meId && e.attendees.includes(meId) && e.rsvps?.[meId] !== 'declined'
        && new Date(e.start_time).getTime() - now < OPEN_ITEMS_WITHIN_DAYS * DAY) {
        seen.add(series);
        file(e.created_by, e.group_id, { key: `bring-${series}`, label: `${e.title} still needs ${open.map(a => a.item).join(', ')}`, short: `${open[0].item}?`, eventId: e.id, date: e.start_time });
      }
    });

  ideas.filter(i => awaitingYourDates(i, meId)).forEach(i =>
    file(i.created_by, i.group_id, { key: `dates-${i.id}`, label: `Pick dates for ${i.title}`, short: 'Dates?', ideaId: i.id }));

  // Unread notifications, under who sent them and the group of what they're about.
  const groupOf = (n: AppNotification) =>
    (n.event_id && events.find(e => (e.series_id ?? e.id) === n.event_id || e.id === n.event_id)?.group_id)
    || (n.idea_id && ideas.find(i => i.id === n.idea_id)?.group_id) || null;
  notifications.filter(n => !n.read_at).forEach(n =>
    file(n.actor_id, groupOf(n), { key: `n-${n.id}`, label: n.title, short: 'New', eventId: n.event_id ?? undefined, ideaId: n.idea_id ?? undefined, notificationId: n.id }));

  return { byPerson, byGroup };
}
