// Sample content for "Skip to demo" so first-run exploration isn't an empty
// shell. Dates are generated relative to today. Nothing here touches Supabase.

import { Contact, Event, Group, Idea, PersonNote, PlanComment, Profile } from '../types';

export const DEMO_GROUP_ID = 'demo';
export const DEMO_ME = 'demo-me';

export function isDemoGroup(g: Pick<Group, 'id'> | null | undefined) {
  return g?.id === DEMO_GROUP_ID;
}

const now = new Date().toISOString();

const person = (id: string, full_name: string, photo: string | null = null): Profile => ({
  id, full_name, email: `${full_name.split(' ')[0].toLowerCase()}@example.com`, avatar_url: photo, created_at: now,
});

// Stock portraits. A couple of people never set one, like real life.
const portrait = (kind: 'men' | 'women', n: number) => `https://randomuser.me/api/portraits/${kind}/${n}.jpg`;

/** The demo group (My Family). */
export const DEMO_MEMBERS: Profile[] = [
  person(DEMO_ME, 'Jordan Lee', portrait('women', 32)),
  person('demo-ana', 'Ana Reyes', portrait('women', 44)),
  person('demo-ben', 'Ben Okafor', portrait('men', 46)),
  person('demo-chloe', 'Chloe Park', portrait('women', 65)),
  person('demo-dev', 'Dev Shah', portrait('men', 75)),
  person('demo-eli', 'Eli Brooks'),
  person('demo-fran', 'Fran Ito', portrait('women', 68)),
];

/** People you only share another group with (Climbing crew). */
export const DEMO_FRIENDS: Profile[] = [
  person('demo-gabe', 'Gabe Moreno', portrait('men', 52)),
  person('demo-hana', 'Hana Kim', portrait('women', 79)),
  person('demo-iris', 'Iris Novak'),
];

/** Everyone in any demo group, for looking people up by id. */
export const DEMO_PEOPLE: Profile[] = [...DEMO_MEMBERS, ...DEMO_FRIENDS];

// Birthdays a week or few out, so Home has something to suggest.
const mmdd = (daysOut: number) => {
  const d = new Date(Date.now() + daysOut * 86400000);
  return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
DEMO_MEMBERS[1].birthday = mmdd(9);    // Ana
DEMO_MEMBERS[2].birthday = mmdd(24);   // Ben
DEMO_MEMBERS[3].birthday = '04-17';    // Chloe

// What people chose to share. Uneven on purpose: some say a lot, some a
// little, Eli hasn't filled anything in.
Object.assign(DEMO_MEMBERS[0], { favorites: ['Hiking', 'Movie nights'] });
Object.assign(DEMO_MEMBERS[1], { about: 'Book club ringleader. Always up for a farmers market.', favorites: ['Farmers markets', 'Hiking', 'Reading'] });
Object.assign(DEMO_MEMBERS[2], { favorites: ['Baking bread', 'Soccer', 'Brunch'] });
Object.assign(DEMO_MEMBERS[3], { about: 'Piano, plants, and pancakes.' });
Object.assign(DEMO_MEMBERS[4], { favorites: ['Karaoke', 'Board games', 'Sci-fi'] });
Object.assign(DEMO_MEMBERS[6], { about: 'New in town. Show me your favorite spots!', favorites: ['Karaoke', 'Dancing'] });
Object.assign(DEMO_FRIENDS[0], { about: 'Belay partner for life. Will drive to the Gunks.', favorites: ['Climbing', 'Coffee', 'Camping'] });
Object.assign(DEMO_FRIENDS[1], { favorites: ['Bouldering', 'Ramen', 'Film photography'], birthday: mmdd(17) });

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
  ev('e7', 'Book club: The Overstory', 12, 19, 30, 90, 'Ana’s place', ['demo-ana', 'demo-dev', DEMO_ME]),
];

// Book club lives in another group, so "My plans" shows events across groups.
DEMO_EVENTS[6].group_id = 'demo-books';

