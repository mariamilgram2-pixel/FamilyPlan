// What you have with one person: the plans you've shared, the next one, and
// when their birthday comes around. Notes about them are in personNotes.

import { blocksTime } from './rsvp';
import { Event } from '../types';

const DAY = 86400000;

export interface SharedPlan { event: Event; times: number }   // times: repeats of one series, folded together

export interface History {
  past: SharedPlan[];        // newest first, one row per series
  pastCount: number;         // every time, repeats included
  next: Event | null;
  firstAt: string | null;    // the earliest plan you shared
}

/**
 * Plans you and `otherId` were both part of. Expanded events in, so a weekly
 * dinner counts each week; someone who declined wasn't there.
 */
export function sharedHistory(events: Event[], meId: string, otherId: string, now = Date.now()): History {
  const both = events.filter(e =>
    !e.cancelled_at && e.attendees?.includes(otherId) && blocksTime(e, meId) && e.rsvps?.[otherId] !== 'declined');
  const past = both.filter(e => new Date(e.end_time).getTime() < now).sort((a, b) => b.start_time.localeCompare(a.start_time));
  const upcoming = both.filter(e => new Date(e.end_time).getTime() >= now).sort((a, b) => a.start_time.localeCompare(b.start_time));

  const bySeries = new Map<string, SharedPlan>();
  past.forEach(e => {
    const key = e.series_id ?? e.id;
    const hit = bySeries.get(key);
    if (hit) hit.times++;
    else bySeries.set(key, { event: e, times: 1 });
  });

  return {
    past: Array.from(bySeries.values()),
    pastCount: past.length,
    next: upcoming[0] ?? null,
    firstAt: past.length ? past[past.length - 1].start_time : null,
  };
}

/** Days until the next MM-DD birthday; 0 on the day. */
export function daysUntilBirthday(mmdd: string, today = new Date()): number {
  const [m, d] = mmdd.split('-').map(Number);
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  let next = new Date(start.getFullYear(), m - 1, d);
  if (next < start) next = new Date(start.getFullYear() + 1, m - 1, d);
  return Math.round((next.getTime() - start.getTime()) / DAY);
}

export const birthdayLabel = (mmdd: string) => {
  const [m, d] = mmdd.split('-').map(Number);
  return new Date(2024, m - 1, d).toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
};

// ─── Status in the People list ───────────────────────────────────────────────

const SOON_DAYS = 14;
const QUIET_AFTER_DAYS = 28;

export interface PersonStatus {
  text: string | null;       // null: nothing worth saying; show shared groups instead
  tint: boolean;             // it's yours to act on
  rank: 0 | 1 | 2;           // 0 needs you, 1 something soon, 2 everyone else
  soon: number;              // days to that soon thing, for ordering within rank 1
}

/** "Today", "Tomorrow", "Sat", or "Nov 2". */
function whenLabel(iso: string, now: number) {
  const d = new Date(iso);
  const days = dayDiff(d, new Date(now));
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days < 7) return d.toLocaleDateString('en-US', { weekday: 'short' });
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** Whole calendar days from `from` to `to`. */
function dayDiff(to: Date, from: Date) {
  const a = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  const b = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  return Math.round((a.getTime() - b.getTime()) / DAY);
}

/**
 * One line about where things stand with someone, most pressing first: what
 * they're waiting on from you, then a birthday or plan coming up soon, then
 * how long it's been.
 */
export function personStatus(opts: { needs: string[]; history: History | null; birthday?: string | null; now?: number }): PersonStatus {
  const now = opts.now ?? Date.now();
  if (opts.needs.length) {
    const more = opts.needs.length - 1;
    return { text: more ? `${opts.needs[0]} · ${more} more` : opts.needs[0], tint: true, rank: 0, soon: 0 };
  }

  const soon: { days: number; text: string }[] = [];
  if (opts.birthday) {
    const days = daysUntilBirthday(opts.birthday, new Date(now));
    if (days <= SOON_DAYS) soon.push({ days, text: days === 0 ? 'Birthday today 🎂' : days === 1 ? 'Birthday tomorrow' : `Birthday in ${days} days` });
  }
  const next = opts.history?.next;
  if (next) {
    const days = dayDiff(new Date(next.start_time), new Date(now));
    if (days <= SOON_DAYS) soon.push({ days, text: `${next.title} · ${whenLabel(next.start_time, now)}` });
  }
  if (soon.length) {
    const first = soon.sort((a, b) => a.days - b.days)[0];
    return { text: first.text, tint: false, rank: 1, soon: first.days };
  }

  const last = opts.history?.past[0]?.event;
  if (last && !next) {
    const days = Math.floor((now - new Date(last.end_time).getTime()) / DAY);
    if (days > QUIET_AFTER_DAYS) {
      const text = days < 60 ? `${Math.floor(days / 7)} weeks` : `${Math.floor(days / 30)} months`;
      return { text: `Last together ${text} ago`, tint: false, rank: 2, soon: 0 };
    }
  }
  return { text: null, tint: false, rank: 2, soon: 0 };
}
