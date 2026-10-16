// Finding a time that works for everyone.
//
// Given everyone's busy intervals (their sheep events, plus your own work
// hours) and a few loose preferences — part of day, how soon, which days,
// how long — return a handful of options, at most one per day, each free for
// every participant. Runs locally against data the app already has.

import { TimeSlot } from '../types';
import { addDays, dateKey, keyIn, parseKey, todayKey, wallTime } from '../screens/calendar/dates';
import { WorkSchedule, workConflict } from './workSchedule';
import { Candidate, MAX_OPTIONS, spreadPick } from './suggest';

export type PartOfDay = 'morning' | 'daytime' | 'evening' | 'any';
export type Horizon = 'soon' | 'twoWeeks' | 'later';
export type DayKind = 'any' | 'weekdays' | 'weekends';

export interface PlanPrefs {
  partOfDay: PartOfDay;
  horizon: Horizon;
  days: DayKind;
  duration: number;            // minutes
  onlyDate: string | null;     // YYYY-MM-DD — look on this day only
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

/** Sensible defaults from what the idea already says ("dinner", "7pm"). */
export function defaultPrefs(hint: { start?: string; end?: string; date?: string | null }): PlanPrefs {
  let partOfDay: PartOfDay = 'any';
  if (hint.start) {
    const s = toMin(hint.start);
    partOfDay = s >= 17 * 60 ? 'evening' : s < 12 * 60 ? 'morning' : 'daytime';
  }
  let duration = 120;
  if (hint.start && hint.end) {
    const d = toMin(hint.end) - toMin(hint.start);
    if (d > 0) duration = [60, 120, 180, 240].reduce((a, b) => (Math.abs(b - d) < Math.abs(a - d) ? b : a));
  }
  return { partOfDay, horizon: 'twoWeeks', days: 'any', duration, onlyDate: hint.date ?? null };
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
  const to = Math.max(win.to, win.from + prefs.duration);

  // Candidate start minutes: the preferred time, then outward from the sweet spot.
  const starts: number[] = [];
  for (let m = win.from; m + prefs.duration <= to; m += STEP) starts.push(m);
  starts.sort((a, b) => Math.abs(a - win.sweet) - Math.abs(b - win.sweet) || a - b);
  const pref = preferredStart ? toMin(preferredStart) : null;
  if (pref !== null && pref >= win.from && pref + prefs.duration <= to) {
    starts.splice(starts.indexOf(pref), starts.includes(pref) ? 1 : 0);
    starts.unshift(pref);
  }

  let days: string[];
  if (prefs.onlyDate) days = [prefs.onlyDate];
  else {
    const [a, b] = HORIZONS[prefs.horizon];
    days = Array.from({ length: b - a }, (_, i) => addDays(today, a + i));
  }
  days = days.filter(k => {
    const wd = parseKey(k).getDay();
    if (prefs.days === 'weekdays') return wd >= 1 && wd <= 5;
    if (prefs.days === 'weekends') return wd === 0 || wd === 6;
    return true;
  });

  const out: Candidate[] = [];
  for (const day of days) {
    let kept = 0;
    for (let order = 0; order < starts.length && kept < perDay; order++) {
      // Wall-clock time, so a daylight-saving day doesn't shift every option by an hour.
      const s = wallTime(day, starts[order], timeZone);
      const e = s + prefs.duration * 60000;
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
  if (prefs.onlyDate) return [parseKey(prefs.onlyDate).toISOString(), parseKey(addDays(prefs.onlyDate, 2)).toISOString()];
  const [a, b] = HORIZONS[prefs.horizon];
  const today = todayKey();
  // Start a day early so yesterday's late events still count.
  return [parseKey(addDays(today, a - 1)).toISOString(), parseKey(addDays(today, b + 1)).toISOString()];
}

// ─── Formatting ──────────────────────────────────────────────────────────────

export function slotDay(slot: TimeSlot) {
  return dateKey(new Date(slot.start));
}

export function slotLabel(slot: TimeSlot) {
  const d = new Date(slot.start);
  const day = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  return `${day} · ${slotTime(slot)}`;
}

export function slotTime(slot: TimeSlot) {
  const f = (iso: string) => {
    const d = new Date(iso);
    const s = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    return d.getMinutes() === 0 ? s.replace(':00', '') : s;
  };
  return `${f(slot.start)} – ${f(slot.end)}`;
}

export const DURATION_LABEL = (min: number) => (min % 60 === 0 ? `${min / 60} hr${min > 60 ? 's' : ''}` : `${min} min`);
