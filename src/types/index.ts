// ─── Supabase DB types ────────────────────────────────────────────────────────

// supabase-js checks this against its GenericSchema: every table needs
// Relationships, the schema needs Views and Functions, and rows must be plain
// object types (interfaces don't satisfy Record<string, unknown>), or every
// query's types collapse to `never`. Flatten re-maps an interface into one.
type Flatten<T> = { [K in keyof T]: T[K] };
type Table<Row, Insert, Relationships = []> = {
  Row: Flatten<Row>;
  Insert: Flatten<Insert>;
  Update: Flatten<Partial<Insert>>;
  Relationships: Relationships;
};
// Only the foreign keys that queries embed (e.g. `idea_votes(id, user_id)`).
type ForeignKey<Name extends string, Column extends string, Ref extends string> = {
  foreignKeyName: Name;
  columns: [Column];
  isOneToOne: false;
  referencedRelation: Ref;
  referencedColumns: ['id'];
};
type Rpc<Args, Returns = undefined> = { Args: Args; Returns: Returns };

export type Database = {
  public: {
    Tables: {
      profiles: Table<Profile, ProfileInsert>;
      groups: Table<Group, GroupInsert>;
      group_members: Table<GroupMember, GroupMemberInsert,
        [ForeignKey<'group_members_user_id_fkey', 'user_id', 'profiles'>]>;
      events: Table<Event, EventInsert>;
      ideas: Table<Idea, IdeaInsert>;
      idea_votes: Table<IdeaVote, IdeaVoteInsert,
        [ForeignKey<'idea_votes_idea_id_fkey', 'idea_id', 'ideas'>]>;
      contacts: Table<Contact, ContactInsert>;
      saved_places: Table<SavedPlace, SavedPlaceInsert>;
      person_notes: Table<PersonNote, PersonNoteInsert>;
      notifications: Table<AppNotification, AppNotificationInsert>;
      plan_comments: Table<PlanComment, PlanCommentInsert>;
      categories: Table<Category, CategoryInsert>;
      // Rows are created and synced by the server; the app reads and deletes.
      calendar_connections: Table<CalendarConnection, Omit<CalendarConnection, 'id' | 'created_at'>>;
      calendar_occurrences: Table<CalendarOccurrence, Omit<CalendarOccurrence, 'id' | 'updated_at'>>;
      availability_preferences: Table<AvailabilityPreference,
        Omit<AvailabilityPreference, 'updated_at' | 'quiet_weeknights'> & { quiet_weeknights?: boolean; updated_at?: string }>;
    };
    Views: { [_ in never]: never };
    Functions: {
      claim_assignment: Rpc<{ p_event: string; p_item: string; p_claim: boolean }>;
      set_rsvp: Rpc<{ p_event: string; p_status: string; p_note?: string | null }>;
      set_slot_votes: Rpc<{ p_idea: string; p_starts: string[] }>;
      set_calendar_included: Rpc<{ p_connection: string; p_included: boolean }>;
      availability_estimate: Rpc<
        { p_member_ids: string[]; p_slots: EstimateSlot[]; p_timezone?: string },
        { slot_start: string; slot_end: string; available_count: number; busy_count: number;
          unknown_count: number; total_count: number; soft_penalty: number }[]>;
    };
  };
};

// ─── Model types ──────────────────────────────────────────────────────────────

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  birthday?: string | null;          // MM-DD
  about?: string | null;             // a line they share with people they plan with
  favorites?: string[];              // "things I love doing", ≤ 6
  timezone?: string | null;          // IANA, e.g. "America/New_York"; null = use the device's
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
  // How the shared calendar looks. Not editable yet; when unset, GroupAvatar
  // picks an emoji from the name and a color from the id.
  avatar_emoji?: string | null;
  avatar_color?: string | null;      // a GROUP_COLORS key
  avatar_url?: string | null;        // a photo, like a group chat's
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
  timezone?: string | null;          // zone its wall-clock time is in; null = organizer's device
  category_id?: string | null;       // a Category id, never a name or color
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
  status: 'draft' | 'proposed' | 'planned' | 'done';   // draft: only its creator sees it
  audience_group_ids: string[];
  audience_user_ids: string[];
  audience_contact_ids: string[];
  location: string | null;
  target_date: string | null;        // YYYY-MM-DD, when the idea has a day in mind
  proposed_slots: TimeSlot[];        // date options from Plan, or the booked time once planned
  slot_votes?: Record<string, string[]>;   // user id → starts of proposed slots that work for them ([] = none do)
  event_id: string | null;           // the calendar event created from this idea
  planned_at: string | null;         // when it moved to Planned (proposed = created_at)
  category_id?: string | null;
  created_by: string | null;
  created_at: string;
  // joined relations
  profiles?: Pick<Profile, 'id' | 'full_name' | 'email'>;
  idea_votes?: IdeaVote[];
}