// Replies, so the organizer and invitee views both have something to show.
DEMO_EVENTS[0].rsvps = { 'demo-ana': 'going' };
DEMO_EVENTS[1].rsvps = { 'demo-ana': 'going', 'demo-ben': 'going', 'demo-chloe': 'maybe' };
DEMO_EVENTS[3].rsvps = { 'demo-chloe': 'going', 'demo-dev': 'declined' };
DEMO_EVENTS[4].rsvps = { 'demo-ana': 'going' };
DEMO_EVENTS[5].rsvps = { 'demo-ben': 'going', 'demo-ana': 'maybe' };
DEMO_EVENTS[6].rsvps = { 'demo-dev': 'going' };

// History: a recent outing ("Do it again?") and an old one with someone you
// haven't seen since ("Reconnect").
DEMO_EVENTS.push(
  { ...ev('e8', 'Brunch at Café Lola', -2, 11, 0, 90, 'Café Lola', [DEMO_ME, 'demo-ana', 'demo-ben']), rsvps: { 'demo-ana': 'going', 'demo-ben': 'going' } },
  { ...ev('e9', 'Karaoke night', -47, 21, 0, 150, 'Gagopa', ['demo-fran', DEMO_ME, 'demo-dev']), rsvps: { [DEMO_ME]: 'going', 'demo-dev': 'going' } },
  { ...ev('e13', 'Apple picking', -30, 10, 0, 240, 'Fishkill Farms', [DEMO_ME, 'demo-ana', 'demo-chloe']), rsvps: { 'demo-ana': 'going', 'demo-chloe': 'going' } },
);

// Climbing crew: a regular gym night, a big day out, and an invite from Gabe
// you haven't answered.
DEMO_EVENTS.push(
  { ...ev('e14', 'Bouldering night', -10, 19, 0, 120, 'Brooklyn Boulders', ['demo-gabe', DEMO_ME, 'demo-hana', 'demo-dev']), group_id: 'demo-climb', rsvps: { [DEMO_ME]: 'going', 'demo-hana': 'going', 'demo-dev': 'going' } },
  { ...ev('e15', 'Gunks day trip', -58, 7, 0, 600, 'Mohonk Preserve', ['demo-iris', DEMO_ME, 'demo-gabe']), group_id: 'demo-climb', rsvps: { [DEMO_ME]: 'going', 'demo-gabe': 'going' } },
  { ...ev('e16', 'Climbing gym', 4, 18, 30, 120, 'Brooklyn Boulders', ['demo-gabe', DEMO_ME, 'demo-hana', 'demo-iris']), group_id: 'demo-climb', rsvps: { 'demo-hana': 'going' } },
);

// A tradition: Sunday supper, every week, hosts take turns. Started three
// Sundays ago, so the next one is the 4th.
{
  const toSunday = (7 - new Date().getDay()) % 7 || 7;
  const supper = ev('e10', 'Sunday supper', toSunday - 21, 18, 0, 150, null, [DEMO_ME, 'demo-ana', 'demo-ben', 'demo-chloe']);
  supper.recurrence = { freq: 'weekly', interval: 1, until: null };
  supper.host_rotation = ['demo-ana', 'demo-ben', DEMO_ME, 'demo-chloe'];
  supper.rsvps = { 'demo-ana': 'going', 'demo-ben': 'going', 'demo-chloe': 'maybe' };
  supper.description = 'Whoever’s hosting picks the menu.';
  DEMO_EVENTS.push(supper);
}

// Book club is a second shared calendar. One plan you're in (so it shows on
// My calendar too, but only once on Book club's), and one you're not (so it
// shows on Book club's calendar but not on yours).
DEMO_EVENTS.push(
  { ...ev('e11', 'Book club: pick the next book', 2, 20, 0, 60, 'Video call', ['demo-ana', 'demo-dev', DEMO_ME]), group_id: 'demo-books', rsvps: { 'demo-dev': 'going', [DEMO_ME]: 'going' } },
  { ...ev('e12', 'Author talk at the library', 6, 18, 30, 90, 'Central Library', ['demo-ana', 'demo-dev']), group_id: 'demo-books', rsvps: { 'demo-dev': 'going' } },
);

// Family dinner shows off assignments: some claimed, one open.
DEMO_EVENTS[1].assignments = [
  { id: 'a1', item: 'Bread', assignee_id: 'demo-ben' },
  { id: 'a2', item: 'Salad', assignee_id: 'demo-ana' },
  { id: 'a3', item: 'Dessert', assignee_id: null },
];

