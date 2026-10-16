// Who looks free when, from connected calendars — without telling anyone
// whose calendar said what.
//
// Four things are kept apart, and nothing here turns one into another:
//   synced free/busy  — evidence from someone's own calendars, private to them
//   preferences       — private and soft; they nudge, never block
//   date votes        — what someone said works (ideas.slot_votes)
//   replies           — whether someone's going (events.rsvps)
// Reading a calendar never answers for anyone.
//
// Each person is free, busy, or unknown for a time. Free needs proof: every
// calendar they've included was synced recently and covers the time. No
// calendar, a stale one, or one that errored or lost access is unknown, never
// free. The server's availability_estimate() applies the same rules and
// returns only counts; this module is the shared definition and what tests check.
//
// Preferences ("Free time doesn't always mean you're up for plans") only
// add a soft penalty that reorders suggestions — except "ask me first" on
// weekends, which makes that person's weekend times unknown to everyone else.

import { CalendarConnection, CalendarOccurrence, SlotFit, TimeSlot, WeekendMode } from '../types';
import { addDays, wallTime } from '../screens/calendar/dates';

export type Verdict = 'free' | 'busy' | 'unknown';

/** Synced longer ago than this, a calendar no longer counts as proof of anything. */
export const STALE_AFTER_MS = 24 * 60 * 60 * 1000;

type Span = { start: number; end: number };
const span = (s: TimeSlot): Span => ({ start: new Date(s.start).getTime(), end: new Date(s.end).getTime() });
const overlaps = (a: Span, b: Span) => a.start < b.end && a.end > b.start;

type Conn = Pick<CalendarConnection,
  'id' | 'user_id' | 'sync_status' | 'include_in_availability' | 'synced_from' | 'synced_to' | 'last_synced_at'>;
type Occ = Pick<CalendarOccurrence, 'connection_id' | 'owner_user_id' | 'start_at' | 'end_at' | 'busy_status'>;

/** Whether this calendar can vouch for the time: healthy, fresh, and synced over it. */
export function connectionCovers(c: Conn, slot: TimeSlot, now = Date.now()) {
  if (c.sync_status !== 'ok' || !c.last_synced_at || !c.synced_from || !c.synced_to) return false;
  if (now - new Date(c.last_synced_at).getTime() > STALE_AFTER_MS) return false;
  const s = span(slot);
  return new Date(c.synced_from).getTime() <= s.start && new Date(c.synced_to).getTime() >= s.end;
}

/**
 * One person, one time. `sheepBusy`: they're on a Sheep event then (invited,
 * not declined, not cancelled) — known from the app's own data, with or
 * without a connected calendar.
 */
export function memberAvailability(opts: {
  userId: string;
  slot: TimeSlot;
  connections: Conn[];
  occurrences: Occ[];
  sheepBusy?: boolean;
  /** A weekend time for someone who asked to be asked first, seen by anyone else. */
  askFirst?: boolean;
  now?: number;
}): Verdict {
  const { userId, slot, sheepBusy, askFirst, now = Date.now() } = opts;
  if (sheepBusy) return 'busy';
  const included = opts.connections.filter(c => c.user_id === userId && c.include_in_availability);
  const covering = new Set(included.filter(c => connectionCovers(c, slot, now)).map(c => c.id));
  const s = span(slot);
  const busy = opts.occurrences.some(o =>
    o.owner_user_id === userId && covering.has(o.connection_id) && o.busy_status !== 'free'
    && overlaps(s, { start: new Date(o.start_at).getTime(), end: new Date(o.end_at).getTime() }));
  if (busy) return 'busy';
  if (askFirst) return 'unknown';
  return included.length > 0 && covering.size === included.length ? 'free' : 'unknown';
}

export type Estimate = SlotFit;

export function estimate(verdicts: Verdict[]): Estimate {
  return {
    available: verdicts.filter(v => v === 'free').length,
    busy: verdicts.filter(v => v === 'busy').length,
    unknown: verdicts.filter(v => v === 'unknown').length,
    total: verdicts.length,
  };
}

/** Shape of an availability_estimate() row. */
export interface EstimateRow {
  slot_start: string; slot_end: string;
  available_count: number; busy_count: number; unknown_count: number; total_count: number;
  soft_penalty: number;
}

export const fromRow = (r: EstimateRow): Estimate =>
  ({ available: r.available_count, busy: r.busy_count, unknown: r.unknown_count, total: r.total_count });

