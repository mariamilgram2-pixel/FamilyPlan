import { describe, it, expect, vi } from 'vitest';
import { daysCovered, fillsDay, isAllDay, isMultiDay, spanLabel, spanLength, whenOnDay } from '../span';
import { isWeekend, sheepContext } from '../suggest';

vi.mock('@react-native-async-storage/async-storage', () => ({ default: { getItem: async () => null, setItem: async () => {} } }));
const { candidateSlots, daysFit, defaultPrefs, durationOf, laterMonths, parseSpan, searchRange, spanHint } = await import('../planner');
const { workConflict } = await import('../workSchedule');

// Local times, so these read the same in any time zone.
const at = (key: string, hm = '00:00') => new Date(`${key}T${hm}:00`).toISOString();
const trip = { start: at('2026-10-23'), end: at('2026-10-26') };   // Fri–Sun, all day

describe('span', () => {
  it('covers each day, and ending at midnight doesn’t touch the next', () => {
    expect(daysCovered(trip.start, trip.end)).toEqual(['2026-10-23', '2026-10-24', '2026-10-25']);
    expect(daysCovered(at('2026-10-23', '18:00'), at('2026-10-24'))).toEqual(['2026-10-23']);
    expect(daysCovered(at('2026-10-23', '22:00'), at('2026-10-24', '02:00'))).toEqual(['2026-10-23', '2026-10-24']);
  });

  it('knows all-day and multi-day', () => {
    expect(isAllDay(trip.start, trip.end)).toBe(true);
    expect(isMultiDay(trip.start, trip.end)).toBe(true);
    expect(isAllDay(at('2026-10-23', '18:00'), at('2026-10-23', '20:00'))).toBe(false);
    expect(isMultiDay(at('2026-10-23', '18:00'), at('2026-10-23', '20:00'))).toBe(false);
  });

  it('reads per day: time, all day, or day n of m', () => {
    expect(whenOnDay(trip.start, trip.end, '2026-10-24').short).toBe('day 2/3');
    expect(whenOnDay(trip.start, trip.end, '2026-10-23').spoken).toBe('day 1 of 3');
    const timed = { start: at('2026-10-23', '17:00'), end: at('2026-10-25', '11:00') };
    expect(whenOnDay(timed.start, timed.end, '2026-10-23').hm).toBe('5:00');
    expect(whenOnDay(timed.start, timed.end, '2026-10-25').hm).toBe('Day 3');
    expect(whenOnDay(at('2026-10-23'), at('2026-10-24'), '2026-10-23').short).toBe('all day');
  });

  it('fills a day only midnight to midnight', () => {
    const timed = { start: at('2026-10-23', '17:00'), end: at('2026-10-25', '11:00') };
    expect(fillsDay(timed.start, timed.end, '2026-10-23')).toBe(false);
    expect(fillsDay(timed.start, timed.end, '2026-10-24')).toBe(true);
    expect(fillsDay(timed.start, timed.end, '2026-10-25')).toBe(false);
  });

  it('labels the whole run', () => {
    expect(spanLabel(trip.start, trip.end)).toBe('Fri, Oct 23 – Sun, Oct 25');
    expect(spanLength(trip.start, trip.end)).toBe('3 days');
    expect(spanLabel(at('2026-10-23', '17:00'), at('2026-10-25', '11:00'))).toBe('Fri, Oct 23, 5 PM – Sun, Oct 25, 11 AM');
    expect(spanLength(at('2026-10-23', '18:00'), at('2026-10-23', '20:30'))).toBe('2 hr 30 min');
  });
});

describe('finding several days in a row', () => {
  const prefs = { partOfDay: 'any' as const, horizon: 'twoWeeks' as const, days: 'any' as const, duration: 120, onlyDate: null };
  const now = new Date(at('2026-10-15', '12:00'));

  it('offers whole days, midnight to midnight, starting tomorrow at the earliest', () => {
    const c = candidateSlots({ prefs: { ...prefs, spanDays: 3 }, work: [], now });
    expect(c[0].slot).toEqual({ start: at('2026-10-16'), end: at('2026-10-19') });
    expect(c.every(x => isAllDay(x.slot.start, x.slot.end) && daysCovered(x.slot.start, x.slot.end).length === 3)).toBe(true);
  });

  it('weekends take in a whole Saturday and Sunday', () => {
    const c = candidateSlots({ prefs: { ...prefs, spanDays: 3, days: 'weekends' }, work: [], now });
    expect(c.map(x => x.day)).toEqual(['2026-10-16', '2026-10-17', '2026-10-23', '2026-10-24']);
    expect(daysFit('2026-10-24', 2, 'weekends')).toBe(true);    // Sat–Sun
    expect(daysFit('2026-10-25', 2, 'weekends')).toBe(false);   // Sun–Mon
    expect(daysFit('2026-10-19', 5, 'weekdays')).toBe(true);    // Mon–Fri
    expect(daysFit('2026-10-22', 3, 'weekdays')).toBe(false);   // Thu–Sat
  });

  it('keeps runs that hit your work days, and can tell which do', () => {
    const work = [{
      id: 'w', preset: 'standard' as const, scope: { kind: 'ongoing' as const }, holidaysOff: [], createdAt: 0,
      pattern: { 1: { start: '09:00', end: '17:00' } },   // Mondays
    }];
    expect(workConflict(work, at('2026-10-24'), at('2026-10-27'))).not.toBeNull();   // Sat–Mon
    expect(workConflict(work, at('2026-10-23'), at('2026-10-26'))).toBeNull();       // Fri–Sun
    const days = candidateSlots({ prefs: { ...prefs, spanDays: 3 }, work, now }).map(c => c.day);
    expect(days).toContain('2026-10-24');
  });

  it('reads the length from the idea', () => {
    expect(spanHint('Camping weekend at the lake. Two nights, tents or the cabins')).toEqual({ spanDays: 3, days: 'any' });
    expect(spanHint('Ski weekend')).toEqual({ spanDays: 2, days: 'weekends' });
    expect(spanHint('4 days in Lisbon')).toEqual({ spanDays: 4, days: 'any' });
    expect(spanHint('Dinner at 7')).toBeNull();
  });
});

