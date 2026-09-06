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
    };
  };
}

// ─── Model types ──────────────────────────────────────────────────────────────

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
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
  created_at: string;
  // joined relations
  profiles?: Pick<Profile, 'id' | 'full_name' | 'email'>;
}

export type EventInsert = Omit<Event, 'id' | 'created_at' | 'profiles'>;

export interface Idea {
  id: string;
  group_id: string;
  title: string;
  description: string | null;
  votes: number;
  status: 'proposed' | 'planned' | 'done';
  created_by: string | null;
  created_at: string;
  // joined relations
  profiles?: Pick<Profile, 'id' | 'full_name' | 'email'>;
  idea_votes?: IdeaVote[];
}

export type IdeaInsert = Omit<Idea, 'id' | 'votes' | 'created_at' | 'profiles' | 'idea_votes'>;

export interface IdeaVote {
  id: string;
  idea_id: string;
  user_id: string;
  created_at: string;
}

export type IdeaVoteInsert = Omit<IdeaVote, 'id' | 'created_at'>;

// ─── Navigation types ─────────────────────────────────────────────────────────

export type AuthStackParamList = {
  Login: undefined;
  Signup: undefined;
};

export type MainStackParamList = {
  GroupSetup: undefined;
  Tabs: undefined;
};

export type CalendarStackParamList = {
  CalendarHome: undefined;
  CreateEvent: { date?: string };
  EventDetail: { eventId: string };
  Profile: undefined;
};

export type IdeasStackParamList = {
  IdeasHome: undefined;
  CreateIdea: undefined;
  Profile: undefined;
};