/**
 * Calendar fit, e.g. "3 of 4 calendars appear free · 1 calendar unknown".
 * Says everyone's free only when every calendar showed it; unknowns are
 * named, never assumed free. Never says anyone "can make it": only votes can.
 */
export function estimateLabel(e: Estimate): string {
  if (!e.total) return '';
  if (e.available === e.total) return e.total === 1 ? 'Calendar appears free' : `All ${e.total} calendars appear free`;
  if (e.unknown === e.total) return e.total === 1 ? 'Calendar unknown' : 'Calendars unknown';
  const parts = [`${e.available} of ${e.total} calendars appear free`];
  if (e.busy) parts.push(`${e.busy} busy`);
  if (e.unknown) parts.push(`${e.unknown} calendar${e.unknown === 1 ? '' : 's'} unknown`);
  return parts.join(' · ');
}

/** Whether calendar fit has anything to say: at least one calendar known free or busy. */
export const fitKnown = (e: Estimate | undefined) => !!e && e.unknown < e.total;

/** Date votes, worded so they can't be mistaken for calendar fit. */
export function votesLabel(n: number) {
  return n === 0 ? 'No votes yet' : `${n} voted for this time`;
}

/** Shown under any estimate: it's a guess from calendars, not anyone's answer. */
export const NOT_A_VOTE = 'Calendar fit is a guess from calendars, not anyone’s answer — people still pick dates themselves.';

// ─── Preferences ─────────────────────────────────────────────────────────────

export interface SoftPrefs { weekend_mode: WeekendMode; spacing_enabled: boolean }

export const DEFAULT_SOFT_PREFS: SoftPrefs = { weekend_mode: 'any', spacing_enabled: false };

/**
 * How much a time goes against one person's preferences. Only reorders
 * suggestions; never removes one. `nearby`: a Sheep plan the same day (2) or
 * the day before/after (1). `weekendTaken`: a Sheep plan on the other day of
 * the same weekend. Mirrors availability_estimate().
 */
export function softPenalty(prefs: SoftPrefs, ctx: { weekend: boolean; nearby: 0 | 1 | 2; weekendTaken: boolean }) {
  return (prefs.spacing_enabled ? ctx.nearby : 0)
    + (prefs.weekend_mode === 'keep_one_free' && ctx.weekend && ctx.weekendTaken ? 2 : 0);
}

// ─── Privacy and counting ────────────────────────────────────────────────────

/**
 * A synced event as a given viewer may see it: the owner gets the details,
 * anyone else only that the time is taken.
 */
export function asSeenBy<T extends CalendarOccurrence>(occ: T, viewerId: string | null): T {
  if (viewerId && viewerId === occ.owner_user_id) return occ;
  return { ...occ, title: null, description: null, external_id: '', sheep_event_id: null };
}

/**
 * Synced events that aren't already a Sheep event, so a plan that's on
 * someone's Google calendar too counts once.
 */
export function withoutSheepCopies<T extends Pick<CalendarOccurrence, 'sheep_event_id'>>(occs: T[], sheepEventIds: Iterable<string>) {
  const known = new Set(sheepEventIds);
  return occs.filter(o => !o.sheep_event_id || !known.has(o.sheep_event_id));
}

/**
 * An all-day event's span in its calendar's zone: local midnight on the first
 * day to local midnight after the last (`endKey` is exclusive, as providers
 * send it). 23 or 25 hours on daylight-saving days, not a fixed 24.
 */
export function allDaySpan(startKey: string, endKey: string | null, timeZone: string): TimeSlot {
  return {
    start: new Date(wallTime(startKey, 0, timeZone)).toISOString(),
    end: new Date(wallTime(endKey ?? addDays(startKey, 1), 0, timeZone)).toISOString(),
  };
}

// ─── Disclosure ──────────────────────────────────────────────────────────────

/** What connecting a calendar does, shown before anyone signs in to a provider. */
export const CALENDAR_DISCLOSURE = [
  'Sheep reads when you’re busy on the calendars you pick. You can leave any out.',
  'Others only ever see counts like “3 of 4 calendars look free” — never your event names, notes, or which times are yours.',
  'Sheep never adds, changes, or deletes anything on your calendars.',
  'Disconnecting stops using that calendar right away and deletes what Sheep copied from it.',
];
