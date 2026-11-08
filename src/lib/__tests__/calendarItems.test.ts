import { describe, it, expect } from 'vitest';
import { itemsOnDay, syncedAgo } from '../calendarItems';

const local = (y: number, m: number, d: number, h = 0, min = 0) => new Date(y, m - 1, d, h, min).toISOString();
const item = (start: string, end: string, all_day = false) => ({ start_at: start, end_at: end, all_day });

describe('itemsOnDay', () => {
  const lunch = item(local(2026, 11, 9, 12), local(2026, 11, 9, 13));
  const dentist = item(local(2026, 11, 9, 9), local(2026, 11, 9, 10));
  const trip = item(local(2026, 11, 9), local(2026, 11, 11), true);
  const lateShow = item(local(2026, 11, 8, 22), local(2026, 11, 9, 1));
  const nextDay = item(local(2026, 11, 10, 9), local(2026, 11, 10, 10));
  const endsAtMidnight = item(local(2026, 11, 8, 20), local(2026, 11, 9, 0));

  it('keeps what touches the day, all-day first, then by start', () => {
    expect(itemsOnDay([lunch, nextDay, dentist, trip, lateShow, endsAtMidnight], '2026-11-09'))
      .toEqual([trip, lateShow, dentist, lunch]);
  });

  it('carries a multi-day event onto each of its days, not past its end', () => {
    expect(itemsOnDay([trip], '2026-11-10')).toEqual([trip]);
    expect(itemsOnDay([trip], '2026-11-11')).toEqual([]);
  });
});

describe('syncedAgo', () => {
  const now = new Date('2026-11-07T12:00:00Z').getTime();
  const ago = (ms: number) => new Date(now - ms).toISOString();
  it('says how long ago, roughly', () => {
    expect(syncedAgo(null, now)).toBe('not yet');
    expect(syncedAgo(ago(20_000), now)).toBe('just now');
    expect(syncedAgo(ago(5 * 60_000), now)).toBe('5 min ago');
    expect(syncedAgo(ago(3 * 3600_000), now)).toBe('3 hr ago');
    expect(syncedAgo(ago(26 * 3600_000), now)).toBe('1 day ago');
    expect(syncedAgo(ago(50 * 3600_000), now)).toBe('2 days ago');
  });
});