/** Events created during a demo session (e.g. from a planned idea). */
export function addDemoEvent(e: Omit<Event, 'id' | 'created_at' | 'group_id'>): Event {
  const event: Event = { ...e, id: `e-${Date.now()}`, group_id: DEMO_GROUP_ID, created_at: new Date().toISOString() };
  DEMO_EVENTS.push(event);
  return event;
}

const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString();

function idea(id: string, title: string, description: string | null, status: Idea['status'], voters: string[], by: string, audienceUsers: string[] = [], proposedDaysAgo = 0, plannedDaysAgo: number | null = null): Idea {
  const author = DEMO_MEMBERS.find(m => m.id === by)!;
  return {
    id, group_id: DEMO_GROUP_ID, title, description, status,
    votes: voters.length,
    audience_group_ids: [], audience_user_ids: audienceUsers, audience_contact_ids: [],
    location: null, target_date: null, proposed_slots: [], event_id: null,
    planned_at: plannedDaysAgo === null ? null : daysAgo(plannedDaysAgo),
    created_by: by, created_at: daysAgo(proposedDaysAgo),
    profiles: { id: author.id, full_name: author.full_name, email: author.email },
    idea_votes: voters.map((u, i) => ({ id: `${id}-v${i}`, idea_id: id, user_id: u, created_at: now })),
  };
}

export const DEMO_IDEAS: Idea[] = [
  idea('i1', 'Camping weekend at the lake', 'Two nights, tents or the cabins by the dock. Late spring when the bugs are manageable.', 'proposed', [DEMO_ME, 'demo-ana', 'demo-eli', 'demo-ben'], 'demo-eli', [], 6),
  idea('i2', 'Taco night rotation', 'Each family hosts once a month and picks the theme.', 'proposed', ['demo-chloe', 'demo-dev', DEMO_ME], 'demo-chloe', [], 12),
  idea('i3', 'Pottery class', null, 'proposed', ['demo-ana'], DEMO_ME, ['demo-ana', 'demo-chloe'], 1),
  idea('i4', 'Visit the aquarium', 'Kids are asking. Weekday mornings are quieter.', 'planned', [DEMO_ME, 'demo-ben', 'demo-chloe'], 'demo-ben', [], 20, 3),
  idea('i5', 'Board game marathon', null, 'done', ['demo-dev', 'demo-eli'], 'demo-dev', [], 40, 30),
];

// Date options waiting on votes: one you proposed, one waiting on you.
const slot = (day: number, h: number, durMin: number) => {
  const start = at(day, h);
  return { start, end: new Date(new Date(start).getTime() + durMin * 60000).toISOString() };
};
{
  const pottery = DEMO_IDEAS[2];
  pottery.proposed_slots = [slot(4, 18, 120), slot(6, 10, 120), slot(9, 18, 120)];
  const [a, b, c] = pottery.proposed_slots.map(s => s.start);
  pottery.slot_votes = { [DEMO_ME]: [a, b, c], 'demo-ana': [a, c] };

  const tacos = DEMO_IDEAS[1];
  tacos.proposed_slots = [slot(7, 18, 180), slot(10, 18, 180), slot(14, 18, 180)];
  const [t1, t2, t3] = tacos.proposed_slots.map(s => s.start);
  tacos.slot_votes = { 'demo-chloe': [t1, t2, t3], 'demo-dev': [t2, t3] };
}

/** Save a demo idea (new or edited) so every screen sees it. */
export function upsertDemoIdea(idea: Idea) {
  const i = DEMO_IDEAS.findIndex(x => x.id === idea.id);
  if (i >= 0) DEMO_IDEAS[i] = idea; else DEMO_IDEAS.unshift(idea);
}

export function updateDemoIdea(id: string, patch: Partial<Idea>) {
  const i = DEMO_IDEAS.findIndex(x => x.id === id);
  if (i >= 0) DEMO_IDEAS[i] = { ...DEMO_IDEAS[i], ...patch };
}

export function removeDemoIdea(id: string) {
  const i = DEMO_IDEAS.findIndex(x => x.id === id);
  if (i >= 0) DEMO_IDEAS.splice(i, 1);
}

