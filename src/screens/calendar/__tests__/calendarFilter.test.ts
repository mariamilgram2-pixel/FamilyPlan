import { describe, it, expect } from 'vitest';
import { calendarEvents } from '../calendarFilter';
import { Event } from '../../../types';

const ev = (id: string, o: Partial<Event> = {}): Event => ({
  id, group_id: 'g1', title: id, description: null,
  start_time: '2026-10-15T10:00:00Z', end_time: '2026-10-15T11:00:00Z',
  location: null, created_by: 'other', attendees: [], created_at: '2026-10-01T00:00:00Z',
  ...o,
});
const ids = (l: { id: string }[]) => l.map(e => e.id).sort();

describe('calendarEvents', () => {
  it('my calendar: only events I made or was invited to, once, no overlay', () => {
    const events = [
      ev('made', { created_by: 'me' }),
      ev('invited', { attendees: ['me'] }),
      ev('both', { created_by: 'me', attendees: ['me'], group_id: 'g2' }),
      ev('dup', { created_by: 'me' }),
      ev('dup', { created_by: 'me' }),
      ev('neither', { attendees: ['someone'] }),
    ];
    const r = calendarEvents(events, { meId: 'me', groupId: null, showMine: true });
    expect(ids(r)).toEqual(['both', 'dup', 'invited', 'made']);
    expect(r.some(e => e.overlay)).toBe(false);
  });

  it('shared calendar: membership by group_id or invited_group_ids, not member invites', () => {
    const events = [
      ev('native', { group_id: 'g1' }),
      ev('invitedGroup', { group_id: 'g2', invited_group_ids: ['g1'] }),
      ev('memberOnly', { group_id: 'g2', attendees: ['friend'] }),
      ev('elsewhere', { group_id: 'g2' }),
    ];
    const r = calendarEvents(events, { meId: 'me', groupId: 'g1', showMine: false });
    expect(ids(r)).toEqual(['invitedGroup', 'native']);
  });

  it('showMine adds my other events as overlays; events on both appear once, unmarked', () => {
    const events = [
      ev('onGroup', { group_id: 'g1', created_by: 'me' }),
      ev('personal', { group_id: 'g2', attendees: ['me'] }),
      ev('theirs', { group_id: 'g2' }),
    ];
    const r = calendarEvents(events, { meId: 'me', groupId: 'g1', showMine: true });
    expect(ids(r)).toEqual(['onGroup', 'personal']);
    expect(r.find(e => e.id === 'onGroup')!.overlay).toBeUndefined();
    expect(r.find(e => e.id === 'personal')!.overlay).toBe(true);
    expect(calendarEvents(events, { meId: 'me', groupId: 'g1', showMine: false }).map(e => e.id)).toEqual(['onGroup']);
  });

  it("another member never gets my personal events", () => {
    const events = [ev('mine', { group_id: 'g2', created_by: 'me' }), ev('shared', { group_id: 'g1' })];
    const r = calendarEvents(events, { meId: 'friend', groupId: 'g1', showMine: true });
    expect(ids(r)).toEqual(['shared']);
    expect(r.some(e => e.overlay)).toBe(false);
  });

  it('does not mutate source events', () => {
    const events = [ev('personal', { group_id: 'g2', created_by: 'me' })];
    const snapshot = JSON.stringify(events);
    const r = calendarEvents(events, { meId: 'me', groupId: 'g1', showMine: true });
    expect(r[0].overlay).toBe(true);
    expect(JSON.stringify(events)).toBe(snapshot);
    expect('overlay' in events[0]).toBe(false);
  });
});
