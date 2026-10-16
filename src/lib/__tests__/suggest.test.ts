import { describe, it, expect, vi } from 'vitest';
import { DEFAULT_SOFT_PREFS } from '../availability';
import { Candidate, Scored, rankSuggestions, scoreLocally, sheepContext, spreadPick } from '../suggest';

vi.mock('@react-native-async-storage/async-storage', () => ({ default: { getItem: async () => null, setItem: async () => {} } }));
const { candidateSlots, findSlots } = await import('../planner');

const NY = 'America/New_York';
const now = new Date('2026-10-15T12:00:00Z');   // Thu
const prefs = { partOfDay: 'evening' as const, horizon: 'twoWeeks' as const, days: 'any' as const, duration: 120, onlyDate: null };
const H = 3600_000;

const allFree = (c: Candidate, n = 3): Scored => ({ ...c, fit: { available: n, busy: 0, unknown: 0, total: n }, penalty: 0 });
const cand = (day: string, hour: number, order = 0): Candidate => {
  const start = new Date(`${day}T${String(hour).padStart(2, '0')}:00:00Z`).toISOString();
  return { slot: { start, end: new Date(Date.parse(start) + 2 * H).toISOString() }, day, order };
};

describe('rankSuggestions', () => {
  it.each(['soon', 'twoWeeks', 'later'] as const)('with everyone free and default preferences, matches findSlots (%s)', horizon => {
    const p = { ...prefs, horizon };
    const today = findSlots({ busy: [], work: [], prefs: p, now, timeZone: NY, preferredStart: '19:00' });
    const ranked = rankSuggestions(
      candidateSlots({ work: [], prefs: p, now, timeZone: NY, preferredStart: '19:00' }).map(c => allFree(c)),
      { soon: horizon === 'soon' });
    expect(ranked.map(r => ({ start: r.slot.start, end: r.slot.end }))).toEqual(today);
  });

  it('known-free count comes first, then fewer conflicts, then preferences', () => {
    const a = { ...cand('2026-10-20', 23), fit: { available: 2, busy: 0, unknown: 1, total: 3 }, penalty: 5 };
    const b = { ...cand('2026-10-21', 23), fit: { available: 1, busy: 0, unknown: 2, total: 3 }, penalty: 0 };
    const c = { ...cand('2026-10-22', 23), fit: { available: 1, busy: 1, unknown: 1, total: 3 }, penalty: 0 };
    expect(rankSuggestions([c, b, a], { soon: false, max: 1, min: 1 })[0].day).toBe('2026-10-20');
    expect(rankSuggestions([c, b], { soon: false, max: 1, min: 1 })[0].day).toBe('2026-10-21');
  });

  it('a soft preference never removes options', () => {
    const days = ['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22'];
    const ranked = rankSuggestions(days.map(d => ({ ...allFree(cand(d, 23)), penalty: 4 })), { soon: false });
    expect(ranked).toHaveLength(4);
  });

  it('times someone is busy for only fill in up to the minimum', () => {
    const free = [allFree(cand('2026-10-19', 23)), allFree(cand('2026-10-20', 23))];
    const conflicted = ['2026-10-21', '2026-10-22', '2026-10-23'].map(d =>
      ({ ...cand(d, 23), fit: { available: 2, busy: 1, unknown: 0, total: 3 }, penalty: 0 }));
    const ranked = rankSuggestions([...free, ...conflicted], { soon: false });
    expect(ranked).toHaveLength(3);
    expect(ranked.filter(r => r.fit.busy > 0)).toHaveLength(1);
  });

  it('one option per day, the day’s most natural time when equally good', () => {
    const ranked = rankSuggestions([allFree(cand('2026-10-19', 22, 3)), allFree(cand('2026-10-19', 23, 0))], { soon: false });
    expect(ranked).toHaveLength(1);
    expect(ranked[0].order).toBe(0);
  });
});

