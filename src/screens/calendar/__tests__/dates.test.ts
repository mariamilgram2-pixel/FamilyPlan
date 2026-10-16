import { describe, it, expect } from 'vitest';
import { keyIn, rangeLabel, wallTime } from '../dates';

const now = new Date(2026, 9, 15);

describe('rangeLabel', () => {
  it.each([
    ['2026-10-18', '2026-10-24', 'Oct 18–24'],
    ['2026-10-30', '2026-11-05', 'Oct 30–Nov 5'],
    ['2026-12-28', '2027-01-03', 'Dec 28–Jan 3'],
    ['2027-03-01', '2027-03-07', 'Mar 1–7, 2027'],
    ['2027-12-27', '2028-01-02', 'Dec 27, 2027–Jan 2, 2028'],
  ])('%s to %s → %s', (from, to, text) => {
    expect(rangeLabel(from, to, now).text).toBe(text);
  });

  it('spoken form has full dates', () => {
    expect(rangeLabel('2026-10-18', '2026-10-24', now).spoken)
      .toBe('October 18, 2026 to October 24, 2026');
  });
});

describe('wallTime', () => {
  const iso = (ms: number) => new Date(ms).toISOString();
  const NY = 'America/New_York';

  it('7pm stays 7pm across daylight-saving changes', () => {
    expect(iso(wallTime('2026-03-07', 19 * 60, NY))).toBe('2026-03-08T00:00:00.000Z');   // EST
    expect(iso(wallTime('2026-03-08', 19 * 60, NY))).toBe('2026-03-08T23:00:00.000Z');   // EDT, same day as the change
    expect(iso(wallTime('2026-11-01', 19 * 60, NY))).toBe('2026-11-02T00:00:00.000Z');   // back to EST
  });

  it('a skipped time lands an hour later', () => {
    expect(iso(wallTime('2026-03-08', 2 * 60 + 30, NY))).toBe('2026-03-08T07:30:00.000Z');   // 3:30 EDT
  });

  it('a repeated time is the first one', () => {
    expect(iso(wallTime('2026-11-01', 60 + 30, NY))).toBe('2026-11-01T05:30:00.000Z');   // 1:30 EDT
  });

  it('works east of UTC and at half-hour offsets', () => {
    expect(iso(wallTime('2026-10-16', 9 * 60, 'Europe/Berlin'))).toBe('2026-10-16T07:00:00.000Z');
    expect(iso(wallTime('2026-10-16', 9 * 60, 'Asia/Kolkata'))).toBe('2026-10-16T03:30:00.000Z');
  });

  it('keyIn gives the day in that zone', () => {
    expect(keyIn(Date.parse('2026-10-16T02:00:00Z'), NY)).toBe('2026-10-15');
    expect(keyIn(Date.parse('2026-10-16T02:00:00Z'), 'Europe/Berlin')).toBe('2026-10-16');
  });
});
