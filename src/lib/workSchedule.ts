// Work schedules: storage, US federal holidays, and per-day resolution.
//
// A schedule is a weekly pattern (weekday → hours) plus a scope:
//   ongoing  — every week, minus checked holidays
//   weeks    — specific weeks (e.g. a schedule your employer sends weekly)
//   months   — specific months, minus checked holidays
// Week- and month-specific schedules override the ongoing one on their dates.
// Stored on-device (AsyncStorage), like the rest of the profile settings.

import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { addDays, dateKey, parseKey } from '../screens/calendar/dates';

export interface DayHours { start: string; end: string }   // 24h "HH:MM"
export type WeekPattern = Partial<Record<number, DayHours>>; // 0 = Sun … 6 = Sat

export type ScheduleScope =
  | { kind: 'ongoing' }
  | { kind: 'weeks'; weeks: string[] }    // Monday date keys
  | { kind: 'months'; months: string[] }; // "YYYY-MM"

export interface WorkSchedule {
  id: string;
  preset: 'standard' | 'custom';
  pattern: WeekPattern;
  scope: ScheduleScope;
  holidaysOff: string[];                  // holiday ids treated as days off
  createdAt: number;
  source?: { name: string; mimeType: string; size: number | null; kind: 'image' | 'pdf' };
}

export const STANDARD_PATTERN: WeekPattern = {
  1: { start: '09:00', end: '17:00' }, 2: { start: '09:00', end: '17:00' }, 3: { start: '09:00', end: '17:00' },
  4: { start: '09:00', end: '17:00' }, 5: { start: '09:00', end: '17:00' },
};

// ─── Store ───────────────────────────────────────────────────────────────────

const KEY = 'work_schedules';
let schedules: WorkSchedule[] = [];
let loaded = false;
const subscribers = new Set<(s: WorkSchedule[]) => void>();

async function ensureLoaded() {
  if (loaded) return;
  loaded = true;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw) { schedules = JSON.parse(raw); subscribers.forEach(fn => fn(schedules)); }
  } catch {
    // Corrupt or unavailable storage: start empty rather than crash.
  }
}

export function saveSchedules(next: WorkSchedule[]) {
  schedules = next;
  subscribers.forEach(fn => fn(next));
  AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {});
}

/** Live list of schedules shared across screens. */
export function useWorkSchedules(): WorkSchedule[] {
  const [value, setValue] = useState(schedules);
  useEffect(() => {
    subscribers.add(setValue);
    ensureLoaded();
    setValue(schedules);
    return () => { subscribers.delete(setValue); };
  }, []);
  return value;
}

/** Upsert. Only one ongoing schedule exists; saving a new one replaces it. */
export function upsertSchedule(s: WorkSchedule) {
  let next = schedules.filter(x => x.id !== s.id);
  if (s.scope.kind === 'ongoing') next = next.filter(x => x.scope.kind !== 'ongoing');
  saveSchedules([...next, s]);
}

export function deleteSchedule(id: string) {
  saveSchedules(schedules.filter(x => x.id !== id));
}

// ─── US federal holidays ─────────────────────────────────────────────────────

export interface Holiday { id: string; name: string }

export const FEDERAL_HOLIDAYS: Holiday[] = [
  { id: 'new-year', name: 'New Year’s Day' },
  { id: 'mlk', name: 'Martin Luther King Jr. Day' },
  { id: 'presidents', name: 'Presidents’ Day' },
  { id: 'memorial', name: 'Memorial Day' },
  { id: 'juneteenth', name: 'Juneteenth' },
  { id: 'independence', name: 'Independence Day' },
  { id: 'labor', name: 'Labor Day' },
  { id: 'columbus', name: 'Columbus / Indigenous Peoples’ Day' },
  { id: 'veterans', name: 'Veterans Day' },
  { id: 'thanksgiving', name: 'Thanksgiving Day' },
  { id: 'christmas', name: 'Christmas Day' },
];

export const ALL_HOLIDAY_IDS = FEDERAL_HOLIDAYS.map(h => h.id);