describe('space out my plans', () => {
  const me = 'me';
  // A Sheep dinner Wednesday Oct 21, 7–9pm New York.
  const plans = [{ who: me, start: Date.parse('2026-10-21T23:00:00Z'), end: Date.parse('2026-10-22T01:00:00Z') }];
  const days = ['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-24', '2026-10-25'];
  // 9:30pm each night (01:30Z next day) — never overlapping the dinner.
  const cands = days.map((d, i) => {
    const start = new Date(Date.parse(`${d}T00:00:00Z`) + 25.5 * H).toISOString();
    return { slot: { start, end: new Date(Date.parse(start) + H).toISOString() }, day: d, order: i * 0 };
  });
  const score = (spacing: boolean) => cands.map(c => scoreLocally(c, sheepContext(c.slot, [me], plans, NY), {
    people: [me], meId: me, myPrefs: { ...DEFAULT_SOFT_PREFS, spacing_enabled: spacing }, timeZone: NY,
  }));

  it('dates farther from a plan rank above the day before, of, and after', () => {
    const picked = rankSuggestions(score(true), { soon: false }).map(r => r.day);
    expect(picked).not.toContain('2026-10-21');
    expect(picked).toEqual(expect.arrayContaining(['2026-10-19', '2026-10-24', '2026-10-25']));
  });

  it('off by default: same picks as before', () => {
    expect(rankSuggestions(score(false), { soon: false }).map(r => r.day))
      .toEqual(spreadPick(days, 4, false));
  });
});

describe('sheepContext', () => {
  const people = ['ana', 'ben'];

  it('marks busy, nearby, and a taken weekend day', () => {
    // Saturday Oct 24, 2–4pm New York; Ana has Sunday brunch, Ben has Friday dinner.
    const sat = { start: '2026-10-24T18:00:00Z', end: '2026-10-24T20:00:00Z' };
    const plans = [
      { who: 'ana', start: Date.parse('2026-10-25T15:00:00Z'), end: Date.parse('2026-10-25T17:00:00Z') },
      { who: 'ben', start: Date.parse('2026-10-23T23:00:00Z'), end: Date.parse('2026-10-24T01:00:00Z') },
    ];
    const ctx = sheepContext(sat, people, plans, NY);
    expect(ctx.sheep_busy).toEqual([]);
    expect(ctx.nearby).toEqual({ ana: 1, ben: 1 });
    expect(ctx.weekend_taken).toEqual(['ana']);
  });

  it('an overnight plan counts on both days and blocks its early hours', () => {
    const plans = [{ who: 'ana', start: Date.parse('2026-10-24T02:00:00Z'), end: Date.parse('2026-10-24T06:00:00Z') }];   // Fri 10pm–Sat 2am NY
    const early = sheepContext({ start: '2026-10-24T05:00:00Z', end: '2026-10-24T06:30:00Z' }, people, plans, NY);
    expect(early.sheep_busy).toEqual(['ana']);
    const satNight = sheepContext({ start: '2026-10-24T23:00:00Z', end: '2026-10-25T01:00:00Z' }, people, plans, NY);
    expect(satNight.nearby.ana).toBe(2);
  });

  it('uses the planning time zone across a daylight-saving change', () => {
    // Sunday Nov 1 is the fall-back day; a Saturday-night plan is still "the other weekend day".
    const plans = [{ who: 'ana', start: Date.parse('2026-11-01T00:00:00Z'), end: Date.parse('2026-11-01T02:00:00Z') }];   // Sat 8–10pm EDT
    const sunday = sheepContext({ start: '2026-11-01T19:00:00Z', end: '2026-11-01T21:00:00Z' }, people, plans, NY);
    expect(sunday.weekend_taken).toEqual(['ana']);
  });
});

describe('scoreLocally', () => {
  it('nobody is claimed free without a connected calendar', () => {
    const c = cand('2026-10-20', 23);
    const s = scoreLocally(c, sheepContext(c.slot, ['me', 'ana'], [], NY), { people: ['me', 'ana'], meId: 'me', myPrefs: DEFAULT_SOFT_PREFS });
    expect(s.fit).toEqual({ available: 0, busy: 0, unknown: 2, total: 2 });
  });
});
