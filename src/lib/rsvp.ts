// Replies to invites, and answers to "which of these dates work?".
//
// Being in `attendees` means you're invited. Your reply lives in `rsvps`;
// no entry means you haven't answered. The organizer is always going.

import { Event, Idea, Rsvp, TimeSlot } from '../types';

export type Reply = Rsvp | 'pending';

export const RSVP_LABEL: Record<Reply, string> = {
  going: 'Going',
  maybe: 'Maybe',
  declined: 'Can’t go',
  pending: 'No reply yet',
};

/** Your reply, or null when you're not invited. */
export function replyOf(event: Event, userId: string | null): Reply | null {
  if (!userId || !event.attendees?.includes(userId)) return null;
  if (event.created_by === userId) return 'going';
  return event.rsvps?.[userId] ?? 'pending';
}

/** Attendee ids by reply, organizer first among those going. */
export function repliesByStatus(event: Event): Record<Reply, string[]> {
  const out: Record<Reply, string[]> = { going: [], maybe: [], declined: [], pending: [] };
  const ids = [...(event.attendees ?? [])].sort((a, b) => Number(b === event.created_by) - Number(a === event.created_by));
  ids.forEach(id => out[replyOf(event, id) ?? 'pending'].push(id));
  return out;
}

/** Whether this event takes up the person's time (for finding free slots). */
export function blocksTime(event: Event, userId: string) {
  return !event.cancelled_at && !!event.attendees?.includes(userId) && event.rsvps?.[userId] !== 'declined';
}

/** Replies can be given or changed until the event starts. */
export const repliesOpen = (event: Event) => !event.cancelled_at && new Date(event.start_time).getTime() > Date.now();

/** An invite you still need to answer. */
export function needsReply(event: Event, userId: string | null) {
  return repliesOpen(event) && replyOf(event, userId) === 'pending';
}

/** A changed RSVP, for the organizer and everyone going or maybe. */
export function rsvpChangeNotice(name: string, reply: Rsvp, title: string) {
  return reply === 'going' ? `${name} is now going to ${title}`
    : reply === 'maybe' ? `${name} is now a maybe for ${title}`
    : `${name} can’t make ${title} anymore`;
}

/** Reply status for the organizer when someone answers. */
export function rsvpNotice(name: string, reply: Rsvp, title: string) {
  return reply === 'going' ? `${name} is going to ${title}`
    : reply === 'maybe' ? `${name} might make it to ${title}`
    : `${name} can’t make ${title}`;
}

// ─── Date votes ──────────────────────────────────────────────────────────────

/**
 * Who should weigh in on an idea's dates: whoever proposed it, the people it's
 * for, anyone who said "I'm in", and anyone who has already answered; not
 * anyone who said they can't make it.
 */
export function dateVoters(idea: Idea): string[] {
  const out = new Set([
    ...(idea.created_by ? [idea.created_by] : []),
    ...(idea.audience_user_ids ?? []),
    ...(idea.idea_votes ?? []).map(v => v.user_id),
    ...Object.keys(idea.slot_votes ?? {}),
  ]);
  // Anyone who said they can't make it isn't asked.
  (idea.declined_user_ids ?? []).forEach(id => out.delete(id));
  return Array.from(out);
}

/**
 * Whose answer the dates wait on: everyone asked, except the organizer until
 * they answer, and anyone who said "plan without me". Proposing dates isn't a vote — the organizer may say which
 * work for them, but nothing waits on it.
 */
export function awaitedVoters(idea: Idea): string[] {
  const maybes = new Set(idea.tentative_user_ids ?? []);
  return dateVoters(idea).filter(id => !maybes.has(id) && (id !== idea.created_by || !!idea.slot_votes?.[id]));
}

export interface SlotTally { slot: TimeSlot; yes: string[] }

/** Each upcoming slot with who it works for, best first on ties by date. */
export function tallySlots(idea: Idea, slots: TimeSlot[]): SlotTally[] {
  const votes = idea.slot_votes ?? {};
  return slots.map(slot => ({
    slot,
    yes: Object.entries(votes).filter(([, starts]) => starts.includes(slot.start)).map(([id]) => id),
  }));
}

/** The slot most people can make, or null when no one has answered yet. */
export function bestSlot(tallies: SlotTally[]): SlotTally | null {
  let best: SlotTally | null = null;
  tallies.forEach(t => { if (t.yes.length && (!best || t.yes.length > best.yes.length)) best = t; });
  return best;
}