/** nth weekday of a month (n = -1 for last). month is 0-based. */
function nthWeekday(year: number, month: number, weekday: number, n: number) {
  if (n > 0) {
    const first = new Date(year, month, 1);
    return new Date(year, month, 1 + ((weekday - first.getDay() + 7) % 7) + (n - 1) * 7);
  }
  const last = new Date(year, month + 1, 0);
  return new Date(year, month, last.getDate() - ((last.getDay() - weekday + 7) % 7));
}

/** Fixed-date holidays move to the observed weekday (Sat → Fri, Sun → Mon). */
function observed(d: Date) {
  const day = d.getDay();
  if (day === 6) return new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1);
  if (day === 0) return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
  return d;
}

const holidayCache = new Map<number, Map<string, Holiday>>();

/** Observed federal holidays for a year, keyed by date key. */
export function holidaysForYear(year: number): Map<string, Holiday> {
  const hit = holidayCache.get(year);
  if (hit) return hit;
  const H = Object.fromEntries(FEDERAL_HOLIDAYS.map(h => [h.id, h]));
  const list: [Date, Holiday][] = [
    [observed(new Date(year, 0, 1)), H['new-year']],
    [nthWeekday(year, 0, 1, 3), H.mlk],
    [nthWeekday(year, 1, 1, 3), H.presidents],
    [nthWeekday(year, 4, 1, -1), H.memorial],
    [observed(new Date(year, 5, 19)), H.juneteenth],
    [observed(new Date(year, 6, 4)), H.independence],
    [nthWeekday(year, 8, 1, 1), H.labor],
    [nthWeekday(year, 9, 1, 2), H.columbus],
    [observed(new Date(year, 10, 11)), H.veterans],
    [nthWeekday(year, 10, 4, 4), H.thanksgiving],
    [observed(new Date(year, 11, 25)), H.christmas],
  ];
  const map = new Map(list.map(([d, h]) => [dateKey(d), h]));
  // New Year's Day on a Saturday is observed on Dec 31 of the prior year.
  const nextNY = observed(new Date(year + 1, 0, 1));
  if (nextNY.getFullYear() === year) map.set(dateKey(nextNY), H['new-year']);
  holidayCache.set(year, map);
  return map;
}

export function holidayOn(key: string): Holiday | null {
  return holidaysForYear(parseKey(key).getFullYear()).get(key) ?? null;
}

/** Next observed date (on/after `from`) for each holiday. */
export function nextHolidayDates(from: string): Record<string, string> {
  const y = parseKey(from).getFullYear();
  const out: Record<string, string> = {};
  for (const year of [y, y + 1]) {
    holidaysForYear(year).forEach((h, key) => { if (key >= from && !out[h.id]) out[h.id] = key; });
  }
  return out;
}

// ─── Weeks / months ──────────────────────────────────────────────────────────

/** Monday of the week containing `key`. */
export function weekStart(key: string) {
  const d = parseKey(key);
  return addDays(key, -((d.getDay() + 6) % 7));
}

export const monthOf = (key: string) => key.slice(0, 7);

// ─── Resolution ──────────────────────────────────────────────────────────────

export type WorkDay =
  | { kind: 'work'; hours: DayHours; schedule: WorkSchedule }
  | { kind: 'holiday'; holiday: Holiday }
  | null;

function covers(s: WorkSchedule, key: string) {
  if (s.scope.kind === 'weeks') return s.scope.weeks.includes(weekStart(key));
  if (s.scope.kind === 'months') return s.scope.months.includes(monthOf(key));
  return true;
}

/** What does this day look like? Specific weeks > months > ongoing. */
export function workOn(list: WorkSchedule[], key: string): WorkDay {
  const rank = (s: WorkSchedule) => (s.scope.kind === 'weeks' ? 0 : s.scope.kind === 'months' ? 1 : 2);
  const s = list
    .filter(x => covers(x, key))
    .sort((a, b) => rank(a) - rank(b) || b.createdAt - a.createdAt)[0];
  if (!s) return null;
  const hours = s.pattern[parseKey(key).getDay()];
  if (!hours) return null;
  if (s.scope.kind !== 'weeks') {
    const h = holidayOn(key);
    if (h && s.holidaysOff.includes(h.id)) return { kind: 'holiday', holiday: h };
  }
  return { kind: 'work', hours, schedule: s };
}

const toMin = (hm: string) => { const [h, m] = hm.split(':').map(Number); return h * 60 + m; };

