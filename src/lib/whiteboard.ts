// Ideas as a whiteboard: things you'd like to do someday, kept where you'll
// see them. What's moving (new notes, suggestions, a draft just shared) rises
// to the top, and an idea that's best in a season comes back when it arrives.

import { Idea, Season } from '../types';

export const SEASONS: Season[] = ['spring', 'summer', 'fall', 'winter'];

export const SEASON_LABEL: Record<Season, string> = {
  spring: 'Spring',
  summer: 'Summer',
  fall: 'Fall',
  winter: 'Winter',
};

/** Northern-hemisphere meteorological seasons: Mar–May is spring, and so on. */
export function seasonOf(d: Date): Season {
  const m = d.getMonth();
  return m >= 2 && m <= 4 ? 'spring' : m >= 5 && m <= 7 ? 'summer' : m >= 8 && m <= 10 ? 'fall' : 'winter';
}

export const inSeason = (idea: Idea, now = new Date()) => !!idea.season && idea.season === seasonOf(now);

/** When something last happened on it. Ideas from before activity was tracked fall back to when they were made. */
export const activityAt = (idea: Idea) => idea.last_activity_at ?? idea.created_at;

/**
 * Something happened since you last looked, and it wasn't you. `baseline`
 * stands in for "last looked" on ideas you've never opened: when you started
 * keeping track, so a fresh install doesn't light up everything.
 */
export function isNew(idea: Idea, seenAt: string | undefined, baseline: string, meId: string | null) {
  if (idea.status === 'draft' || !idea.last_activity_by || idea.last_activity_by === meId) return false;
  return Date.parse(activityAt(idea)) > Date.parse(seenAt ?? baseline);
}

/** In season first, then most recent activity. */
export function sortIdeas(list: Idea[], now = new Date()): Idea[] {
  return [...list].sort((a, b) =>
    Number(inSeason(b, now)) - Number(inSeason(a, now)) || activityAt(b).localeCompare(activityAt(a)));
}

/** "Best in fall" on the row, or that its time has come. */
export function seasonNote(idea: Idea, now = new Date()): string | null {
  if (!idea.season) return null;
  return inSeason(idea, now) ? 'In season now' : `Best in ${idea.season}`;
}
