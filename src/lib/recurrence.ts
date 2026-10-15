// Recurring events.
//
// A repeating event is stored once, with a rule (every day / weekday / week /
// 2 weeks / month / year, optionally until a date). Screens that show or check
// time expand it into occurrences for the range they care about, so "never
// ends" stays honest and editing the series later touches one row.

import { Event, Recurrence } from '../types';
import { dateKey, parseKey } from '../screens/calendar/dates';

export type RepeatKey = 'never' | 'daily' | 'weekdays' | 'weekly' | 'biweekly' | 'monthly' | 'yearly';

export const REPEAT_OPTIONS: { key: RepeatKey; label: string }[] = [
  { key: 'never', label: 'Never' },
  { key: 'daily', label: 'Every day' },
  { key: 'weekdays', label: 'Every weekday' },
  { key: 'weekly', label: 'Every week' },
  { key: 'biweekly', label: 'Every 2 weeks' },
  { key: 'monthly', label: 'Every month' },
  { key: 'yearly', label: 'Every year' },
];

export function ruleFor(key: RepeatKey, until: string | null): Recurrence | null {
  switch (key) {
    case 'never': return null;
    case 'daily': return { freq: 'daily', interval: 1, until };
    case 'weekdays': return { freq: 'daily', interval: 1, weekdaysOnly: true, until };
    case 'weekly': return { freq: 'weekly', interval: 1, until };
    case 'biweekly': return { freq: 'weekly', interval: 2, until };
    case 'monthly': return { freq: 'monthly', interval: 1, until };
    case 'yearly': return { freq: 'yearly', interval: 1, until };
  }
}

export function keyFor(r: Recurrence | null | undefined): RepeatKey {
  if (!r) return 'never';
  if (r.freq === 'daily') return r.weekdaysOnly ? 'weekdays' : 'daily';
  if (r.freq === 'weekly') return r.interval === 2 ? 'biweekly' : 'weekly';
  return r.freq;
}

const WEEKDAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** "Every Tuesday until Dec 1", "Every month on the 14th". */
export function describeRecurrence(r: Recurrence, startIso: string) {
  const d = new Date(startIso);
  const n = d.getDate();
  const ord = n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th';
  const base =
    r.freq === 'daily' ? (r.weekdaysOnly ? 'Every weekday' : 'Every day') :
    r.freq === 'weekly' ? `Every ${r.interval === 2 ? 'other ' : ''}${WEEKDAY[d.getDay()]}` :
    r.freq === 'monthly' ? `Every month on the ${n}${ord}` :
    `Every year on ${d.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}`;
  return r.until ? `${base} until ${untilDate(r.until)}` : base;
}

const untilDate = (key: string) => parseKey(key).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

/** "Until Oct 29, 2026" / "No end date". */
export function untilLabel(r: Recurrence) {
  return r.until ? `Until ${untilDate(r.until)}` : 'No end date';
}

/** Start of the nth occurrence, or null when that date doesn't exist (Feb 30). */
function nth(start: Date, r: Recurrence, n: number): Date | null {
  const d = new Date(start);
  if (r.freq === 'daily') d.setDate(d.getDate() + n * r.interval);
  else if (r.freq === 'weekly') d.setDate(d.getDate() + n * 7 * r.interval);
  else {
    const months = r.freq === 'monthly' ? n * r.interval : n * 12 * r.interval;
    d.setDate(1);
    d.setMonth(d.getMonth() + months);
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    if (start.getDate() > last) return null;   // skip months without that day
    d.setDate(start.getDate());
  }
  return d;
}

const MAX_OCCURRENCES = 1500;

/**
 * Replace repeating events with their occurrences overlapping [from, to).
 * Occurrence ids are "<eventId>@<YYYY-MM-DD>" with `series_id` pointing back.
 */
export function expandEvents(events: Event[], from: Date, to: Date): Event[] {
  const out: Event[] = [];
  for (const e of events) {
    const r = e.recurrence;
    if (!r) { out.push(e); continue; }
    const start = new Date(e.start_time);
    const length = new Date(e.end_time).getTime() - start.getTime();
    const until = r.until ? parseKey(r.until).getTime() + 86400000 : Infinity;   // inclusive day
    for (let i = 0; i < MAX_OCCURRENCES; i++) {
      const s = nth(start, r, i);
      if (!s) continue;
      if (s.getTime() >= to.getTime() || s.getTime() >= until) break;
      if (r.weekdaysOnly && (s.getDay() === 0 || s.getDay() === 6)) continue;
      const end = new Date(s.getTime() + length);
      if (end.getTime() <= from.getTime()) continue;
      out.push({ ...e, id: `${e.id}@${dateKey(s)}`, series_id: e.id, start_time: s.toISOString(), end_time: end.toISOString() });
    }
  }
  return out.sort((a, b) => a.start_time.localeCompare(b.start_time));
}

/** iCalendar RRULE for export. */
export function toRRule(r: Recurrence) {
  const parts = [`FREQ=${r.freq.toUpperCase()}`];
  if (r.interval > 1) parts.push(`INTERVAL=${r.interval}`);
  if (r.weekdaysOnly) parts.push('BYDAY=MO,TU,WE,TH,FR');
  if (r.until) parts.push(`UNTIL=${r.until.replace(/-/g, '')}T235959Z`);
  return `RRULE:${parts.join(';')}`;
}
