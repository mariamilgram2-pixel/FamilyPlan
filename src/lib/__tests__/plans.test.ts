import { describe, it, expect } from 'vitest';
import { awaitingYourDates, readyToSend } from '../plans';
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
