// Plans that run over several days in a row: a camping weekend, a trip, a
// three-day festival.
//
// No separate "multi-day" kind: an event is multi-day when its start and end
// fall on different days, and all-day when it starts and ends at local
// midnight (a Fri–Sun trip is Fri 00:00 → Mon 00:00). Ending exactly at
// midnight doesn't touch the next day.

import { addDays, keyOf, parseKey, timeParts } from '../screens/calendar/dates';

const MAX_DAYS = 62;
const isMidnight = (iso: string) => { const d = new Date(iso); return d.getHours() === 0 && d.getMinutes() === 0; };

/** Day keys an event covers, first to last (local time). */
export function daysCovered(startIso: string, endIso: string): string[] {
  const first = keyOf(startIso);
  const last = keyOf(new Date(Math.max(Date.parse(startIso), Date.parse(endIso) - 1)).toISOString());
  const out = [first];
  for (let k = first; k < last && out.length < MAX_DAYS; ) { k = addDays(k, 1); out.push(k); }
  return out;
}

export const isMultiDay = (startIso: string, endIso: string) => daysCovered(startIso, endIso).length > 1;

/** Starts and ends at local midnight: no times worth showing. */
export const isAllDay = (startIso: string, endIso: string) =>
  Date.parse(endIso) > Date.parse(startIso) && isMidnight(startIso) && isMidnight(endIso);

/** Covers the whole of `day`, midnight to midnight (an all-day plan, or the middle of a trip). */
export function fillsDay(startIso: string, endIso: string, day: string) {
  return Date.parse(startIso) <= parseKey(day).getTime() && Date.parse(endIso) >= parseKey(addDays(day, 1)).getTime();
}

/**
 * How a plan reads on one of its days, for list rows and chips:
 * "6:30 PM" on a one-day plan, "All day", or "Day 2 of 3".
 */
export function whenOnDay(startIso: string, endIso: string, day: string) {
  const days = daysCovered(startIso, endIso);
  const i = Math.max(0, days.indexOf(day));
  if (days.length > 1 && (i > 0 || isAllDay(startIso, endIso))) {
    return { hm: `Day ${i + 1}`, ampm: `of ${days.length}`, short: `day ${i + 1}/${days.length}`, spoken: `day ${i + 1} of ${days.length}` };
  }
  if (isAllDay(startIso, endIso)) return { hm: 'All', ampm: 'day', short: 'all day', spoken: 'all day' };
  const { hm, ampm } = timeParts(startIso);
  return {
    hm, ampm, short: `${hm} ${ampm.toLowerCase()}`,
    spoken: `${hm} ${ampm}${days.length > 1 ? `, day 1 of ${days.length}` : ''}`,
  };
}

const dayName = (iso: string) => new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
const clock = (iso: string) => {
  const s = new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return s.replace(':00', '');
};

/**
 * The whole span in words: "Fri, Oct 23 – Sun, Oct 25" when all-day,
 * "Fri, Oct 23, 5 PM – Sun, Oct 25, 11 AM" otherwise. One-day plans: just the day.
 */
export function spanLabel(startIso: string, endIso: string) {
  if (!isMultiDay(startIso, endIso)) return dayName(startIso);
  if (isAllDay(startIso, endIso)) return `${dayName(startIso)} – ${dayName(new Date(Date.parse(endIso) - 1).toISOString())}`;
  return `${dayName(startIso)}, ${clock(startIso)} – ${dayName(endIso)}, ${clock(endIso)}`;
}

/** "3 days" for a multi-day plan; hours and minutes (or "All day") for one day. */
export function spanLength(startIso: string, endIso: string) {
  const days = daysCovered(startIso, endIso).length;
  if (days > 1) return `${days} days`;
  const minutes = Math.round((Date.parse(endIso) - Date.parse(startIso)) / 60000);
  if (isAllDay(startIso, endIso)) return 'All day';
  return minutes >= 60 ? `${Math.floor(minutes / 60)} hr${minutes % 60 ? ` ${minutes % 60} min` : ''}` : `${minutes} min`;
}
