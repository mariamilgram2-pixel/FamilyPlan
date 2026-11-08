import { describe, it, expect } from 'vitest';
import { awaitingYourDates, declinedBy, readyToSend, responders, responseOf, stageOf, tentativeBy } from '../plans';
import { awaitedVoters, dateVoters } from '../rsvp';
import { Idea } from '../../types';

const future = (days: number) => {
  const start = new Date(Date.now() + days * 86400000).toISOString();
  return { start, end: new Date(Date.parse(start) + 7200000).toISOString() };
};
const [a, b] = [future(3), future(5)];

const idea = (slot_votes: Record<string, string[]>, audience = ['ana', 'ben']): Idea => ({
  id: 'i1', group_id: 'g', title: 'Pottery', description: null, votes: 0, status: 'proposed',
  audience_group_ids: [], audience_user_ids: audience, audience_contact_ids: [], location: null,
  target_date: null, proposed_slots: [a, b], slot_votes, event_id: null, planned_at: null,
  created_by: 'org', created_at: new Date().toISOString(),
});

describe('proposing dates is not a vote', () => {
  it('a fresh proposal has no answers, and waits only on the people asked', () => {
    const i = idea({});
    expect(awaitedVoters(i)).toEqual(['ana', 'ben']);
    expect(dateVoters(i)).toContain('org');           // still told about it
  });

  it('the organizer isn’t nagged to answer their own dates', () => {
    expect(awaitingYourDates(idea({}), 'org')).toBe(false);
    expect(awaitingYourDates(idea({}), 'ana')).toBe(true);
    expect(awaitingYourDates(idea({ ana: [a.start] }), 'ana')).toBe(false);
  });

  it('an organizer who does answer is counted like anyone', () => {
    expect(awaitedVoters(idea({ org: [a.start] }))).toEqual(['org', 'ana', 'ben']);
  });
});

describe('readyToSend', () => {
  it('not until everyone asked has answered', () => {
    expect(readyToSend(idea({}), 'org')).toBe(false);
    expect(readyToSend(idea({ ana: [a.start] }), 'org')).toBe(false);
  });

  it('once everyone asked has answered, without the organizer voting', () => {
    expect(readyToSend(idea({ ana: [a.start], ben: [] }), 'org')).toBe(true);
  });

  it('only for the organizer', () => {
    expect(readyToSend(idea({ ana: [a.start], ben: [b.start] }), 'ana')).toBe(false);
  });

  it('not when nobody else was asked', () => {
    expect(readyToSend(idea({ org: [a.start] }, []), 'org')).toBe(false);
  });

  it('“none of these work” still counts as answering', () => {
    expect(readyToSend(idea({ ana: [], ben: [] }), 'org')).toBe(true);
  });
});

describe('Ideas → Finish planning → Coming up', () => {
  it('starting to plan moves an idea on, and it stays even with no dates yet', () => {
    const fresh = { ...idea({}), proposed_slots: [] };
    expect(stageOf(fresh)).toBe('idea');
    expect(stageOf({ ...fresh, planning_started_at: new Date().toISOString() })).toBe('dates');
  });

  it('once it’s booked, nobody is asked for dates anymore', () => {
    const booked = { ...idea({}), status: 'planned' as const, proposed_slots: [a], event_id: 'e1' };
    expect(awaitingYourDates(booked, 'ana')).toBe(false);
    expect(readyToSend({ ...booked, slot_votes: { ana: [], ben: [] } }, 'org')).toBe(false);
  });

  it('nobody is asked for dates until there are dates to pick', () => {
    const started = { ...idea({}), proposed_slots: [], planning_started_at: new Date().toISOString() };
    expect(awaitingYourDates(started, 'ana')).toBe(false);
    expect(readyToSend({ ...started, slot_votes: { ana: [], ben: [] } }, 'org')).toBe(false);
  });
});

describe('can’t make it', () => {
  const out = { ...idea({ ben: [a.start] }), declined_user_ids: ['ana'] };

  it('takes you off who’s asked, and stops asking you', () => {
    expect(declinedBy(out, 'ana')).toBe(true);
    expect(dateVoters(out)).not.toContain('ana');
    expect(awaitingYourDates(out, 'ana')).toBe(false);
  });

  it('the rest can finish without you', () => {
    expect(readyToSend(out, 'org')).toBe(true);
  });
});

describe('maybe: plan without me', () => {
  const maybe = { ...idea({ ben: [b.start] }), tentative_user_ids: ['ana'] };

  it('stays on the plan, but nobody waits on you', () => {
    expect(tentativeBy(maybe, 'ana')).toBe(true);
    expect(dateVoters(maybe)).toContain('ana');        // still told, still invited
    expect(awaitedVoters(maybe)).not.toContain('ana');
    expect(awaitingYourDates(maybe, 'ana')).toBe(false);
  });

  it('the organizer can send once everyone else has answered', () => {
    expect(readyToSend(maybe, 'org')).toBe(true);
  });
});

describe('answers: In, Maybe, Can’t', () => {
  const answered = {
    ...idea({}),
    idea_votes: [{ id: 'v1', idea_id: 'i1', user_id: 'ben', created_at: '' }],
    tentative_user_ids: ['ana'],
    declined_user_ids: ['cy'],
  };

  it('reads each person’s answer', () => {
    expect(responseOf(answered, 'ben')).toBe('in');
    expect(responseOf(answered, 'ana')).toBe('maybe');
    expect(responseOf(answered, 'cy')).toBe('cant');
    expect(responseOf(answered, 'dee')).toBeNull();
  });

  it('lists who said what', () => {
    expect(responders(answered)).toEqual({ in: ['ben'], maybe: ['ana'], cant: ['cy'] });
  });
});
