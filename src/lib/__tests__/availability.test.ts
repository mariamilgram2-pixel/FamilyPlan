import { describe, it, expect } from 'vitest';
import {
  DEFAULT_SOFT_PREFS, allDaySpan, asSeenBy, estimate, estimateLabel, memberAvailability, softPenalty, withoutSheepCopies,
} from '../availability';
import { countByCategory, DEFAULT_CATEGORIES, UNCATEGORIZED } from '../categories';
import { CalendarConnection, CalendarOccurrence, Category } from '../../types';

const now = Date.parse('2026-10-15T12:00:00Z');
const slot = { start: '2026-10-16T23:00:00Z', end: '2026-10-17T01:00:00Z' };

const conn = (over: Partial<CalendarConnection> = {}): CalendarConnection => ({
  id: 'c1', user_id: 'ana', provider: 'google', remote_calendar_id: 'primary', calendar_name: null,
  account_label: null, permissions: 'freebusy', sync_status: 'ok', include_in_availability: true,
  synced_from: '2026-10-01T00:00:00Z', synced_to: '2026-12-01T00:00:00Z',
  last_synced_at: '2026-10-15T11:00:00Z', last_error: null, created_at: '2026-10-01T00:00:00Z', ...over,
});

const occ = (over: Partial<CalendarOccurrence> = {}): CalendarOccurrence => ({
  id: 'o1', connection_id: 'c1', owner_user_id: 'ana', source: 'google', external_id: 'ext-1',
  start_at: '2026-10-17T00:00:00Z', end_at: '2026-10-17T00:30:00Z', all_day: false, timezone: null,
  busy_status: 'busy', visibility: 'private', title: 'Therapy', description: 'Room 4',
  sheep_event_id: null, updated_at: '2026-10-15T11:00:00Z', ...over,
});

const verdict = (connections: CalendarConnection[], occurrences: CalendarOccurrence[] = [], sheepBusy = false) =>
  memberAvailability({ userId: 'ana', slot, connections, occurrences, sheepBusy, now });

describe('memberAvailability', () => {
  it('no connected calendar is unknown, never free', () => {
    expect(verdict([])).toBe('unknown');
  });

  it('a fresh calendar with nothing on is free', () => {
    expect(verdict([conn()])).toBe('free');
  });

  it('a private event makes them busy', () => {
    expect(verdict([conn()], [occ()])).toBe('busy');
  });

  it('events marked free (transparent) don’t block', () => {
    expect(verdict([conn()], [occ({ busy_status: 'free' })])).toBe('free');
  });

  it.each([
    ['stale', { last_synced_at: '2026-10-13T00:00:00Z' }],
    ['errored', { sync_status: 'error' as const }],
    ['revoked', { sync_status: 'revoked' as const }],
    ['never synced', { sync_status: 'pending' as const, last_synced_at: null }],
    ['not synced that far out', { synced_to: '2026-10-16T00:00:00Z' }],
  ])('%s calendar is unknown, and its cached events are ignored', (_, over) => {
    expect(verdict([conn(over)])).toBe('unknown');
    expect(verdict([conn(over)], [occ()])).toBe('unknown');
  });

  it('one healthy and one stale calendar: busy on the healthy one is still busy, free isn’t proven', () => {
    const both = [conn(), conn({ id: 'c2', last_synced_at: '2026-10-01T00:00:00Z' })];
    expect(verdict(both)).toBe('unknown');
    expect(verdict(both, [occ()])).toBe('busy');
  });

  it('a calendar left out counts for nothing', () => {
    expect(verdict([conn({ include_in_availability: false })], [occ()])).toBe('unknown');
  });

  it('a removed connection’s leftover events are not used', () => {
    expect(verdict([], [occ()])).toBe('unknown');
  });

  it('being on a Sheep event is busy with or without a calendar', () => {
    expect(verdict([], [], true)).toBe('busy');
  });

  it('someone else’s events never affect you', () => {
    expect(verdict([conn()], [occ({ owner_user_id: 'ben' })])).toBe('free');
  });
});

describe('estimate', () => {
  it('never claims everyone is free when someone can’t be checked', () => {
    const e = estimate(['free', 'free', 'free', 'unknown']);
    expect(e).toEqual({ available: 3, busy: 0, unknown: 1, total: 4 });
    expect(estimateLabel(e)).toBe('3 of 4 calendars appear free · 1 calendar unknown');
  });

  it('all free only when all are', () => {
    expect(estimateLabel(estimate(['free', 'free']))).toBe('All 2 calendars appear free');
  });

  it('nothing connected', () => {
    expect(estimateLabel(estimate(['unknown', 'unknown']))).toBe('Calendars unknown');
  });

  it('names busy separately and never says anyone “can make it”', () => {
    const label = estimateLabel(estimate(['free', 'busy', 'unknown', 'unknown']));
    expect(label).toBe('1 of 4 calendars appear free · 1 busy · 2 calendars unknown');
    expect(label).not.toMatch(/can make it/);
  });
});

