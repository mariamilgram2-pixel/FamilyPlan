// Finding a time that works for everyone.
//
// Given everyone's busy intervals (their sheep events, plus your own work
// hours) and a few loose preferences — part of day, how soon, which days,
// how long — return a handful of options, at most one per day, each free for
// every participant. Runs locally against data the app already has.
//
// Plans can also run several days in a row (`spanDays` > 1: a camping
// weekend, a trip). Those are whole days, midnight to midnight, one option
// per first day; time of day doesn't apply, and work days don't rule one out
// (people take time off for a trip) — conflicts only rank it lower.

import { TimeSlot } from '../types';
import { addDays, dateKey, keyIn, parseKey, todayKey, wallTime } from '../screens/calendar/dates';
import { WorkSchedule, workConflict } from './workSchedule';
import { Candidate, MAX_OPTIONS, spreadPick } from './suggest';
import { isAllDay, isMultiDay, spanLabel, spanLength } from './span';

export type PartOfDay = 'morning' | 'daytime' | 'evening' | 'any';
export type Horizon = 'soon' | 'twoWeeks' | 'later';
export type DayKind = 'any' | 'weekdays' | 'weekends';

export interface PlanPrefs {
  partOfDay: PartOfDay;
  horizon: Horizon;
  days: DayKind;
  duration: number | null;     // minutes, for a plan within one day; null = doesn't matter
  spanDays?: number;           // several days in a row (2+); 1 or unset = within one day
  month?: string | null;       // YYYY-MM — with 'later', look in this month (else 2–6 weeks out)
  onlyDate: string | null;     // YYYY-MM-DD — look on this day only (the first day, for several)
}

export const MAX_SPAN_DAYS = 30;
export const spanOf = (prefs: PlanPrefs) => Math.min(MAX_SPAN_DAYS, Math.max(1, prefs.spanDays ?? 1));

/** When the length doesn't matter (dinner), suggestions still hold this much time. */
export const DEFAULT_DURATION = 120;
export const durationOf = (prefs: PlanPrefs) => prefs.duration ?? DEFAULT_DURATION;

/**
 * Days typed in: "3", "10 days", "2 weeks", "1 week". Null when it can't be
 * read or is outside 2–30 days.
 */
export function parseSpan(text: string): number | null {
  const m = text.trim().toLowerCase().match(/^(\d{1,2})\s*(d|days?|w|wks?|weeks?)?$/);
  if (!m) return null;
  const n = Number(m[1]) * (m[2]?.startsWith('w') ? 7 : 1);
  return n >= 2 && n <= MAX_SPAN_DAYS ? n : null;
}

/** The next twelve months after this one, for "Later": key YYYY-MM, label "January 2027". */
export function laterMonths(today = todayKey()) {
  const t = parseKey(today);
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(t.getFullYear(), t.getMonth() + 1 + i, 1);
    return {
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      label: d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
    };
  });
}

/** First days to search, in order: one day, a chosen month, or the horizon. */
function searchDays(prefs: PlanPrefs, today: string): string[] {
  if (prefs.onlyDate) return [prefs.onlyDate];
  if (prefs.horizon === 'later' && prefs.month) {
    const out: string[] = [];
    for (let k = `${prefs.month}-01`; k.startsWith(prefs.month); k = addDays(k, 1)) if (k >= today) out.push(k);
    return out;
  }
  const [a, b] = HORIZONS[prefs.horizon];
  return Array.from({ length: b - a }, (_, i) => addDays(today, a + i));
}

/**
 * Whether a run of days fits the chosen days. Weekdays: every day Mon–Fri.
 * Weekends, for one day: Sat or Sun; for several: takes in a whole Sat–Sun.
 */
export function daysFit(first: string, span: number, kind: DayKind) {
  const wds = Array.from({ length: span }, (_, i) => parseKey(addDays(first, i)).getDay());
  if (kind === 'weekdays') return wds.every(wd => wd >= 1 && wd <= 5);
  if (kind === 'weekends') return span === 1 ? wds[0] === 0 || wds[0] === 6 : wds.some((wd, i) => wd === 6 && wds[i + 1] === 0);
  return true;
}

export interface Busy { start: number; end: number; who: string }   // epoch ms

