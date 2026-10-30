import { describe, it, expect } from 'vitest';
import { isNew, seasonNote, seasonOf, sortIdeas } from '../whiteboard';
import { Idea } from '../../types';

const idea = (id: string, patch: Partial<Idea> = {}): Idea => ({
  id, group_id: 'g', title: id, description: null, votes: 0, status: 'proposed',
  audience_group_ids: [], audience_user_ids: [], audience_contact_ids: [], location: null,
  target_date: null, proposed_slots: [], event_id: null, planned_at: null,
  created_by: 'ana', created_at: '2026-10-01T12:00:00Z', ...patch,
});
const oct = new Date('2026-10-29T12:00:00');

describe('seasons', () => {
  it('follows the months', () => {
    expect(seasonOf(new Date('2026-03-01T12:00:00'))).toBe('spring');
    expect(seasonOf(new Date('2026-08-31T12:00:00'))).toBe('summer');
    expect(seasonOf(oct)).toBe('fall');
    expect(seasonOf(new Date('2026-12-15T12:00:00'))).toBe('winter');
    expect(seasonOf(new Date('2027-02-10T12:00:00'))).toBe('winter');
  });

  it('says when its time has come', () => {
    expect(seasonNote(idea('a', { season: 'fall' }), oct)).toBe('In season now');
    expect(seasonNote(idea('a', { season: 'spring' }), oct)).toBe('Best in spring');
    expect(seasonNote(idea('a'), oct)).toBeNull();
  });
});

describe('sorting', () => {
  it('puts in-season ideas first, then the most recent activity', () => {
    const list = [
      idea('old', { last_activity_at: '2026-10-02T00:00:00Z' }),
      idea('busy', { last_activity_at: '2026-10-28T00:00:00Z' }),
      idea('vermont', { season: 'fall', last_activity_at: '2026-09-01T00:00:00Z' }),
      idea('camping', { season: 'spring', last_activity_at: '2026-10-27T00:00:00Z' }),
      idea('untracked', { created_at: '2026-10-20T00:00:00Z' }),
    ];
    expect(sortIdeas(list, oct).map(i => i.id)).toEqual(['vermont', 'busy', 'camping', 'untracked', 'old']);
  });
});

describe('what’s new', () => {
  const base = '2026-10-10T00:00:00Z';
  const touched = (by: string, at = '2026-10-20T00:00:00Z') => idea('a', { last_activity_by: by, last_activity_at: at });

  it('is new when someone else did something since you looked', () => {
    expect(isNew(touched('ben'), '2026-10-15T00:00:00Z', base, 'me')).toBe(true);
    expect(isNew(touched('ben'), '2026-10-21T00:00:00Z', base, 'me')).toBe(false);
  });

  it('falls back to when you started keeping track', () => {
    expect(isNew(touched('ben'), undefined, base, 'me')).toBe(true);
    expect(isNew(touched('ben', '2026-10-01T00:00:00Z'), undefined, base, 'me')).toBe(false);
  });

  it('never for your own changes or drafts', () => {
    expect(isNew(touched('me'), undefined, base, 'me')).toBe(false);
    expect(isNew({ ...touched('ben'), status: 'draft' }, undefined, base, 'me')).toBe(false);
  });
});
