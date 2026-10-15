// ─── Supabase DB types ────────────────────────────────────────────────────────

export interface Database {
  public: {
    Tables: {
      profiles: { Row: Profile; Insert: ProfileInsert; Update: Partial<ProfileInsert> };
      groups: { Row: Group; Insert: GroupInsert; Update: Partial<GroupInsert> };
      group_members: { Row: GroupMember; Insert: GroupMemberInsert; Update: Partial<GroupMemberInsert> };
      events: { Row: Event; Insert: EventInsert; Update: Partial<EventInsert> };
      ideas: { Row: Idea; Insert: IdeaInsert; Update: Partial<IdeaInsert> };
      idea_votes: { Row: IdeaVote; Insert: IdeaVoteInsert; Update: Partial<IdeaVoteInsert> };
      contacts: { Row: Contact; Insert: ContactInsert; Update: Partial<ContactInsert> };
      notifications: { Row: AppNotification; Insert: AppNotificationInsert; Update: Partial<AppNotificationInsert> };
    };
  };
}

// ─── Model types ──────────────────────────────────────────────────────────────

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  birthday?: string | null;          // MM-DD
  created_at: string;
}

export type ProfileInsert = Omit<Profile, 'created_at'>;

export interface Group {
  id: string;
  name: string;
  description: string | null;
  invite_code: string;
  created_by: string | null;
  created_at: string;
}

export type GroupInsert = Omit<Group, 'id' | 'invite_code' | 'created_at'>;

export interface GroupMember {
  id: string;
  group_id: string;
  user_id: string;
  role: 'admin' | 'member';
  joined_at: string;
}

export type GroupMemberInsert = Omit<GroupMember, 'id' | 'joined_at'>;

export interface Event {
  id: string;
  group_id: string;
  title: string;
  description: string | null;
  start_time: string;
  end_time: string;
  location: string | null;
  created_by: string | null;
  attendees: string[];
  recurrence?: Recurrence | null;    // repeating series; see lib/recurrence
  invited_group_ids?: string[];      // groups invited as a whole (members are in attendees)
  assignments?: Assignment[];        // who's bringing / doing what
  rsvps?: Record<string, Rsvp>;      // attendee id → reply; missing = hasn't answered
  rsvp_notes?: Record<string, string>;   // attendee id → why, when they changed their reply
  cancelled_at?: string | null;      // cancelled events stay visible, marked
  host_rotation?: string[];          // traditions: who hosts, in turn
  created_at: string;
  // joined relations
  profiles?: Pick<Profile, 'id' | 'full_name' | 'email'>;
  // client-only: set on expanded occurrences of a repeating event
  series_id?: string;
  occurrence?: number;               // 0-based: which time this is in the series
}

export type Rsvp = 'going' | 'maybe' | 'declined';

export interface Assignment {
  id: string;
  item: string;                      // "Dessert", "Pick up ice"
  assignee_id: string | null;        // null = up for grabs
}

export interface Recurrence {
  freq: 'daily' | 'weekly' | 'monthly' | 'yearly';
  interval: number;                  // every N days / weeks / months / years
  weekdaysOnly?: boolean;            // daily, Mon–Fri
  until: string | null;              // YYYY-MM-DD, inclusive; null = never ends
}

export type EventInsert = Omit<Event, 'id' | 'created_at' | 'profiles' | 'series_id' | 'occurrence'>;

export interface Idea {
  id: string;
  group_id: string;
  title: string;
  description: string | null;
  votes: number;
  status: 'proposed' | 'planned' | 'done';
  audience_group_ids: string[];
  audience_user_ids: string[];
  audience_contact_ids: string[];
  location: string | null;
  target_date: string | null;        // YYYY-MM-DD, when the idea has a day in mind
  proposed_slots: TimeSlot[];        // date options from Plan, or the booked time once planned
  slot_votes?: Record<string, string[]>;   // user id → starts of proposed slots that work for them ([] = none do)
  event_id: string | null;           // the calendar event created from this idea
  planned_at: string | null;         // when it moved to Planned (proposed = created_at)
  created_by: string | null;
  created_at: string;
  // joined relations
  profiles?: Pick<Profile, 'id' | 'full_name' | 'email'>;
  idea_votes?: IdeaVote[];
}

export interface TimeSlot { start: string; end: string }   // ISO timestamps

export type IdeaInsert = Omit<Idea, 'id' | 'votes' | 'created_at' | 'profiles' | 'idea_votes'>;

export interface Contact {
  id: string;
  owner_id: string;
  name: string;
  email: string | null;
  note: string | null;
  created_at: string;
}

export type ContactInsert = Omit<Contact, 'id' | 'created_at'>;

export interface PlanComment {
  id: string;
  event_id: string | null;
  idea_id: string | null;
  user_id: string;
  body: string;                      // may be empty when there are photos
  photo_urls?: string[];             // storage paths (demo: image URIs)
  created_at: string;
}

export interface IdeaVote {
  id: string;
  idea_id: string;
  user_id: string;
  created_at: string;
}

export type IdeaVoteInsert = Omit<IdeaVote, 'id' | 'created_at'>;

export interface AppNotification {
  id: string;
  user_id: string;                   // recipient
  actor_id: string | null;           // who caused it
  kind: 'idea_proposed' | 'dates_proposed' | 'invite' | 'assignment' | 'rsvp' | 'event_changed' | 'event_cancelled' | 'date_votes' | 'comment';
  idea_id: string | null;
  event_id: string | null;
  title: string;
  body: string | null;
  read_at: string | null;
  created_at: string;
  // joined relations
  profiles?: Pick<Profile, 'id' | 'full_name' | 'email'>;
}

export type AppNotificationInsert = Omit<AppNotification, 'id' | 'read_at' | 'created_at' | 'profiles'>;

// ─── Navigation types ─────────────────────────────────────────────────────────

export type AuthStackParamList = {
  Login: undefined;
  Signup: undefined;
};

export type MainStackParamList = {
  GroupSetup: undefined;
  Tabs: undefined;
};

export type TabParamList = {
  Home: undefined;
  Calendar: { eventId?: string; date?: string } | undefined;
  Plans: { ideaId?: string } | undefined;
  People: undefined;
  You: undefined;
};