// Window each part of day searches in, and the start time it leans toward.
const WINDOWS: Record<PartOfDay, { from: number; to: number; sweet: number }> = {
  morning: { from: 8 * 60, to: 12 * 60, sweet: 10 * 60 },
  daytime: { from: 10 * 60, to: 17 * 60, sweet: 13 * 60 },
  evening: { from: 17 * 60, to: 22 * 60 + 30, sweet: 19 * 60 },
  any:     { from: 9 * 60, to: 22 * 60, sweet: 18 * 60 + 30 },
};

const HORIZONS: Record<Horizon, [number, number]> = {   // day offsets [from, to)
  soon: [0, 7],
  twoWeeks: [0, 14],
  later: [14, 42],
};

const STEP = 30;
const LEAD_MS = 60 * 60 * 1000;   // nothing that starts within the hour

const toMin = (hm: string) => { const [h, m] = hm.split(':').map(Number); return h * 60 + m; };

const NUMBERS: Record<string, number> = { two: 2, three: 3, four: 4, five: 5, '2': 2, '3': 3, '4': 4, '5': 5 };

/**
 * Several days in a row, when the idea says so: "a weekend" (Sat–Sun),
 * "two nights" (3 days), "4 days". Null when it doesn't.
 */
export function spanHint(text: string): Pick<PlanPrefs, 'spanDays' | 'days'> | null {
  const t = text.toLowerCase();
  const nights = t.match(/\b(two|three|four|2|3|4)\s+nights?\b/);
  if (nights) return { spanDays: NUMBERS[nights[1]] + 1, days: 'any' };
  const days = t.match(/\b(two|three|four|five|2|3|4|5)[\s-]+days?\b/);
  if (days) return { spanDays: NUMBERS[days[1]], days: 'any' };
  if (/\bweekend\b/.test(t)) return { spanDays: 2, days: 'weekends' };
  return null;
}

/** Sensible defaults from what the idea already says ("dinner", "7pm"). */
export function defaultPrefs(hint: { start?: string; end?: string; date?: string | null }): PlanPrefs {
  let partOfDay: PartOfDay = 'any';
  if (hint.start) {
    const s = toMin(hint.start);
    partOfDay = s >= 17 * 60 ? 'evening' : s < 12 * 60 ? 'morning' : 'daytime';
  }
  // Only a stated end makes the length matter; "dinner at 7" doesn't say.
  let duration: number | null = null;
  if (hint.start && hint.end) {
    const d = toMin(hint.end) - toMin(hint.start);
    if (d > 0) duration = [60, 120, 180, 240].reduce((a, b) => (Math.abs(b - d) < Math.abs(a - d) ? b : a));
  }
  return { partOfDay, horizon: 'twoWeeks', days: 'any', duration, spanDays: 1, onlyDate: hint.date ?? null };
}

/**
 * Every time worth considering, in the planning time zone: each allowed day
 * in range, starts in the chosen part of day ordered by how natural they are
 * (`preferredStart` first, then outward from the sweet spot). Leaves out
 * times within the hour, your work hours, and whatever `skip` rules out;
 * keeps the first `perDay` per day.
 */
