import { describe, it, expect } from 'vitest';
import { whatNeedsYou } from '../needsYou';
import { AppNotification, Event, Idea } from '../../types';

const DAY = 86400000;
const NOW = Date.now();

const ev = (id: string, days: number, by: string, attendees: string[], extra: Partial<Event> = {}): Event => {
  const start = new Date(NOW + days * DAY).toISOString();
  return {
    id, group_id: 'fam', title: id, description: null, location: null,
    start_time: start, end_time: new Date(Date.parse(start) + 3600000).toISOString(),
    created_by: by, attendees, created_at: start, ...extra,
  };
};

const keys = (m: Map<string, { key: string }[]>, id: string) => (m.get(id) ?? []).map(i => i.key);

describe('whatNeedsYou', () => {
  it('files an unanswered invite under who sent it and its group', () => {
    const { byPerson, byGroup } = whatNeedsYou([ev('club', 3, 'ana', ['ana', 'me'])], [], [], 'me', NOW);
    expect(keys(byPerson, 'ana')).toEqual(['reply-club']);
    expect(keys(byGroup, 'fam')).toEqual(['reply-club']);
  });

  it('never dots anyone for plans you organize, past plans, or ones already answered', () => {
    const { byPerson } = whatNeedsYou([
      ev('mine', 3, 'me', ['me', 'ana'], { assignments: [{ id: 'a', item: 'Dessert', assignee_id: null }] }),
      ev('old', -3, 'ana', ['ana', 'me']),
      ev('yes', 3, 'ana', ['ana', 'me'], { rsvps: { me: 'going' } }),
    ], [], [], 'me', NOW);
    expect(byPerson.size).toBe(0);
  });

  it('flags open items on a plan soon, under its organizer', () => {
    const dinner = ev('dinner', 2, 'ana', ['ana', 'me', 'ben'], {
      rsvps: { me: 'going' }, assignments: [{ id: 'a', item: 'Dessert', assignee_id: null }, { id: 'b', item: 'Bread', assignee_id: 'ben' }],
    });
    const later = { ...dinner, id: 'later', start_time: new Date(NOW + 30 * DAY).toISOString(), end_time: new Date(NOW + 30 * DAY + 3600000).toISOString() };
    const { byPerson } = whatNeedsYou([dinner, later], [], [], 'me', NOW);
    expect(byPerson.get('ana')?.map(i => i.label)).toEqual(['dinner still needs Dessert']);
    expect(byPerson.has('ben')).toBe(false);
  });

  it('counts a repeating invite once', () => {
    const occ = (d: number) => ({ ...ev(`s@${d}`, d, 'ana', ['ana', 'me']), series_id: 's' });
    expect(keys(whatNeedsYou([occ(3), occ(10)], [], [], 'me', NOW).byPerson, 'ana')).toEqual(['reply-s']);
  });

  it('includes date votes you owe and unread notifications', () => {
    const slot = { start: new Date(NOW + 5 * DAY).toISOString(), end: new Date(NOW + 5 * DAY + 3600000).toISOString() };
    const idea: Idea = {
      id: 'tacos', group_id: 'fam', title: 'Tacos', description: null, votes: 0, status: 'proposed',
      audience_group_ids: [], audience_user_ids: ['me'], audience_contact_ids: [], location: null, target_date: null,
      proposed_slots: [slot], slot_votes: { chloe: [slot.start] }, event_id: null, planned_at: null,
      created_by: 'chloe', created_at: new Date(NOW).toISOString(),
    };
    const note = (id: string, read: boolean): AppNotification => ({
      id, user_id: 'me', actor_id: 'dev', kind: 'comment', idea_id: 'tacos', event_id: null,
      title: 'Dev commented', body: null, read_at: read ? new Date(NOW).toISOString() : null, created_at: new Date(NOW).toISOString(),
    });
    const { byPerson, byGroup } = whatNeedsYou([], [idea], [note('n1', false), note('n2', true)], 'me', NOW);
    expect(keys(byPerson, 'chloe')).toEqual(['dates-tacos']);
    expect(keys(byPerson, 'dev')).toEqual(['n-n1']);
    expect(keys(byGroup, 'fam')).toEqual(['dates-tacos', 'n-n1']);
  });
});
