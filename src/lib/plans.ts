// A plan, from first idea to the day after.
//
// Ideas and events are stored separately, but people see one thing moving
// through stages, and the stage follows from what's true rather than from a
// status someone has to remember to change:
//
//   idea       — floated, nobody's planning it yet
//   dates      — being planned: started (even if left halfway), or date
//                options out with people saying which work
//   on         — booked: there's an event on the calendar
//   happened   — the event is over (or it was marked done)

import { Event, Idea, IdeaResponse } from '../types';
import { awaitedVoters, dateVoters } from './rsvp';

export type Stage = 'idea' | 'dates' | 'on' | 'happened';

export const STAGE_LABEL: Record<Stage, string> = {
  idea: 'Idea',
  dates: 'Finish planning',
  on: 'Coming up',
  happened: 'Happened',
};

const upcoming = (idea: Idea) => (idea.proposed_slots ?? []).filter(s => new Date(s.start).getTime() > Date.now());

export function stageOf(idea: Idea): Stage {
  if (idea.status === 'done') return 'happened';
  if (idea.status === 'planned') {
    const booked = idea.proposed_slots?.[0];
    return booked && new Date(booked.end).getTime() < Date.now() ? 'happened' : 'on';
  }
  return upcoming(idea).length || idea.planning_started_at ? 'dates' : 'idea';
}

/** You said you can't make it. */
export const declinedBy = (idea: Idea, userId: string | null) => !!userId && (idea.declined_user_ids ?? []).includes(userId);

/** You're a maybe: still on it, but they're planning without waiting on you. */
export const tentativeBy = (idea: Idea, userId: string | null) => !!userId && (idea.tentative_user_ids ?? []).includes(userId);

/** Someone's answer on an idea: In, Maybe, Can't, or nothing yet. */
export function responseOf(idea: Idea, userId: string | null): IdeaResponse | null {
  if (!userId) return null;
  if (declinedBy(idea, userId)) return 'cant';
  if (tentativeBy(idea, userId)) return 'maybe';
  return (idea.idea_votes ?? []).some(v => v.user_id === userId) ? 'in' : null;
}

/** Who said what, for the lists under an idea. */
export function responders(idea: Idea): Record<IdeaResponse, string[]> {
  return {
    in: (idea.idea_votes ?? []).map(v => v.user_id),
    maybe: idea.tentative_user_ids ?? [],
    cant: idea.declined_user_ids ?? [],
  };
}

/** Date options still in the future. */
export const openSlots = upcoming;

/** You're asked about its dates and haven't answered. Not the organizer: proposing isn't being asked. */
export function awaitingYourDates(idea: Idea, meId: string | null) {
  if (!meId || idea.created_by === meId || stageOf(idea) !== 'dates' || !upcoming(idea).length || declinedBy(idea, meId) || tentativeBy(idea, meId)) return false;
  const asked = dateVoters(idea).includes(meId) || (idea.audience_user_ids ?? []).includes(meId);
  return asked && !idea.slot_votes?.[meId];
}

/** You proposed it, and everyone has answered on dates: time to send the invite. */
export function readyToSend(idea: Idea, meId: string | null) {
  if (!meId || idea.created_by !== meId || stageOf(idea) !== 'dates' || !upcoming(idea).length) return false;
  const voters = awaitedVoters(idea);
  return voters.some(id => id !== meId) && voters.every(id => idea.slot_votes?.[id]);
}

// ─── Traditions ──────────────────────────────────────────────────────────────

/** Who hosts this occurrence of a tradition, or null when hosts don't rotate. */
export function hostOf(event: Event): string | null {
  const order = event.host_rotation ?? [];
  if (!order.length) return null;
  return order[(event.occurrence ?? 0) % order.length];
}

/** Who hosts the next time after this one. */
export function nextHostOf(event: Event): string | null {
  const order = event.host_rotation ?? [];
  if (!order.length) return null;
  return order[((event.occurrence ?? 0) + 1) % order.length];
}

/** "4th" for the fourth time. */
export function ordinal(n: number) {
  const s = n % 100 >= 11 && n % 100 <= 13 ? 'th' : n % 10 === 1 ? 'st' : n % 10 === 2 ? 'nd' : n % 10 === 3 ? 'rd' : 'th';
  return `${n}${s}`;
}