describe('ask me before suggesting weekend times', () => {
  it('a free weekend calendar is unknown to others, never free', () => {
    expect(memberAvailability({ userId: 'ana', slot, connections: [conn()], occurrences: [], askFirst: true, now })).toBe('unknown');
  });

  it('busy is still busy', () => {
    expect(memberAvailability({ userId: 'ana', slot, connections: [conn()], occurrences: [occ()], askFirst: true, now })).toBe('busy');
  });
});

describe('softPenalty', () => {
  const ctx = { weekend: true, nearby: 2 as const, weekendTaken: true };
  it('defaults change nothing', () => {
    expect(softPenalty(DEFAULT_SOFT_PREFS, ctx)).toBe(0);
  });
  it('spacing weighs a same-day plan over a next-day one', () => {
    const p = { ...DEFAULT_SOFT_PREFS, spacing_enabled: true };
    expect(softPenalty(p, { ...ctx, nearby: 2 })).toBeGreaterThan(softPenalty(p, { ...ctx, nearby: 1 }));
    expect(softPenalty(p, { ...ctx, nearby: 0, weekendTaken: false })).toBe(0);
  });
  it('keep one weekend day free only counts when the other day is taken', () => {
    const p = { ...DEFAULT_SOFT_PREFS, weekend_mode: 'keep_one_free' as const };
    expect(softPenalty(p, { ...ctx, nearby: 0 })).toBe(2);
    expect(softPenalty(p, { ...ctx, nearby: 0, weekendTaken: false })).toBe(0);
    expect(softPenalty(p, { ...ctx, nearby: 0, weekend: false })).toBe(0);
  });
});

describe('regressions', () => {
  it('an overnight event blocks the early hours of the next day', () => {
    const late = occ({ start_at: '2026-10-16T22:00:00Z', end_at: '2026-10-17T03:00:00Z' });
    const early = { start: '2026-10-17T01:00:00Z', end: '2026-10-17T02:00:00Z' };
    expect(memberAvailability({ userId: 'ana', slot: early, connections: [conn()], occurrences: [late], now })).toBe('busy');
  });

  it('a long event (a week away) blocks everything inside it', () => {
    const trip = occ({ start_at: '2026-10-12T00:00:00Z', end_at: '2026-10-20T00:00:00Z', busy_status: 'out_of_office' });
    expect(verdict([conn()], [trip])).toBe('busy');
  });

  it('the same event synced from two calendars counts the person once', () => {
    const both = [conn(), conn({ id: 'c2', remote_calendar_id: 'work' })];
    const dupes = [occ(), occ({ id: 'o2', connection_id: 'c2' })];
    const v = memberAvailability({ userId: 'ana', slot, connections: both, occurrences: dupes, now });
    expect(estimate([v, 'free'])).toEqual({ available: 1, busy: 1, unknown: 0, total: 2 });
  });
});

describe('privacy', () => {
  it('only the owner sees titles and notes', () => {
    const o = occ();
    expect(asSeenBy(o, 'ana').title).toBe('Therapy');
    const seen = asSeenBy(o, 'ben');
    expect(seen.title).toBeNull();
    expect(seen.description).toBeNull();
    expect(seen.external_id).toBe('');
    expect(JSON.stringify(asSeenBy(o, null))).not.toContain('Therapy');
  });
});

describe('withoutSheepCopies', () => {
  it('a plan also on someone’s calendar counts once', () => {
    const list = [occ({ id: 'a', sheep_event_id: 'e1' }), occ({ id: 'b' }), occ({ id: 'c', sheep_event_id: 'gone' })];
    expect(withoutSheepCopies(list, ['e1']).map(o => o.id)).toEqual(['b', 'c']);
  });
});

describe('allDaySpan', () => {
  it('is local midnight to midnight in the calendar’s zone', () => {
    expect(allDaySpan('2026-10-16', null, 'America/New_York'))
      .toEqual({ start: '2026-10-16T04:00:00.000Z', end: '2026-10-17T04:00:00.000Z' });
  });

  it('is 25 hours on the day clocks fall back', () => {
    const s = allDaySpan('2026-11-01', '2026-11-02', 'America/New_York');
    expect(Date.parse(s.end) - Date.parse(s.start)).toBe(25 * 3600_000);
  });

  it('is 23 hours on the day clocks spring forward', () => {
    const s = allDaySpan('2026-03-08', null, 'America/New_York');
    expect(Date.parse(s.end) - Date.parse(s.start)).toBe(23 * 3600_000);
  });
});

describe('categories', () => {
  it('count by id, so a rename changes nothing', () => {
    const renamed: Category[] = DEFAULT_CATEGORIES.map(c => (c.name === 'Meals' ? { ...c, name: 'Dinners' } : c));
    const items = [{ category_id: DEFAULT_CATEGORIES[0].id }, { category_id: DEFAULT_CATEGORIES[0].id }, { category_id: null }];
    expect(countByCategory(items, renamed)).toEqual(countByCategory(items, DEFAULT_CATEGORIES));
    expect(countByCategory(items, renamed).get(DEFAULT_CATEGORIES[0].id)).toBe(2);
  });

  it('a category you can’t see counts as uncategorized', () => {
    expect(countByCategory([{ category_id: 'someone-elses' }], DEFAULT_CATEGORIES).get(UNCATEGORIZED)).toBe(1);
  });
});
