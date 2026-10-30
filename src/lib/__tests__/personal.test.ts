import { describe, it, expect } from 'vitest';
import { daysUntilBirthday, personStatus, sharedHistory } from '../personal';
import { Event } from '../../types';

const DAY = 86400000;
const NOW = Date.parse('2026-10-24T12:00:00Z');

const ev = (id: string, daysFromNow: number, attendees: string[], extra: Partial<Event> = {}): Event => {
  const start = new Date(NOW + daysFromNow * DAY).toISOString();
  return {
    id, group_id: 'g', title: id, description: null, location: null,
    start_time: start, end_time: new Date(Date.parse(start) + 2 * 3600000).toISOString(),
    created_by: attendees[0], attendees, created_at: start, ...extra,
  };
};

describe('sharedHistory', () => {
  it('counts plans you were both part of, newest first, with the next one apart', () => {
    const h = sharedHistory([
      ev('brunch', -2, ['me', 'ana']),
      ev('market', -30, ['me', 'ana']),
      ev('soccer', -5, ['ben', 'ana']),             // you weren't there
      ev('hike', 5, ['me', 'ana']),
      ev('recital', 8, ['me', 'ana']),
    ], 'me', 'ana', NOW);
    expect(h.past.map(p => p.event.id)).toEqual(['brunch', 'market']);
    expect(h.pastCount).toBe(2);
    expect(h.next?.id).toBe('hike');
    expect(h.firstAt).toBe(new Date(NOW - 30 * DAY).toISOString());
  });

  it('leaves out declined and cancelled plans', () => {
    const h = sharedHistory([
      ev('a', -3, ['me', 'ana'], { rsvps: { ana: 'declined' } }),
      ev('b', -4, ['ana', 'me'], { rsvps: { me: 'declined' } }),
      ev('c', -5, ['me', 'ana'], { cancelled_at: new Date(NOW).toISOString() }),
    ], 'me', 'ana', NOW);
    expect(h.pastCount).toBe(0);
    expect(h.past).toEqual([]);
  });

  it('folds repeats of one series into a row, counting each time', () => {
    const supper = (d: number) => ({ ...ev(`s@${d}`, d, ['me', 'ana']), series_id: 's' });
    const h = sharedHistory([supper(-21), supper(-14), supper(-7), ev('brunch', -2, ['me', 'ana'])], 'me', 'ana', NOW);
    expect(h.past.map(p => [p.event.series_id ?? p.event.id, p.times])).toEqual([['brunch', 1], ['s', 3]]);
    expect(h.pastCount).toBe(4);
  });
});

describe('daysUntilBirthday', () => {
  const today = new Date(2026, 9, 24);
  it('counts forward, wrapping into next year', () => {
    expect(daysUntilBirthday('10-24', today)).toBe(0);
    expect(daysUntilBirthday('11-02', today)).toBe(9);
    expect(daysUntilBirthday('10-23', today)).toBe(364);
  });
});

describe('personStatus', () => {
  const noon = new Date(2026, 9, 24, 12).getTime();
  const history = (next: Event | null, lastDaysAgo: number | null) => ({
    past: lastDaysAgo === null ? [] : [{ event: ev('last', -lastDaysAgo + (NOW - noon) / DAY, ['me', 'ana']), times: 1 }],
    pastCount: lastDaysAgo === null ? 0 : 1, next, firstAt: null,
  });

  it('puts what they need from you first, in tint', () => {
    const s = personStatus({ needs: ['Reply to Book club', 'Pick dates for Tacos'], history: null, birthday: '10-25', now: noon });
    expect(s).toEqual({ text: 'Reply to Book club · 1 more', tint: true, rank: 0, soon: 0 });
  });

  it('then whichever is sooner: a birthday or a plan together', () => {
    const hike = { ...ev('Hike', 0, ['me', 'ana']), start_time: new Date(2026, 9, 31, 8).toISOString() };
    expect(personStatus({ needs: [], history: history(hike, null), birthday: '11-02', now: noon }))
      .toMatchObject({ text: 'Hike · Oct 31', rank: 1, soon: 7 });
    expect(personStatus({ needs: [], history: history(hike, null), birthday: '10-26', now: noon }))
      .toMatchObject({ text: 'Birthday in 2 days', rank: 1, soon: 2 });
  });

  it('then how long it’s been, only once it’s been a while', () => {
    expect(personStatus({ needs: [], history: history(null, 47), now: noon }).text).toBe('Last together 6 weeks ago');
    expect(personStatus({ needs: [], history: history(null, 10), now: noon }).text).toBeNull();
  });
});
