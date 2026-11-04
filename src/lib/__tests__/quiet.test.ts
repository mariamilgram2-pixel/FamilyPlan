import { describe, it, expect } from 'vitest';
import { isQuiet, isResting, monthLabel, quietSince, shouldOfferTidy } from '../quiet';
import { Idea } from '../../types';

const DAY = 86400000;
const now = new Date('2026-11-03T12:00:00Z');
const ago = (days: number) => new Date(now.getTime() - days * DAY).toISOString();

const idea = (lastActivityDaysAgo: number, extra: Partial<Idea> = {}): Idea => ({
  id: 'i1', group_id: 'g', title: 'Ice skating', description: null, votes: 0, status: 'proposed',
  audience_group_ids: [], audience_user_ids: [], audience_contact_ids: [], location: null,
  target_date: null, proposed_slots: [], event_id: null, planned_at: null,
  created_by: 'me', created_at: ago(400), last_activity_at: ago(lastActivityDaysAgo), ...extra,
});

describe('Resting', () => {
  it('rests after three quiet months, not before', () => {
    expect(isResting(idea(89), undefined, now)).toBe(false);
    expect(isResting(idea(91), undefined, now)).toBe(true);
  });

  it('comes back when its season arrives', () => {
    expect(isResting(idea(200, { season: 'fall' }), undefined, now)).toBe(false);   // November is fall
    expect(isResting(idea(200, { season: 'summer' }), undefined, now)).toBe(true);
  });

  it('Keep counts as activity', () => {
    expect(isResting(idea(200), ago(10), now)).toBe(false);
    expect(quietSince(idea(200), ago(10))).toBe(Date.parse(ago(10)));
  });

  it('falls back to when it was made', () => {
    expect(isResting(idea(0, { last_activity_at: null, created_at: ago(120) }), undefined, now)).toBe(true);
  });
});

describe('Quiet lately', () => {
  it('after two weeks with nothing happening', () => {
    expect(isQuiet(idea(13), undefined, now)).toBe(false);
    expect(isQuiet(idea(15), undefined, now)).toBe(true);
    expect(isQuiet(idea(15), ago(1), now)).toBe(false);
  });
});

describe('Tidy', () => {
  it('needs a few resting, and a month since the last offer', () => {
    expect(shouldOfferTidy(2, null, now)).toBe(false);
    expect(shouldOfferTidy(3, null, now)).toBe(true);
    expect(shouldOfferTidy(5, ago(10), now)).toBe(false);
    expect(shouldOfferTidy(5, ago(31), now)).toBe(true);
  });
});

describe('monthLabel', () => {
  it('adds the year only outside this one', () => {
    expect(monthLabel('2026-12-05T18:00:00', now)).toBe('December');
    expect(monthLabel('2027-01-05T18:00:00', now)).toBe('January 2027');
  });
});