export interface TimeSlot { start: string; end: string; fit?: SlotFit }   // ISO timestamps; fit = calendar fit when suggested

export type IdeaInsert = Omit<Idea, 'id' | 'votes' | 'created_at' | 'profiles' | 'idea_votes'>;

export interface Contact {
  id: string;
  owner_id: string;
  name: string;
  email: string | null;
  note: string | null;
  avatar_url?: string | null;        // a photo you set for them
  created_at: string;
}

export type ContactInsert = Omit<Contact, 'id' | 'created_at'>;

/** Your own name for a place you plan at often. `place` is "Name, address", like an event's location. */
export interface SavedPlace {
  id: string;
  owner_id: string;
  label: string;
  place: string;
  created_at: string;
}

export type SavedPlaceInsert = Omit<SavedPlace, 'id' | 'created_at'>;

/** Something you want to remember about someone. Private to its owner. */
export interface PersonNote {
  id: string;
  owner_id: string;
  subject_user_id: string | null;    // someone in your groups…
  subject_contact_id: string | null; // …or someone you added
  body: string;                      // may be empty when there are photos
  photo_urls: string[];              // storage paths in "person-notes" (demo: image URIs)
  created_at: string;
}

export type PersonNoteInsert = Omit<PersonNote, 'id' | 'created_at'>;

export interface PlanComment {
  id: string;
  event_id: string | null;
  idea_id: string | null;
  user_id: string;
  body: string;                      // may be empty when there are photos
  photo_urls?: string[];             // storage paths (demo: image URIs)
  created_at: string;
}

export type PlanCommentInsert = Omit<PlanComment, 'id' | 'created_at'>;

export interface Category {
  id: string;                        // stable; filters and counts use this, not the name
  name: string;
  color: string;
  icon: string | null;
  is_default: boolean;               // built-in, shared by everyone
  owner_id: string | null;           // personal category
  group_id: string | null;           // a group's category
  created_at: string;
}

export type CategoryInsert = Omit<Category, 'id' | 'created_at' | 'is_default'>;

// ─── Connected calendars (private to their owner) ────────────────────────────

export type CalendarProvider = 'google' | 'apple' | 'outlook' | 'ics';

export interface CalendarConnection {
  id: string;
  user_id: string;
  provider: CalendarProvider;
  remote_calendar_id: string;
  calendar_name: string | null;
  account_label: string | null;
  permissions: 'freebusy' | 'read';  // never write
  sync_status: 'pending' | 'ok' | 'error' | 'revoked';
  include_in_availability: boolean;
  synced_from: string | null;        // window the last sync covered
  synced_to: string | null;
  last_synced_at: string | null;
  last_error: string | null;
  created_at: string;
}

export interface CalendarOccurrence {
  id: string;
  connection_id: string;
  owner_user_id: string;
  source: CalendarProvider;
  external_id: string;
  start_at: string;
  end_at: string;
  all_day: boolean;                  // start/end are local midnights in `timezone`
  timezone: string | null;
  busy_status: 'busy' | 'tentative' | 'free' | 'out_of_office';
  visibility: 'default' | 'public' | 'private';
  title: string | null;              // owner only
  description: string | null;        // owner only
  sheep_event_id: string | null;     // the same thing as this Sheep event
  updated_at: string;
}

// Private and soft: they reorder suggestions, never block or answer for anyone.
export type WeekendMode = 'any' | 'keep_one_free' | 'ask_first';

export interface AvailabilityPreference {
  user_id: string;
  weekend_mode: WeekendMode;
  spacing_enabled: boolean;          // avoid back-to-back plans
  quiet_weeknights: boolean;         // reserved; not used yet
  updated_at: string;
}

/** One candidate time as sent to availability_estimate(). */
export interface EstimateSlot {
  start: string;
  end: string;
  sheep_busy: string[];              // on a Sheep event then
  nearby: Record<string, 1 | 2>;     // Sheep plan the day before/after (1) or same day (2)
  weekend_taken: string[];           // Sheep plan on the other day of that weekend
}

/** Counts only: how candidate calendars looked when the time was suggested. */
export interface SlotFit { available: number; busy: number; unknown: number; total: number }

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