export function candidateSlots(opts: {
  prefs: PlanPrefs;
  work: WorkSchedule[];
  preferredStart?: string;
  now?: Date;
  timeZone?: string;           // whose clock "7pm" is on; the device's when omitted
  skip?: (s: number, e: number) => boolean;
  perDay?: number;
}): Candidate[] {
  const { prefs, work, preferredStart, timeZone, skip, perDay = Infinity } = opts;
  const now = (opts.now ?? new Date()).getTime();
  const today = keyIn(now, timeZone);
  const win = WINDOWS[prefs.partOfDay];
  const length = durationOf(prefs);
  const to = Math.max(win.to, win.from + length);

  // Candidate start minutes: the preferred time, then outward from the sweet spot.
  const starts: number[] = [];
  for (let m = win.from; m + length <= to; m += STEP) starts.push(m);
  starts.sort((a, b) => Math.abs(a - win.sweet) - Math.abs(b - win.sweet) || a - b);
  const pref = preferredStart ? toMin(preferredStart) : null;
  if (pref !== null && pref >= win.from && pref + length <= to) {
    starts.splice(starts.indexOf(pref), starts.includes(pref) ? 1 : 0);
    starts.unshift(pref);
  }

  const span = spanOf(prefs);
  const days = searchDays(prefs, today).filter(k => daysFit(k, span, prefs.days));

  const out: Candidate[] = [];
  if (span > 1) {
    // Whole days: midnight on the first day to midnight after the last.
    for (const day of days) {
      const s = wallTime(day, 0, timeZone);
      const e = wallTime(addDays(day, span), 0, timeZone);
      if (s < now + LEAD_MS || skip?.(s, e)) continue;
      out.push({ slot: { start: new Date(s).toISOString(), end: new Date(e).toISOString() }, day, order: 0 });
    }
    return out;
  }
  for (const day of days) {
    let kept = 0;
    for (let order = 0; order < starts.length && kept < perDay; order++) {
      // Wall-clock time, so a daylight-saving day doesn't shift every option by an hour.
      const s = wallTime(day, starts[order], timeZone);
      const e = s + length * 60000;
      if (s < now + LEAD_MS) continue;
      if (skip?.(s, e)) continue;
      const slot = { start: new Date(s).toISOString(), end: new Date(e).toISOString() };
      if (workConflict(work, slot.start, slot.end)) continue;
      out.push({ slot, day, order });
      kept++;
    }
  }
  return out;
}

/**
 * Up to four options free for everyone in `busy`: each day's most natural
 * free time, then the soonest days ("This week") or spread over the range.
 */
export function findSlots(opts: {
  busy: Busy[];
  prefs: PlanPrefs;
  work: WorkSchedule[];
  preferredStart?: string;
  now?: Date;
  timeZone?: string;
}): TimeSlot[] {
  const { busy, ...rest } = opts;
  const free = candidateSlots({ ...rest, perDay: 1, skip: (s, e) => busy.some(b => s < b.end && e > b.start) });
  return spreadPick(free.map(c => c.slot), MAX_OPTIONS, opts.prefs.horizon === 'soon');
}

/** Search range for busy-time queries: [from, to) as ISO. */
export function searchRange(prefs: PlanPrefs): [string, string] {
  // A day either side, so late events the day before and plans the day after still count.
  const extra = spanOf(prefs);
  if (prefs.onlyDate) return [parseKey(addDays(prefs.onlyDate, -1)).toISOString(), parseKey(addDays(prefs.onlyDate, extra + 1)).toISOString()];
  const days = searchDays(prefs, todayKey());
  if (!days.length) return [new Date().toISOString(), new Date().toISOString()];
  return [parseKey(addDays(days[0], -1)).toISOString(), parseKey(addDays(days[days.length - 1], extra + 1)).toISOString()];
}

// ─── Formatting ──────────────────────────────────────────────────────────────

export function slotDay(slot: TimeSlot) {
  return dateKey(new Date(slot.start));
}

/** The day an option is on, or its run of days: "Fri, Oct 23 – Sun, Oct 25". */
export function slotTitle(slot: TimeSlot) {
  if (isMultiDay(slot.start, slot.end)) return spanLabel(slot.start, slot.end);
  return new Date(slot.start).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

export function slotLabel(slot: TimeSlot) {
  if (isMultiDay(slot.start, slot.end)) return `${spanLabel(slot.start, slot.end)} · ${spanLength(slot.start, slot.end)}`;
  const d = new Date(slot.start);
  const day = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  return `${day} · ${slotTime(slot)}`;
}

export function slotTime(slot: TimeSlot) {
  if (isMultiDay(slot.start, slot.end)) return isAllDay(slot.start, slot.end) ? spanLength(slot.start, slot.end) : spanLabel(slot.start, slot.end);
  if (isAllDay(slot.start, slot.end)) return 'All day';
  const f = (iso: string) => {
    const d = new Date(iso);
    const s = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    return d.getMinutes() === 0 ? s.replace(':00', '') : s;
  };
  return `${f(slot.start)} – ${f(slot.end)}`;
}

export const DURATION_LABEL = (min: number) => (min % 60 === 0 ? `${min / 60} hr${min > 60 ? 's' : ''}` : `${min} min`);
