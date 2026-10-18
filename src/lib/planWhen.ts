// "When" for a new plan: a day (or a stretch of days) and a time (or a part
// of the day), each as loose or exact as the person knows. "Dinner with Ana
// this week" is a range and an evening; "dinner Friday at 7" is exact enough
// to lock in. Find a Time takes whatever's loose and fills it.

import { TimeSlot } from '../types';
import { addDays, dateKey, parseKey, relativeDay, shortDate } from '../screens/calendar/dates';
import { parseIdeaText } from './nlIdea';
import { PartOfDay, PlanPrefs, durationOf, spanOf } from './planner';

export type DayRange = 'thisWeek' | 'thisWeekend' | 'nextWeek' | 'nextWeekend';
export type DayChoice = { kind: 'any' } | { kind: 'range'; range: DayRange } | { kind: 'date'; date: string };
export type TimePart = Exclude<PartOfDay, 'any'>;
export type TimeChoice =
  | { kind: 'any' } | { kind: 'allDay' } | { kind: 'part'; part: TimePart }
  | { kind: 'exact'; start: string; end?: string };   // end: a stated finish ("7–9pm"); else the usual length
export interface When { day: DayChoice; time: TimeChoice }

export const ANY_WHEN: When = { day: { kind: 'any' }, time: { kind: 'any' } };

export const RANGE_LABEL: Record<DayRange, string> = {
  thisWeek: 'This week', thisWeekend: 'This weekend', nextWeek: 'Next week', nextWeekend: 'Next weekend',
};
export const PART_LABEL: Record<TimePart, string> = { morning: 'Morning', daytime: 'Afternoon', evening: 'Evening' };

/**
 * First and last day (inclusive) of a range. "This week" is the next seven
 * days, as Find a Time has always read it (said on a Sunday, it isn't just
 * today); next week and weekends follow the calendar, Monday to Sunday.
 */
export function rangeDays(range: DayRange, today: string): [string, string] {
  const wd = parseKey(today).getDay();                 // 0 = Sunday
  const sunday = addDays(today, (7 - wd) % 7);
  const saturday = wd === 0 ? today : addDays(today, 6 - wd);
  switch (range) {
    case 'thisWeek': return [today, addDays(today, 6)];
    case 'thisWeekend': return [saturday, sunday];
    case 'nextWeek': return [addDays(sunday, 1), addDays(sunday, 7)];
    case 'nextWeekend': return [addDays(sunday, 6), addDays(sunday, 7)];
  }
}

/** "7pm", "7:30 pm", "19:00", "noon" → "HH:MM". Null when it can't be read. */
export function parseClock(text: string): string | null {
  const t = text.trim().toLowerCase().replace(/\./g, '');
  if (t === 'noon') return '12:00';
  if (t === 'midnight') return '00:00';
  const m = t.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm|a|p)?$/);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  const ap = m[3]?.[0];
  if (min > 59 || h > 23 || (ap && (h < 1 || h > 12))) return null;
  if (ap === 'p' && h < 12) h += 12;
  if (ap === 'a' && h === 12) h = 0;
  // No am/pm: 1–7 is the afternoon or evening, as the event parser reads it.
  if (!ap && h >= 1 && h <= 7) h += 12;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

export function clockLabel(hm: string) {
  const [h, m] = hm.split(':').map(Number);
  const h12 = h % 12 || 12;
  return `${h12}${m ? `:${String(m).padStart(2, '0')}` : ''} ${h < 12 ? 'AM' : 'PM'}`;
}

export function dayLabel(day: DayChoice) {
  if (day.kind === 'any') return null;
  if (day.kind === 'range') return RANGE_LABEL[day.range];
  const rel = relativeDay(day.date);
  return rel === 'Today' || rel === 'Tomorrow' ? rel : shortDate(day.date);
}

export function timeLabel(time: TimeChoice) {
  if (time.kind === 'any') return null;
  if (time.kind === 'allDay') return 'all day';
  if (time.kind === 'part') return PART_LABEL[time.part].toLowerCase();
  return time.end ? clockRangeLabel(time.start, time.end) : clockLabel(time.start);
}

/** "7 – 9 PM", "11 AM – 1 PM". */
export function clockRangeLabel(start: string, end: string) {
  const a = clockLabel(start), b = clockLabel(end);
  return a.slice(-2) === b.slice(-2) ? `${a.slice(0, -3)} – ${b}` : `${a} – ${b}`;
}

/**
 * "7pm", "7–9pm", "6:30 to 8", "11am-1pm" → start, and end when one's given.
 * A bare start takes the end's am/pm ("7-9pm" is 7 to 9 in the evening).
 */
