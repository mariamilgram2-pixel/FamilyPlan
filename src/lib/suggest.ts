// Ranking candidate times for Find a Time.
//
// Calendar conflicts first, preferences second, spread last:
//   1. most people whose calendars are known to be free
//   2. fewest people known to be busy
//   3. least against anyone's soft preferences
//   4. at most one time per day, spread over the range (or the soonest, for
//      "This week"), each day's time as close to the sweet spot as fits
// With everyone free and default preferences, this picks exactly what
// findSlots always has. Times someone is busy for are shown only to reach a
// minimum of options, and labeled. Nothing here votes or replies for anyone,
// and preferences never remove a time.

import { EstimateSlot, SlotFit, TimeSlot } from '../types';
import { addDays, keyIn, parseKey } from '../screens/calendar/dates';
import { SoftPrefs, estimate, memberAvailability, softPenalty } from './availability';

export interface Candidate {
  slot: TimeSlot;
  day: string;          // YYYY-MM-DD in the planning time zone
  order: number;        // 0 = the day's most natural start (preferred time, then nearest the sweet spot)
}

export interface Scored extends Candidate { fit: SlotFit; penalty: number }

export const MAX_OPTIONS = 4;
export const MIN_OPTIONS = 3;

/** `n` of a date-ordered list: the first ones when `soon`, otherwise evenly spread. */
export function spreadPick<T>(list: T[], n: number, soon: boolean): T[] {
  if (n <= 0) return [];
  if (soon || list.length <= n) return list.slice(0, n);
  if (n === 1) return [list[0]];
  return Array.from({ length: n }, (_, i) => list[Math.round((i * (list.length - 1)) / (n - 1))]);
}

const tierOrder = (a: Scored, b: Scored) =>
  b.fit.available - a.fit.available || a.fit.busy - b.fit.busy || a.penalty - b.penalty;
const better = (a: Scored, b: Scored) => tierOrder(a, b) || a.order - b.order;
const chrono = (a: Scored, b: Scored) => Date.parse(a.slot.start) - Date.parse(b.slot.start);

export function rankSuggestions(scored: Scored[], opts: { soon: boolean; max?: number; min?: number }): Scored[] {
  const max = opts.max ?? MAX_OPTIONS;
  const min = Math.min(opts.min ?? MIN_OPTIONS, max);

  const byDay = new Map<string, Scored>();
  scored.forEach(s => { const cur = byDay.get(s.day); if (!cur || better(s, cur) < 0) byDay.set(s.day, s); });
  const days = Array.from(byDay.values()).sort(chrono);

  // Equally good days form a tier; take tiers best first, spreading within one.
  const tiers: Scored[][] = [];
  [...days].sort(tierOrder).forEach(d => {
    const last = tiers[tiers.length - 1];
    if (last && tierOrder(last[0], d) === 0) last.push(d); else tiers.push([d]);
  });

  const picks: Scored[] = [];
  for (const tier of tiers) {
    const room = (tier[0].fit.busy > 0 ? min : max) - picks.length;
    if (room <= 0) break;
    picks.push(...spreadPick(tier.sort(chrono), room, opts.soon));
  }
  return picks.sort(chrono);
}

// ─── What the app already knows from Sheep ───────────────────────────────────

/** A Sheep event someone is going to (invited, not declined, not cancelled). */
export interface SheepPlan { who: string; start: number; end: number }

const dayGap = (a: string, b: string) => Math.round(Math.abs(parseKey(a).getTime() - parseKey(b).getTime()) / 86400000);

/** The days a time covers in the planning zone, first to last (a trip covers several). */
function slotDays(slot: TimeSlot, timeZone?: string) {
  const first = keyIn(Date.parse(slot.start), timeZone);
  const last = keyIn(Math.max(Date.parse(slot.start), Date.parse(slot.end) - 1), timeZone);
  const out = [first];
  for (let k = first; k < last && out.length < 62; ) { k = addDays(k, 1); out.push(k); }
  return out;
}

const isWeekendDay = (key: string) => { const wd = parseKey(key).getDay(); return wd === 0 || wd === 6; };

/** Touches a Saturday or Sunday, on any of its days. */
export function isWeekend(slot: TimeSlot, timeZone?: string) {
  return slotDays(slot, timeZone).some(isWeekendDay);
}

/**
 * Per-person Sheep facts for one time, as availability_estimate() takes them:
 * who's busy, who has a plan close by, who'd lose their free weekend day.
 * A time running several days is close to a plan the day before it starts or
 * after it ends, and takes a whole weekend when it covers both Sat and Sun.
 */
export function sheepContext(slot: TimeSlot, people: string[], plans: SheepPlan[], timeZone?: string): EstimateSlot {
  const s = Date.parse(slot.start), e = Date.parse(slot.end);
  const covered = slotDays(slot, timeZone);
  const first = covered[0], last = covered[covered.length - 1];
  // Each weekend it touches: [Sat, Sun].
  const weekends = Array.from(new Set(covered.filter(isWeekendDay).map(k => (parseKey(k).getDay() === 6 ? k : addDays(k, -1)))))
    .map(sat => [sat, addDays(sat, 1)] as const);
  const out: EstimateSlot = { start: slot.start, end: slot.end, sheep_busy: [], nearby: {}, weekend_taken: [] };
  people.forEach(id => {
    const theirs = plans.filter(p => p.who === id);
    if (theirs.some(p => p.start < e && p.end > s)) { out.sheep_busy.push(id); return; }
    const planDays = new Set(theirs.flatMap(p => [keyIn(p.start, timeZone), keyIn(p.end - 1, timeZone)]));
    const gap = Math.min(Infinity, ...Array.from(planDays, d => (d >= first && d <= last ? 0 : Math.min(dayGap(d, first), dayGap(d, last)))));
    if (gap === 0) out.nearby[id] = 2;
    else if (gap === 1) out.nearby[id] = 1;
    const takesWeekend = weekends.some(([sat, sun]) => {
      const hasSat = covered.includes(sat), hasSun = covered.includes(sun);
      return (hasSat && hasSun) || (hasSat && planDays.has(sun)) || (hasSun && planDays.has(sat));
    });
    if (takesWeekend) out.weekend_taken.push(id);
  });
  return out;
}

/**
 * Score from Sheep alone, for the demo or when the server can't be reached:
 * everyone without a Sheep conflict is unknown (no connected calendars to
 * vouch for them), and only your own preferences are known.
 */
export function scoreLocally(c: Candidate, ctx: EstimateSlot, opts: {
  people: string[]; meId: string; myPrefs: SoftPrefs; timeZone?: string;
}): Scored {
  const verdicts = opts.people.map(id => memberAvailability({
    userId: id, slot: c.slot, connections: [], occurrences: [], sheepBusy: ctx.sheep_busy.includes(id),
  }));
  const penalty = ctx.sheep_busy.includes(opts.meId) ? 0 : softPenalty(opts.myPrefs, {
    weekend: isWeekend(c.slot, opts.timeZone),
    nearby: ctx.nearby[opts.meId] ?? 0,
    weekendTaken: ctx.weekend_taken.includes(opts.meId),
  });
  return { ...c, fit: estimate(verdicts), penalty };
}
