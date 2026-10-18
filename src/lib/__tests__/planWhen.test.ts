import { describe, it, expect, vi } from 'vitest';

vi.mock('@react-native-async-storage/async-storage', () => ({ default: { getItem: async () => null, setItem: async () => {} } }));
const { parseIdeaText } = await import('../nlIdea');
const { isExact, lockedSlot, parseClock, prefsFor, rangeDays, whenLabel } = await import('../planWhen');
const { candidateSlots, defaultPrefs } = await import('../planner');

const SUN = '2026-10-18', WED = '2026-10-21', SAT = '2026-10-24';
const ana = [{ id: 'ana', full_name: 'Ana Reyes' }];
const at = (key: string, hm = '00:00') => new Date(`${key}T${hm}:00`).toISOString();

describe('ranges of days', () => {
  it('this week is the next seven days, even on a Sunday', () => {
    expect(rangeDays('thisWeek', WED)).toEqual([WED, '2026-10-27']);
    expect(rangeDays('thisWeek', SUN)).toEqual([SUN, SAT]);
  });
  it('weekends and next week', () => {
    expect(rangeDays('thisWeekend', WED)).toEqual([SAT, '2026-10-25']);
    expect(rangeDays('thisWeekend', SUN)).toEqual([SUN, SUN]);
    expect(rangeDays('nextWeek', WED)).toEqual(['2026-10-26', '2026-11-01']);
    expect(rangeDays('nextWeekend', WED)).toEqual(['2026-10-31', '2026-11-01']);
  });
});

describe('reading an idea', () => {
  it('“this week” is a range, and dinner is an evening, not 7 sharp', () => {
    const p = parseIdeaText('dinner with ana this week', { today: WED, people: ana });
    expect(p).toMatchObject({ range: 'thisWeek', part: 'evening', personIds: ['ana'] });
    expect(p.date).toBeUndefined();
    expect(p.start).toBeUndefined();
    expect(p.title).toBe('Dinner with Ana');
  });
  it('a stated time is exact', () => {
    const p = parseIdeaText('dinner friday at 7', { today: WED, people: [] });
    expect(p.date).toBe('2026-10-23');
    expect(p.start).toBe('19:00');
    expect(p.part).toBeUndefined();
  });
  it('next weekend, and parts of the day', () => {
    expect(parseIdeaText('hike next weekend morning', { today: WED, people: [] })).toMatchObject({ range: 'nextWeekend', part: 'morning' });
    expect(parseIdeaText('board games tonight', { today: WED, people: [] })).toMatchObject({ date: WED, part: 'evening' });
  });
});

describe('when', () => {
  it('reads times people type', () => {
    expect(parseClock('7pm')).toBe('19:00');
    expect(parseClock('7:30 pm')).toBe('19:30');
    expect(parseClock('19:00')).toBe('19:00');
    expect(parseClock('7')).toBe('19:00');
    expect(parseClock('9')).toBe('09:00');
    expect(parseClock('noon')).toBe('12:00');
    expect(parseClock('soon')).toBeNull();
  });

  it('labels what’s known', () => {
    expect(whenLabel({ day: { kind: 'range', range: 'thisWeek' }, time: { kind: 'part', part: 'evening' } })).toBe('This week · evening');
    expect(whenLabel({ day: { kind: 'any' }, time: { kind: 'part', part: 'morning' } })).toBe('Any day · morning');
    expect(whenLabel({ day: { kind: 'any' }, time: { kind: 'any' } })).toBeNull();
  });

  it('a range searches only those days, at that part of the day', () => {
    const prefs = prefsFor({ day: { kind: 'range', range: 'thisWeekend' }, time: { kind: 'part', part: 'evening' } }, defaultPrefs({}), WED);
    expect(prefs.partOfDay).toBe('evening');
    const days = candidateSlots({ prefs, work: [], now: new Date(at(WED, '12:00')), perDay: 1 }).map(c => c.day);
    expect(days).toEqual([SAT, '2026-10-25']);
  });

  it('locks in only once the day and time are known', () => {
    const prefs = defaultPrefs({});
    const loose = { day: { kind: 'date' as const, date: SAT }, time: { kind: 'part' as const, part: 'evening' as const } };
    expect(isExact(loose)).toBe(false);
    expect(lockedSlot(loose, prefs)).toBeNull();
    const exact = { day: { kind: 'date' as const, date: SAT }, time: { kind: 'exact' as const, start: '19:00' } };
    expect(isExact(exact)).toBe(true);
    expect(lockedSlot(exact, prefs)).toEqual({ start: at(SAT, '19:00'), end: at(SAT, '21:00') });
    // A trip needs only its first day.
    expect(lockedSlot({ day: exact.day, time: { kind: 'any' } }, { ...prefs, spanDays: 2 })).toEqual({ start: at(SAT), end: at('2026-10-26') });
  });
});