// Conversations on plans. Photos are stand-in images, stable per seed.
const photo = (seed: string, n: number) => `https://picsum.photos/seed/sheep-${seed}-${n}/400/400`;
const ago = (min: number) => new Date(Date.now() - min * 60000).toISOString();
export const DEMO_COMMENTS: PlanComment[] = [
  { id: 'm1', event_id: 'e2', idea_id: null, user_id: 'demo-ana', body: 'I can bring extra chairs if we need them.', created_at: ago(300) },
  { id: 'm2', event_id: 'e2', idea_id: null, user_id: 'demo-ben', body: 'Sourdough or baguette?', created_at: ago(120) },
  { id: 'm3', event_id: null, idea_id: 'i3', user_id: 'demo-ana', body: 'Evenings are easier for me, but I can do the Tuesday.', created_at: ago(600) },
  { id: 'm4', event_id: 'e8', idea_id: null, user_id: 'demo-ben', body: 'Those pancakes. We need to go back.', created_at: ago(1500) },
  // Memories with photos, so people's Together timelines have some.
  { id: 'm5', event_id: 'e13', idea_id: null, user_id: 'demo-ana', body: 'Best haul yet.', photo_urls: [photo('apples', 1), photo('apples', 2), photo('apples', 3)], created_at: ago(30 * 1440) },
  { id: 'm6', event_id: 'e8', idea_id: null, user_id: DEMO_ME, body: '', photo_urls: [photo('brunch', 1), photo('brunch', 2)], created_at: ago(2 * 1440) },
  { id: 'm7', event_id: 'e14', idea_id: null, user_id: 'demo-hana', body: 'Sent the V4!', photo_urls: [photo('climb', 1), photo('climb', 2)], created_at: ago(10 * 1440) },
];

/** Extra demo groups, so the invite picker has more than one to choose from. */
export const DEMO_EXTRA_GROUPS: { group: Group; memberIds: string[] }[] = [
  { group: { id: 'demo-soccer', name: 'Soccer parents', description: null, invite_code: 'SOCCER01', created_by: 'demo-ben', created_at: now }, memberIds: ['demo-ben', 'demo-eli'] },
  { group: { id: 'demo-books', name: 'Book club', description: null, invite_code: 'BOOKS001', created_by: 'demo-ana', created_at: now }, memberIds: ['demo-ana', 'demo-dev', DEMO_ME] },
  { group: { id: 'demo-climb', name: 'Climbing crew', description: 'Tuesday gym nights, the occasional road trip.', invite_code: 'CLIMB777', created_by: 'demo-gabe', created_at: now }, memberIds: ['demo-gabe', DEMO_ME, 'demo-hana', 'demo-iris', 'demo-dev'] },
];

/** Your private notes about people. */
export const DEMO_PERSON_NOTES: PersonNote[] = [
  { id: 'pn1', owner_id: DEMO_ME, subject_user_id: 'demo-ana', subject_contact_id: null, body: 'Walnut allergy. Skip them in anything you bring.', photo_urls: [], created_at: daysAgo(90) },
  { id: 'pn2', owner_id: DEMO_ME, subject_user_id: 'demo-dev', subject_contact_id: null, body: 'Wants to try the new ramen place on 5th.', photo_urls: [], created_at: daysAgo(10) },
  { id: 'pn3', owner_id: DEMO_ME, subject_user_id: null, subject_contact_id: 'c1', body: 'Loves lilies. Best to call Sunday mornings.', photo_urls: [], created_at: daysAgo(60) },
];

export const DEMO_CONTACTS: Contact[] = [
  { id: 'c1', owner_id: DEMO_ME, name: 'Grandma Rose', email: null, note: 'Hosts Sunday dinners', created_at: now },
  { id: 'c2', owner_id: DEMO_ME, name: 'Coach Miller', email: 'miller@example.com', note: null, created_at: now },
  { id: 'c3', owner_id: DEMO_ME, name: 'Aunt Linda', email: null, note: 'Thanksgiving host', avatar_url: portrait('women', 57), created_at: now },
  { id: 'c4', owner_id: DEMO_ME, name: 'Sam Patel', email: 'sam@example.com', note: 'Neighbor, dog named Biscuit', avatar_url: portrait('men', 11), created_at: now },
  { id: 'c5', owner_id: DEMO_ME, name: 'Priya Nair', email: 'priya@example.com', note: 'Work trivia team', created_at: now },
  { id: 'c6', owner_id: DEMO_ME, name: 'Marcus Hill', email: null, note: null, avatar_url: portrait('men', 36), created_at: now },
];