/** Work interval in minutes from that day's midnight (overnight shifts run past 1440). */
function interval(h: DayHours): [number, number] {
  const a = toMin(h.start); let b = toMin(h.end);
  if (b <= a) b += 1440;
  return [a, b];
}

/**
 * Does [startIso, endIso) overlap work? Checks every day it touches (a plan
 * can run several days), plus the overnight shift from the day before.
 */
export function workConflict(list: WorkSchedule[], startIso: string, endIso: string): DayHours | null {
  const start = new Date(startIso), end = new Date(endIso);
  const key = dateKey(start);
  const s = start.getHours() * 60 + start.getMinutes();
  const e = s + Math.max(0, (end.getTime() - start.getTime()) / 60000);
  const days = Math.min(62, Math.ceil(e / 1440));
  const checks = Array.from({ length: days + 1 }, (_, i) => [addDays(key, i - 1), (i - 1) * 1440] as const);
  for (const [k, shift] of checks) {
    const w = workOn(list, k);
    if (w?.kind !== 'work') continue;
    const [a, b] = interval(w.hours);
    if (s < b + shift && e > a + shift) return w.hours;
  }
  return null;
}

// ─── Formatting ──────────────────────────────────────────────────────────────

export function formatTime(hm: string, compact = false) {
  const [h, m] = hm.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return compact && m === 0 ? `${h12} ${ampm}` : `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

export function formatHours(h: DayHours, compact = true) {
  const overnight = toMin(h.end) <= toMin(h.start);
  return `${formatTime(h.start, compact)} – ${formatTime(h.end, compact)}${overnight ? ' (next day)' : ''}`;
}

/** Flexible time entry: "9", "9am", "5:30 pm", "17:00", "0930" → "HH:MM". */
export function parseTime(input: string): string | null {
  const m = input.trim().toLowerCase().match(/^(\d{1,2})(?::?(\d{2}))?\s*(a|p)?\.?\s*m?\.?$/);
  if (!m) return null;
  let h = Number(m[1]); const min = Number(m[2] ?? 0);
  if (min > 59) return null;
  if (m[3]) { if (h < 1 || h > 12) return null; h = (h % 12) + (m[3] === 'p' ? 12 : 0); }
  else if (h > 23) return null;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MON_FIRST = [1, 2, 3, 4, 5, 6, 0];

/** "Mon–Fri", "Mon, Wed, Fri", "Sat–Sun". */
export function summarizeDays(pattern: WeekPattern) {
  const on = MON_FIRST.filter(d => pattern[d]);
  const runs: number[][] = [];
  on.forEach(d => {
    const last = runs[runs.length - 1];
    if (last && MON_FIRST.indexOf(last[last.length - 1]) + 1 === MON_FIRST.indexOf(d)) last.push(d);
    else runs.push([d]);
  });
  return runs.map(r => (r.length > 2 ? `${DAY_SHORT[r[0]]}–${DAY_SHORT[r[r.length - 1]]}` : r.map(d => DAY_SHORT[d]).join(', '))).join(', ');
}

export function summarizePattern(pattern: WeekPattern) {
  const days = Object.values(pattern).filter(Boolean) as DayHours[];
  if (days.length === 0) return 'No workdays';
  const same = days.every(d => d.start === days[0].start && d.end === days[0].end);
  return `${summarizeDays(pattern)} · ${same ? formatHours(days[0]) : 'varied hours'}`;
}

export function summarizeScope(s: WorkSchedule) {
  const off = s.holidaysOff.length;
  const holidays = off === 0 ? 'no holidays off' : off === FEDERAL_HOLIDAYS.length ? 'federal holidays off' : `${off} holidays off`;
  if (s.scope.kind === 'ongoing') return `Every week · ${holidays}`;
  if (s.scope.kind === 'months') {
    const names = s.scope.months.slice().sort().map(m => parseKey(`${m}-01`).toLocaleDateString('en-US', { month: 'short' }));
    return `${names.join(', ')} · ${holidays}`;
  }
  const weeks = s.scope.weeks.slice().sort();
  const label = (w: string) => parseKey(w).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return weeks.length === 1 ? `Week of ${label(weeks[0])}` : `${weeks.length} weeks from ${label(weeks[0])}`;
}

export { MON_FIRST, DAY_SHORT };