describe('preferences over several days', () => {
  it('a Fri–Sun trip counts as a weekend', () => {
    expect(isWeekend(trip)).toBe(true);
    expect(isWeekend({ start: at('2026-10-20'), end: at('2026-10-23') })).toBe(false);   // Tue–Thu
  });

  it('taking a whole weekend uses up the free weekend day', () => {
    expect(sheepContext(trip, ['ana'], []).weekend_taken).toEqual(['ana']);
  });

  it('a plan the day after it ends is close by; one in the middle is busy', () => {
    const after = [{ who: 'ana', start: Date.parse(at('2026-10-26', '18:00')), end: Date.parse(at('2026-10-26', '20:00')) }];
    expect(sheepContext(trip, ['ana'], after).nearby).toEqual({ ana: 1 });
    const during = [{ who: 'ana', start: Date.parse(at('2026-10-24', '18:00')), end: Date.parse(at('2026-10-24', '20:00')) }];
    expect(sheepContext(trip, ['ana'], during).sheep_busy).toEqual(['ana']);
  });
});

describe('duration choices', () => {
  it('typed days: numbers, days, or weeks, 2 to 30', () => {
    expect(parseSpan('3')).toBe(3);
    expect(parseSpan('10 days')).toBe(10);
    expect(parseSpan('2 weeks')).toBe(14);
    expect(parseSpan('1 week')).toBe(7);
    expect(parseSpan('2w')).toBe(14);
    expect(parseSpan('1')).toBeNull();
    expect(parseSpan('5 weeks')).toBeNull();
    expect(parseSpan('a while')).toBeNull();
  });

  it('a two-week trip is fourteen whole days', () => {
    const now = new Date(at('2026-10-15', '12:00'));
    const [first] = candidateSlots({
      prefs: { partOfDay: 'any', horizon: 'twoWeeks', days: 'any', duration: null, spanDays: 14, onlyDate: null }, work: [], now,
    });
    expect(daysCovered(first.slot.start, first.slot.end)).toHaveLength(14);
  });

  it('hours are optional: dinner doesn’t set one, but still holds two hours', () => {
    const dinner = defaultPrefs({ start: '19:00' });
    expect(dinner.duration).toBeNull();
    expect(durationOf(dinner)).toBe(120);
    expect(defaultPrefs({ start: '17:00', end: '18:30' }).duration).toBe(60);   // nearest of 1–4 hrs
  });
});

describe('later: a chosen month', () => {
  const now = new Date(at('2026-10-15', '12:00'));
  const prefs = { partOfDay: 'evening' as const, horizon: 'later' as const, days: 'any' as const, duration: null, onlyDate: null };

  it('lists the next twelve months, starting next month', () => {
    const months = laterMonths('2026-10-15');
    expect(months[0]).toEqual({ key: '2026-11', label: 'November 2026' });
    expect(months[2]).toEqual({ key: '2027-01', label: 'January 2027' });
    expect(months).toHaveLength(12);
  });

  it('looks only in that month', () => {
    const days = candidateSlots({ prefs: { ...prefs, month: '2027-01' }, work: [], now, perDay: 1 }).map(c => c.day);
    expect(days[0]).toBe('2027-01-01');
    expect(days[days.length - 1]).toBe('2027-01-31');
    expect(days.every(d => d.startsWith('2027-01'))).toBe(true);
  });

  it('without a month, still a few weeks out', () => {
    const days = candidateSlots({ prefs, work: [], now, perDay: 1 }).map(c => c.day);
    expect(days[0]).toBe('2026-10-29');
  });

  it('checks plans around that month', () => {
    const [from, to] = searchRange({ ...prefs, month: '2027-01' });
    expect(from).toBe(at('2026-12-31'));
    expect(to).toBe(at('2027-02-02'));
  });
});
