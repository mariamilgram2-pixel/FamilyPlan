// Your events from connected calendars, for showing on your own calendar.
// Pure, so it's tested without the phone.

import { CalendarOccurrence } from '../types';
import { addDays, wallTime } from '../screens/calendar/dates';

/** Your synced events touching this day (device time), all-day ones first, then by start. */
export function itemsOnDay<T extends Pick<CalendarOccurrence, 'start_at' | 'end_at' | 'all_day'>>(items: T[], key: string): T[] {
  const start = wallTime(key, 0);
  const end = wallTime(addDays(key, 1), 0);
  return items
    .filter(i => new Date(i.start_at).getTime() < end && new Date(i.end_at).getTime() > start)
    .sort((a, b) => Number(b.all_day) - Number(a.all_day) || a.start_at.localeCompare(b.start_at));
}

/** "just now", "5 min ago", "3 hr ago", "2 days ago"; "not yet" before the first sync. */
export function syncedAgo(iso: string | null, now = Date.now()) {
  if (!iso) return 'not yet';
  const min = Math.floor((now - new Date(iso).getTime()) / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hr ago`;
  const days = Math.floor(hr / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}
