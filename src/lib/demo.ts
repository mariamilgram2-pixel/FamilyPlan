// Sample content for "Skip to demo" so first-run exploration isn't an empty
// shell. Dates are generated relative to today. Nothing here touches Supabase.

import { Contact, Event, Group, Idea, Profile } from '../types';

export const DEMO_GROUP_ID = 'demo';
export const DEMO_ME = 'demo-me';

export function isDemoGroup(g: Pick<Group, 'id'> | null | undefined) {
  return g?.id === DEMO_GROUP_ID;
}

const now = new Date().toISOString();

const person = (id: string, full_name: string): Profile => ({
  id, full_name, email: `${full_name.split(' ')[0].toLowerCase()}@example.com`, avatar_url: null, created_at: now,
});

export const DEMO_MEMBERS: Profile[] = [
  person(DEMO_ME, 'Jordan Lee'),
  person('demo-ana', 'Ana Reyes'),
  person('demo-ben', 'Ben Okafor'),
  person('demo-chloe', 'Chloe Park'),
  person('demo-dev', 'Dev Shah'),
  person('demo-eli', 'Eli Brooks'),
];

function at(dayOffset: number, hour: number, minute = 0) {
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  d.setDate(d.getDate() + dayOffset);
  return d.toISOString();
}

function ev(id: string, title: string, day: number, h: number, m: number, durMin: number, location: string | null, attendees: string[], description: string | null = null): Event {
  const start = at(day, h, m);
  return {
    id, group_id: DEMO_GROUP_ID, title, description, location,
    start_time: start,
    end_time: new Date(new Date(start).getTime() + durMin * 60000).toISOString(),
    created_by: attendees[0] ?? DEMO_ME, attendees, created_at: now,
  };
}

export const DEMO_EVENTS: Event[] = [
  ev('e1', 'Farmers market run', 0, 9, 30, 90, 'Union Square', [DEMO_ME, 'demo-ana']),
  ev('e2', 'Family dinner', 0, 18, 30, 120, "Grandma's house", [DEMO_ME, 'demo-ana', 'demo-ben', 'demo-chloe', 'demo-dev'], 'Bring dessert. Ben is picking up the bread.'),
  ev('e3', 'Soccer practice', 1, 16, 0, 90, 'Riverside Field 3', ['demo-ben', 'demo-eli']),
  ev('e4', 'Movie night', 3, 19, 0, 150, 'Living room', [DEMO_ME, 'demo-chloe', 'demo-dev']),
  ev('e5', 'Hike: Bear Mountain', 5, 8, 0, 300, 'Bear Mountain trailhead', [DEMO_ME, 'demo-ana', 'demo-eli'], 'Leave at 7. Pack lunch and layers.'),
  ev('e6', "Chloe's recital", 8, 17, 0, 90, 'Lincoln Hall', ['demo-chloe', DEMO_ME, 'demo-ben', 'demo-ana']),
  ev('e7', 'Book club', 12, 19, 30, 90, 'Ana’s place', ['demo-ana', 'demo-dev']),
];

function idea(id: string, title: string, description: string | null, status: Idea['status'], voters: string[], by: string, audienceUsers: string[] = []): Idea {
  const author = DEMO_MEMBERS.find(m => m.id === by)!;
  return {
    id, group_id: DEMO_GROUP_ID, title, description, status,
    votes: voters.length,
    audience_group_ids: [], audience_user_ids: audienceUsers, audience_contact_ids: [],
    created_by: by, created_at: now,
    profiles: { id: author.id, full_name: author.full_name, email: author.email },
    idea_votes: voters.map((u, i) => ({ id: `${id}-v${i}`, idea_id: id, user_id: u, created_at: now })),
  };
}

export const DEMO_IDEAS: Idea[] = [
  idea('i1', 'Camping weekend at the lake', 'Two nights, tents or the cabins by the dock. Late spring when the bugs are manageable.', 'proposed', [DEMO_ME, 'demo-ana', 'demo-eli', 'demo-ben'], 'demo-eli'),
  idea('i2', 'Taco night rotation', 'Each family hosts once a month and picks the theme.', 'proposed', ['demo-chloe', 'demo-dev'], 'demo-chloe'),
  idea('i3', 'Pottery class', null, 'proposed', ['demo-ana'], DEMO_ME, ['demo-ana', 'demo-chloe']),
  idea('i4', 'Visit the aquarium', 'Kids are asking. Weekday mornings are quieter.', 'planned', [DEMO_ME, 'demo-ben', 'demo-chloe'], 'demo-ben'),
  idea('i5', 'Board game marathon', null, 'done', ['demo-dev', 'demo-eli'], 'demo-dev'),
];

export const DEMO_CONTACTS: Contact[] = [
  { id: 'c1', owner_id: DEMO_ME, name: 'Grandma Rose', email: null, note: 'Hosts Sunday dinners', created_at: now },
  { id: 'c2', owner_id: DEMO_ME, name: 'Coach Miller', email: 'miller@example.com', note: null, created_at: now },
];
