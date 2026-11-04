// Keeping Plans calm as it fills up: what's gone quiet folds away by itself,
// so nobody has to file or clean anything.
//
//   Resting      a Brainstorm idea nobody has touched in about three months.
//                It moves to a Resting pile at the bottom; nothing's deleted,
//                and any new note, vote or share (or its season arriving)
//                brings it back.
//   Quiet lately a plan in Finish planning with no activity for two weeks.
//                It folds into its own group with a gentle "Still on?".
//   Tidy         about once a month, when a few ideas are resting, one card
//                offers to look through them, one at a time: Keep or Let go.
//
// "Keep" is remembered on this device (quietStore) and counts as activity, so
// a kept idea or plan stays out for another stretch.

import { Idea } from '../types';
import { activityAt, inSeason } from './whiteboard';

const DAY = 86400000;
export const RESTING_AFTER_DAYS = 90;
export const QUIET_AFTER_DAYS = 14;
export const TIDY_EVERY_DAYS = 30;
export const TIDY_MIN_RESTING = 3;

/** The later of its last activity and when you last said Keep. */
export function quietSince(idea: Idea, keptAt?: string): number {
  const at = Date.parse(activityAt(idea));
  return keptAt ? Math.max(at, Date.parse(keptAt)) : at;
}

/** A Brainstorm idea that's been quiet three months, unless its season is here. */
export function isResting(idea: Idea, keptAt: string | undefined, now = new Date()): boolean {
  if (inSeason(idea, now)) return false;
  return now.getTime() - quietSince(idea, keptAt) > RESTING_AFTER_DAYS * DAY;
}

/** A plan being finished with nothing happening on it for two weeks. */
export function isQuiet(idea: Idea, keptAt: string | undefined, now = new Date()): boolean {
  return now.getTime() - quietSince(idea, keptAt) > QUIET_AFTER_DAYS * DAY;
}

/** Offer a tidy when enough is resting and it's been a month since the last offer. */
export function shouldOfferTidy(restingCount: number, lastOfferedAt: string | null, now = new Date()): boolean {
  if (restingCount < TIDY_MIN_RESTING) return false;
  return !lastOfferedAt || now.getTime() - Date.parse(lastOfferedAt) > TIDY_EVERY_DAYS * DAY;
}

/** "November", or "November 2027" outside this year. */
export function monthLabel(iso: string, now = new Date()): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', d.getFullYear() === now.getFullYear() ? { month: 'long' } : { month: 'long', year: 'numeric' });
}