export function parseClockRange(text: string): { start: string; end?: string } | null {
  const parts = text.trim().toLowerCase().split(/\s*(?:-|–|—|\bto\b|\buntil\b|\btill\b)\s*/).filter(Boolean);
  if (parts.length === 1) { const start = parseClock(parts[0]); return start ? { start } : null; }
  if (parts.length !== 2) return null;
  const endMer = parts[1].match(/(am|pm|a|p)\.?$/)?.[1];
  const startHasMer = /(am|pm|a|p)\.?$/.test(parts[0]);
  const start = parseClock(startHasMer || !endMer ? parts[0] : `${parts[0]}${endMer}`);
  let end = parseClock(parts[1]);
  // "6:30 to 8": a bare end before the start is later the same day.
  if (start && end && !endMer && end <= start && Number(end.slice(0, 2)) < 12) {
    end = `${String(Number(end.slice(0, 2)) + 12).padStart(2, '0')}${end.slice(2)}`;
  }
  if (!start || !end || end <= start) return null;
  return { start, end };
}

/** "This week · evening", "Fri, Oct 23 · 7 PM", "Any day · evening"; null when nothing's set. */
export function whenLabel(when: When, trip = false) {
  const d = dayLabel(when.day);
  const t = trip ? null : timeLabel(when.time);
  if (!d && !t) return null;
  return [d ?? 'Any day', t].filter(Boolean).join(' · ');
}

/** Known down to the minute (or, for several days, the first day): ready to lock in. */
export const isExact = (when: When, trip = false) =>
  when.day.kind === 'date' && (trip || when.time.kind === 'exact' || when.time.kind === 'allDay');

/** Find a Time preferences that keep what's known and search the rest. */
export function prefsFor(when: When, base: PlanPrefs, today: string): PlanPrefs {
  const partOfDay: PartOfDay =
    when.time.kind === 'part' ? when.time.part :
    when.time.kind === 'exact' ? partAt(when.time.start) : 'any';
  const out: PlanPrefs = { ...base, partOfDay, onlyDate: null, range: null, month: null };
  if (when.day.kind === 'date') out.onlyDate = when.day.date;
  if (when.day.kind === 'range') {
    out.range = rangeDays(when.day.range, today);
    out.horizon = when.day.range === 'thisWeek' ? 'soon' : 'twoWeeks';
  }
  return out;
}

export function partAt(hm: string): TimePart {
  const [h] = hm.split(':').map(Number);
  return h >= 17 ? 'evening' : h < 12 ? 'morning' : 'daytime';
}

/** The exact time to lock in, or null when it isn't known yet. */
export function lockedSlot(when: When, prefs: PlanPrefs): TimeSlot | null {
  if (when.day.kind !== 'date') return null;
  const day = when.day.date;
  const span = spanOf(prefs);
  if (span > 1) {
    return { start: parseKey(day).toISOString(), end: parseKey(addDays(day, span)).toISOString() };
  }
  if (when.time.kind === 'allDay') return { start: parseKey(day).toISOString(), end: parseKey(addDays(day, 1)).toISOString() };
  if (when.time.kind !== 'exact') return null;
  const start = new Date(`${day}T${when.time.start}:00`);
  const end = when.time.end && when.time.end > when.time.start
    ? new Date(`${day}T${when.time.end}:00`)
    : new Date(start.getTime() + durationOf(prefs) * 60000);
  return { start: start.toISOString(), end: end.toISOString() };
}

// ─── The calendar in When ────────────────────────────────────────────────────

/** What When's calendar shows: a run of days (whole weeks drawn), or a month (YYYY-MM-01). */
export type CalendarView = { kind: 'days'; from: string; to: string } | { kind: 'month'; month: string };

export const startOfWeek = (k: string) => addDays(k, -parseKey(k).getDay());
const monthOf = (k: string) => `${k.slice(0, 7)}-01`;

/** "Nov 3", "next month", "in 3 weeks", "december" → what to show. Null when it can't be read. */
export function readOther(text: string, today: string): CalendarView | null {
  const t = text.trim().toLowerCase();
  if (!t) return null;
  const m = t.match(/^(?:in\s+)?(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*$/);
  if (m) {
    const idx = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(m[1]);
    const now = parseKey(today);
    const year = idx < now.getMonth() ? now.getFullYear() + 1 : now.getFullYear();
    return { kind: 'month', month: dateKey(new Date(year, idx, 1)) };
  }
  if (/^next\s+month$/.test(t)) { const d = parseKey(today); return { kind: 'month', month: dateKey(new Date(d.getFullYear(), d.getMonth() + 1, 1)) }; }
  if (/^this\s+month$/.test(t)) return { kind: 'month', month: monthOf(today) };
  const p = parseIdeaText(text, { today, people: [] });
  if (p.range) { const [from, to] = rangeDays(p.range, today); return { kind: 'days', from, to }; }
  if (p.date) { const from = startOfWeek(p.date); return { kind: 'days', from, to: addDays(from, 6) }; }
  return null;
}

