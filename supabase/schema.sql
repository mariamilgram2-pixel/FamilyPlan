-- ============================================================
-- FamilyPlan – Supabase Schema
-- Run this in the Supabase SQL Editor (Project → SQL Editor)
-- ============================================================

-- ─── Extensions ──────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── Tables (all tables first, policies after) ───────────────

CREATE TABLE public.profiles (
  id          UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email       TEXT        NOT NULL,
  full_name   TEXT,
  avatar_url  TEXT,
  birthday    TEXT        CHECK (birthday ~ '^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'),   -- MM-DD
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.groups (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL,
  description TEXT,
  invite_code TEXT        NOT NULL UNIQUE DEFAULT UPPER(substring(encode(gen_random_bytes(6), 'hex'), 1, 8)),
  created_by  UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.group_members (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id    UUID        NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  user_id     UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role        TEXT        NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  joined_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (group_id, user_id)
);

CREATE TABLE public.events (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id    UUID        NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  title       TEXT        NOT NULL,
  description TEXT,
  start_time  TIMESTAMPTZ NOT NULL,
  end_time    TIMESTAMPTZ NOT NULL,
  location    TEXT,
  created_by  UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
  attendees   UUID[]      NOT NULL DEFAULT '{}',
  recurrence  JSONB,
  invited_group_ids UUID[] NOT NULL DEFAULT '{}',
  assignments JSONB       NOT NULL DEFAULT '[]',
  rsvps       JSONB       NOT NULL DEFAULT '{}',
  rsvp_notes  JSONB       NOT NULL DEFAULT '{}',
  cancelled_at TIMESTAMPTZ,
  host_rotation UUID[]    NOT NULL DEFAULT '{}',   -- traditions: occurrence n hosted by [n mod len]
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT end_after_start CHECK (end_time > start_time)
);

CREATE INDEX events_group_start ON public.events (group_id, start_time);

CREATE TABLE public.contacts (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id    UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name        TEXT        NOT NULL,
  email       TEXT,
  note        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX contacts_owner ON public.contacts (owner_id);

CREATE TABLE public.ideas (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id              UUID        NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  title                 TEXT        NOT NULL,
  description           TEXT,
  votes                 INTEGER     NOT NULL DEFAULT 0,
  status                TEXT        NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed', 'planned', 'done')),
  audience_group_ids    UUID[]      NOT NULL DEFAULT '{}',
  audience_user_ids     UUID[]      NOT NULL DEFAULT '{}',
  audience_contact_ids  UUID[]      NOT NULL DEFAULT '{}',
  location              TEXT,
  target_date           DATE,
  proposed_slots        JSONB       NOT NULL DEFAULT '[]',
  slot_votes            JSONB       NOT NULL DEFAULT '{}',
  event_id              UUID        REFERENCES public.events(id) ON DELETE SET NULL,
  planned_at            TIMESTAMPTZ,
  created_by            UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX ideas_group_votes ON public.ideas (group_id, votes DESC);

CREATE TABLE public.idea_votes (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  idea_id     UUID        NOT NULL REFERENCES public.ideas(id) ON DELETE CASCADE,
  user_id     UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (idea_id, user_id)
);

CREATE TABLE public.notifications (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  actor_id    UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
  kind        TEXT        NOT NULL CHECK (kind IN (
                'idea_proposed', 'dates_proposed', 'invite', 'assignment',
                'rsvp', 'event_changed', 'event_cancelled', 'date_votes', 'comment')),
  idea_id     UUID        REFERENCES public.ideas(id) ON DELETE CASCADE,
  event_id    UUID        REFERENCES public.events(id) ON DELETE CASCADE,
  title       TEXT        NOT NULL,
  body        TEXT,
  read_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX notifications_user_created ON public.notifications (user_id, created_at DESC);

-- ─── Trigger: auto-create profile on sign up ─────────────────

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1))
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- ─── Row Level Security ───────────────────────────────────────

ALTER TABLE public.profiles     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.groups       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ideas        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.idea_votes   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contacts     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- profiles
CREATE POLICY "Users can view any profile"
  ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- groups
CREATE POLICY "Group members can view their groups"
  ON public.groups FOR SELECT
  USING (id IN (SELECT group_id FROM public.group_members WHERE user_id = auth.uid()));
CREATE POLICY "Anyone can look up a group by invite code"
  ON public.groups FOR SELECT USING (true);
CREATE POLICY "Authenticated users can create groups"
  ON public.groups FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Group admins can update their group"
  ON public.groups FOR UPDATE
  USING (id IN (SELECT group_id FROM public.group_members WHERE user_id = auth.uid() AND role = 'admin'));

-- group_members
-- "Which groups am I in?" via SECURITY DEFINER helpers: asking it by reading
-- group_members inside group_members' own policy recurses forever.
CREATE OR REPLACE FUNCTION public.my_group_ids()
RETURNS SETOF UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT group_id FROM public.group_members WHERE user_id = auth.uid();
$$;
CREATE OR REPLACE FUNCTION public.my_admin_group_ids()
RETURNS SETOF UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT group_id FROM public.group_members WHERE user_id = auth.uid() AND role = 'admin';
$$;

CREATE POLICY "Members can view membership of their groups"
  ON public.group_members FOR SELECT
  USING (group_id IN (SELECT public.my_group_ids()));
CREATE POLICY "Authenticated users can join groups"
  ON public.group_members FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins can manage members"
  ON public.group_members FOR DELETE
  USING (group_id IN (SELECT public.my_admin_group_ids()));
CREATE POLICY "Members can leave their groups"
  ON public.group_members FOR DELETE
  USING (user_id = auth.uid());

-- events
CREATE POLICY "Group members can view events"
  ON public.events FOR SELECT
  USING (group_id IN (SELECT group_id FROM public.group_members WHERE user_id = auth.uid()));
CREATE POLICY "Invitees can view events they're invited to"
  ON public.events FOR SELECT USING (auth.uid() = ANY(attendees));
CREATE POLICY "Group members can create events"
  ON public.events FOR INSERT
  WITH CHECK (group_id IN (SELECT group_id FROM public.group_members WHERE user_id = auth.uid()) AND auth.uid() = created_by);
CREATE POLICY "Event creator can update their event"
  ON public.events FOR UPDATE USING (auth.uid() = created_by);
CREATE POLICY "Event creator can delete their event"
  ON public.events FOR DELETE USING (auth.uid() = created_by);

-- ideas
CREATE POLICY "Group members can view ideas"
  ON public.ideas FOR SELECT
  USING (group_id IN (SELECT group_id FROM public.group_members WHERE user_id = auth.uid()));
CREATE POLICY "Group members can create ideas"
  ON public.ideas FOR INSERT
  WITH CHECK (group_id IN (SELECT group_id FROM public.group_members WHERE user_id = auth.uid()) AND auth.uid() = created_by);
CREATE POLICY "Group members can update ideas (status / votes)"
  ON public.ideas FOR UPDATE
  USING (group_id IN (SELECT group_id FROM public.group_members WHERE user_id = auth.uid()));
CREATE POLICY "Idea creator can delete their idea"
  ON public.ideas FOR DELETE USING (auth.uid() = created_by);

-- idea_votes
CREATE POLICY "Group members can view votes"
  ON public.idea_votes FOR SELECT
  USING (idea_id IN (
    SELECT i.id FROM public.ideas i
    JOIN public.group_members gm ON gm.group_id = i.group_id
    WHERE gm.user_id = auth.uid()
  ));
CREATE POLICY "Users can vote on ideas in their groups"
  ON public.idea_votes FOR INSERT
  WITH CHECK (auth.uid() = user_id AND idea_id IN (
    SELECT i.id FROM public.ideas i
    JOIN public.group_members gm ON gm.group_id = i.group_id
    WHERE gm.user_id = auth.uid()
  ));
CREATE POLICY "Users can remove their own vote"
  ON public.idea_votes FOR DELETE USING (auth.uid() = user_id);

-- contacts (per-user address book of people you plan with who aren't app users)
CREATE POLICY "Users can view their own contacts"
  ON public.contacts FOR SELECT USING (auth.uid() = owner_id);
CREATE POLICY "Users can create their own contacts"
  ON public.contacts FOR INSERT WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Users can update their own contacts"
  ON public.contacts FOR UPDATE USING (auth.uid() = owner_id);
CREATE POLICY "Users can delete their own contacts"
  ON public.contacts FOR DELETE USING (auth.uid() = owner_id);

-- notifications (in-app inbox; anyone can notify, only the recipient reads)
CREATE POLICY "Users can view their own notifications"
  ON public.notifications FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can send notifications as themselves"
  ON public.notifications FOR INSERT WITH CHECK (auth.uid() = actor_id);
CREATE POLICY "Users can mark their own notifications read"
  ON public.notifications FOR UPDATE USING (auth.uid() = user_id);

-- Claim or release an assignment ("I'll bring dessert") without edit rights
-- to the rest of the event. Only fills an open slot, and only releases your own.
CREATE OR REPLACE FUNCTION public.claim_assignment(p_event UUID, p_item TEXT, p_claim BOOLEAN)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.events e
  SET assignments = (
    SELECT COALESCE(jsonb_agg(
      CASE
        WHEN a->>'id' <> p_item THEN a
        WHEN p_claim AND (a->>'assignee_id') IS NULL THEN jsonb_set(a, '{assignee_id}', to_jsonb(auth.uid()::text))
        WHEN NOT p_claim AND a->>'assignee_id' = auth.uid()::text THEN jsonb_set(a, '{assignee_id}', 'null'::jsonb)
        ELSE a
      END ORDER BY ord), '[]'::jsonb)
    FROM jsonb_array_elements(e.assignments) WITH ORDINALITY AS t(a, ord)
  )
  WHERE e.id = p_event
    AND (auth.uid() = ANY(e.attendees)
         OR e.group_id IN (SELECT group_id FROM public.group_members WHERE user_id = auth.uid()));
END;
$$;

-- Reply to an event you're invited to, without edit rights to the rest of it,
-- optionally with a note ("Sick, so sorry!"). A new reply replaces your old
-- note. Replies close when a one-off event starts (a repeating series stays
-- open; the app closes each date as it starts).
DROP FUNCTION IF EXISTS public.set_rsvp(UUID, TEXT);
CREATE OR REPLACE FUNCTION public.set_rsvp(p_event UUID, p_status TEXT, p_note TEXT DEFAULT NULL)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_status NOT IN ('going', 'maybe', 'declined') THEN
    RAISE EXCEPTION 'Unknown reply %', p_status;
  END IF;
  UPDATE public.events
  SET rsvps = rsvps || jsonb_build_object(auth.uid()::text, p_status),
      rsvp_notes = CASE
        WHEN NULLIF(btrim(p_note), '') IS NULL THEN rsvp_notes - auth.uid()::text
        ELSE rsvp_notes || jsonb_build_object(auth.uid()::text, left(btrim(p_note), 280))
      END
  WHERE id = p_event AND auth.uid() = ANY(attendees)
    AND cancelled_at IS NULL
    AND (recurrence IS NOT NULL OR start_time > NOW());
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Replies are closed for this event';
  END IF;
END;
$$;

-- Say which proposed dates work for you. Replaces only your own answer.
CREATE OR REPLACE FUNCTION public.set_slot_votes(p_idea UUID, p_starts TEXT[])
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.ideas i
  SET slot_votes = slot_votes || jsonb_build_object(auth.uid()::text, to_jsonb(p_starts))
  WHERE i.id = p_idea
    AND (auth.uid() = ANY(i.audience_user_ids)
         OR i.group_id IN (SELECT group_id FROM public.group_members WHERE user_id = auth.uid())
         OR i.audience_group_ids && ARRAY(SELECT group_id FROM public.group_members WHERE user_id = auth.uid()));
END;
$$;

-- Comments on plans ("Memories" once the event has happened)
CREATE TABLE IF NOT EXISTS public.plan_comments (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id    UUID        REFERENCES public.events(id) ON DELETE CASCADE,
  idea_id     UUID        REFERENCES public.ideas(id) ON DELETE CASCADE,
  user_id     UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  body        TEXT        NOT NULL DEFAULT '',
  photo_urls  TEXT[]      NOT NULL DEFAULT '{}',   -- storage paths in the "memories" bucket
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT one_target CHECK ((event_id IS NULL) <> (idea_id IS NULL)),
  CONSTRAINT plan_comments_body_check CHECK (length(body) <= 1000 AND (length(btrim(body)) > 0 OR cardinality(photo_urls) > 0)),
  CONSTRAINT plan_comments_photo_count CHECK (cardinality(photo_urls) <= 12)
);

CREATE INDEX IF NOT EXISTS plan_comments_event ON public.plan_comments (event_id, created_at);
CREATE INDEX IF NOT EXISTS plan_comments_idea  ON public.plan_comments (idea_id, created_at);

ALTER TABLE public.plan_comments ENABLE ROW LEVEL SECURITY;

-- Whoever can see the plan can read and join the conversation.
CREATE OR REPLACE FUNCTION public.can_see_plan(p_event UUID, p_idea UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN p_event IS NOT NULL THEN EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = p_event
        AND (auth.uid() = ANY(e.attendees)
             OR e.group_id IN (SELECT group_id FROM public.group_members WHERE user_id = auth.uid())))
    ELSE EXISTS (
      SELECT 1 FROM public.ideas i
      WHERE i.id = p_idea
        AND (auth.uid() = ANY(i.audience_user_ids)
             OR i.group_id IN (SELECT group_id FROM public.group_members WHERE user_id = auth.uid())))
  END;
$$;

CREATE POLICY "People on a plan can read its comments"
  ON public.plan_comments FOR SELECT USING (public.can_see_plan(event_id, idea_id));
CREATE POLICY "People on a plan can comment as themselves"
  ON public.plan_comments FOR INSERT WITH CHECK (auth.uid() = user_id AND public.can_see_plan(event_id, idea_id));
CREATE POLICY "Authors can delete their comments"
  ON public.plan_comments FOR DELETE USING (auth.uid() = user_id);

-- Memory photos
-- Private bucket. Paths are "<event id>/<user id>/<file>".
INSERT INTO storage.buckets (id, name, public)
VALUES ('memories', 'memories', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "People at an event can see its photos" ON storage.objects;
CREATE POLICY "People at an event can see its photos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'memories' AND public.can_see_plan(((storage.foldername(name))[1])::uuid, NULL));

DROP POLICY IF EXISTS "People at an event can add their own photos" ON storage.objects;
CREATE POLICY "People at an event can add their own photos"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'memories'
    AND (storage.foldername(name))[2] = auth.uid()::text
    AND public.can_see_plan(((storage.foldername(name))[1])::uuid, NULL)
  );

DROP POLICY IF EXISTS "People can remove their own photos" ON storage.objects;
CREATE POLICY "People can remove their own photos"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'memories' AND (storage.foldername(name))[2] = auth.uid()::text);

-- ─── Time zones ──────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.is_time_zone(p_tz TEXT)
RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = p_tz);
$$;

-- IANA names ("America/New_York"). Null = not known yet; the app uses the device's.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS timezone TEXT CHECK (timezone IS NULL OR public.is_time_zone(timezone));
-- The zone an event's wall-clock time belongs to ("7pm" where it happens),
-- so repeats keep their local time across daylight-saving changes.
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS timezone TEXT CHECK (timezone IS NULL OR public.is_time_zone(timezone));

-- ─── Categories ──────────────────────────────────────────────
-- Filters, summaries, and analytics refer to a category by id, never by name
-- or color, so renaming one changes nothing else. Built-ins have no owner and
-- fixed ids; anyone can add their own, or one for a group.

CREATE TABLE IF NOT EXISTS public.categories (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 40),
  color       TEXT        NOT NULL,
  icon        TEXT,
  is_default  BOOLEAN     NOT NULL DEFAULT false,
  owner_id    UUID        REFERENCES public.profiles(id) ON DELETE CASCADE,
  group_id    UUID        REFERENCES public.groups(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT categories_default_unowned CHECK (is_default = (owner_id IS NULL AND group_id IS NULL))
);

INSERT INTO public.categories (id, name, color, icon, is_default) VALUES
  ('00000000-0000-4000-8000-000000000001', 'Meals',    'orange', 'restaurant', true),
  ('00000000-0000-4000-8000-000000000002', 'Outdoors', 'green',  'leaf',       true),
  ('00000000-0000-4000-8000-000000000003', 'Kids',     'blue',   'happy',      true),
  ('00000000-0000-4000-8000-000000000004', 'Holidays', 'red',    'gift',       true),
  ('00000000-0000-4000-8000-000000000005', 'Errands',  'gray',   'cart',       true)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL;
ALTER TABLE public.ideas
  ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL;

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Categories visible to who can use them" ON public.categories;
CREATE POLICY "Categories visible to who can use them"
  ON public.categories FOR SELECT
  USING (is_default OR owner_id = auth.uid() OR group_id IN (SELECT public.my_group_ids()));
DROP POLICY IF EXISTS "Users add their own or their group's categories" ON public.categories;
CREATE POLICY "Users add their own or their group's categories"
  ON public.categories FOR INSERT
  WITH CHECK (NOT is_default AND (
    (owner_id = auth.uid() AND group_id IS NULL)
    OR (owner_id IS NULL AND group_id IN (SELECT public.my_group_ids()))));
DROP POLICY IF EXISTS "Users edit their own or their group's categories" ON public.categories;
CREATE POLICY "Users edit their own or their group's categories"
  ON public.categories FOR UPDATE
  USING (NOT is_default AND (owner_id = auth.uid() OR group_id IN (SELECT public.my_group_ids())))
  WITH CHECK (NOT is_default AND (
    (owner_id = auth.uid() AND group_id IS NULL)
    OR (owner_id IS NULL AND group_id IN (SELECT public.my_group_ids()))));
DROP POLICY IF EXISTS "Users delete their own or their group's categories" ON public.categories;
CREATE POLICY "Users delete their own or their group's categories"
  ON public.categories FOR DELETE
  USING (NOT is_default AND (owner_id = auth.uid() OR group_id IN (SELECT public.my_group_ids())));

-- ─── Connected calendars ─────────────────────────────────────
-- One row per external calendar a person lets Sheep consult. Rows are
-- created by the server after the provider's sign-in (never by the app), and
-- only read: Sheep never writes to an external calendar.

CREATE TABLE IF NOT EXISTS public.calendar_connections (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  provider                TEXT        NOT NULL CHECK (provider IN ('google', 'apple', 'outlook', 'ics')),
  remote_calendar_id      TEXT        NOT NULL,
  calendar_name           TEXT,
  account_label           TEXT,       -- e.g. the account's email; owner-only like the rest
  permissions             TEXT        NOT NULL DEFAULT 'freebusy' CHECK (permissions IN ('freebusy', 'read')),
  sync_status             TEXT        NOT NULL DEFAULT 'pending'
                                      CHECK (sync_status IN ('pending', 'ok', 'error', 'revoked')),
  include_in_availability BOOLEAN     NOT NULL DEFAULT true,
  synced_from             TIMESTAMPTZ,   -- the window the last sync covered
  synced_to               TIMESTAMPTZ,
  last_synced_at          TIMESTAMPTZ,
  last_error              TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, provider, remote_calendar_id),
  UNIQUE (id, user_id)                   -- so occurrences can't name someone else as owner
);

-- Provider tokens. RLS on with no policies: only the server (service role)
-- can read or write them. Gone with the connection.
CREATE TABLE IF NOT EXISTS public.calendar_credentials (
  connection_id     UUID        PRIMARY KEY REFERENCES public.calendar_connections(id) ON DELETE CASCADE,
  encrypted_token   TEXT        NOT NULL,
  scopes            TEXT[]      NOT NULL DEFAULT '{}',
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Synced busy times. Titles and notes are kept for the owner's own view only;
-- nobody else can select these rows, and the group estimate returns counts.
CREATE TABLE IF NOT EXISTS public.calendar_occurrences (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id   UUID        NOT NULL,
  owner_user_id   UUID        NOT NULL,
  source          TEXT        NOT NULL,      -- provider, copied for analysis queries
  external_id     TEXT        NOT NULL,
  start_at        TIMESTAMPTZ NOT NULL,
  end_at          TIMESTAMPTZ NOT NULL,
  all_day         BOOLEAN     NOT NULL DEFAULT false,   -- start/end are local midnights in `timezone`
  timezone        TEXT,
  busy_status     TEXT        NOT NULL DEFAULT 'busy'
                              CHECK (busy_status IN ('busy', 'tentative', 'free', 'out_of_office')),
  visibility      TEXT        NOT NULL DEFAULT 'default' CHECK (visibility IN ('default', 'public', 'private')),
  title           TEXT,
  description     TEXT,
  sheep_event_id  UUID        REFERENCES public.events(id) ON DELETE SET NULL,   -- same thing as a Sheep event
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (connection_id, owner_user_id)
    REFERENCES public.calendar_connections(id, user_id) ON DELETE CASCADE,
  UNIQUE (connection_id, external_id, start_at),
  CONSTRAINT occurrence_end_after_start CHECK (end_at > start_at)
);

CREATE INDEX IF NOT EXISTS calendar_occurrences_owner_start
  ON public.calendar_occurrences (owner_user_id, start_at);

ALTER TABLE public.calendar_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calendar_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calendar_occurrences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users see their own calendar connections" ON public.calendar_connections;
CREATE POLICY "Users see their own calendar connections"
  ON public.calendar_connections FOR SELECT USING (user_id = auth.uid());
-- Disconnecting deletes the row; its credentials and synced times go with it.
DROP POLICY IF EXISTS "Users disconnect their own calendars" ON public.calendar_connections;
CREATE POLICY "Users disconnect their own calendars"
  ON public.calendar_connections FOR DELETE USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users see their own synced events" ON public.calendar_occurrences;
CREATE POLICY "Users see their own synced events"
  ON public.calendar_occurrences FOR SELECT USING (owner_user_id = auth.uid());

-- Include or leave out a calendar without disconnecting it. The only change
-- the app makes to a connection; sync state is the server's to set.
CREATE OR REPLACE FUNCTION public.set_calendar_included(p_connection UUID, p_included BOOLEAN)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.calendar_connections
  SET include_in_availability = p_included
  WHERE id = p_connection AND user_id = auth.uid();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No such calendar';
  END IF;
END;
$$;

-- ─── Scheduling preferences ──────────────────────────────────
-- "Free time doesn't always mean you're up for plans." Private and soft:
-- they reorder suggestions, never mark anyone busy, never remove an option,
-- never answer for anyone, and are never returned to anyone else.
--   weekend_mode  any            — any free time works (default; as before)
--                 keep_one_free  — avoid filling the second day of a weekend
--                 ask_first      — your weekend times are never shown to
--                                  others as free; they count as unknown
--   spacing_enabled               — avoid back-to-back plans

CREATE TABLE IF NOT EXISTS public.availability_preferences (
  user_id          UUID        PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  weekend_mode     TEXT        NOT NULL DEFAULT 'any' CHECK (weekend_mode IN ('any', 'keep_one_free', 'ask_first')),
  spacing_enabled  BOOLEAN     NOT NULL DEFAULT false,
  quiet_weeknights BOOLEAN     NOT NULL DEFAULT false,   -- reserved; not used yet
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.availability_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage their own scheduling preferences" ON public.availability_preferences;
CREATE POLICY "Users manage their own scheduling preferences"
  ON public.availability_preferences FOR ALL
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ─── Availability estimate ───────────────────────────────────
-- For each candidate time: how many people's calendars look free, busy, or
-- can't be told, plus one combined "preference fit" penalty. Counts only —
-- no names, titles, preferences, or whose calendar is whose. Mirrors
-- memberAvailability() and softPenalty() in src/lib/availability.ts.
--
-- A person counts as free only when every calendar they've included was
-- synced recently and covers the time. No calendar, a stale one, or one with
-- an error or revoked access makes them unknown, never free. So does a
-- weekend time for someone who asked to be asked first (except for the one
-- asking). Busy is busy whatever anyone prefers.
--
-- Sheep facts the app already knows are passed in per slot, since the app
-- expands repeating events:
--   sheep_busy     [user id]           on a Sheep event then
--   nearby         { user id: 1 | 2 }  a Sheep plan the day before/after (1) or the same day (2)
--   weekend_taken  [user id]           a Sheep plan on the other day of that weekend
--
-- Everyone asked about must be the caller or share a group with them.
-- p_timezone decides what's a weekend for people without one on their profile.

CREATE OR REPLACE FUNCTION public.availability_estimate(p_member_ids UUID[], p_slots JSONB, p_timezone TEXT DEFAULT 'UTC')
RETURNS TABLE (slot_start TIMESTAMPTZ, slot_end TIMESTAMPTZ, available_count INT, busy_count INT,
               unknown_count INT, total_count INT, soft_penalty INT)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  me UUID := auth.uid();
  zone TEXT := CASE WHEN public.is_time_zone(p_timezone) THEN p_timezone ELSE 'UTC' END;
BEGIN
  IF me IS NULL THEN
    RAISE EXCEPTION 'Sign in first';
  END IF;
  IF cardinality(p_member_ids) IS NULL OR cardinality(p_member_ids) > 50 THEN
    RAISE EXCEPTION 'Ask about 1 to 50 people';
  END IF;
  IF jsonb_typeof(p_slots) <> 'array' OR jsonb_array_length(p_slots) > 60 THEN
    RAISE EXCEPTION 'Ask about at most 60 times at once';
  END IF;
  IF EXISTS (
    SELECT 1 FROM unnest(p_member_ids) AS m(uid)
    WHERE m.uid <> me AND NOT EXISTS (
      SELECT 1 FROM public.group_members gm
      WHERE gm.user_id = m.uid AND gm.group_id IN (SELECT public.my_group_ids()))) THEN
    RAISE EXCEPTION 'Everyone asked about must share a group with you';
  END IF;

  RETURN QUERY
  WITH slots AS (
    SELECT (s->>'start')::timestamptz AS s_start,
           (s->>'end')::timestamptz   AS s_end,
           ARRAY(SELECT jsonb_array_elements_text(COALESCE(s->'sheep_busy', '[]'::jsonb)))::uuid[]    AS sheep_busy,
           COALESCE(s->'nearby', '{}'::jsonb)                                                          AS nearby,
           ARRAY(SELECT jsonb_array_elements_text(COALESCE(s->'weekend_taken', '[]'::jsonb)))::uuid[] AS weekend_taken
    FROM jsonb_array_elements(p_slots) s
  ),
  people AS (
    SELECT DISTINCT m.uid,
      COALESCE(ap.weekend_mode, 'any')      AS weekend_mode,
      COALESCE(ap.spacing_enabled, false)   AS spacing_enabled,
      COALESCE(pr.timezone, zone)           AS tz
    FROM unnest(p_member_ids) AS m(uid)
    LEFT JOIN public.availability_preferences ap ON ap.user_id = m.uid
    LEFT JOIN public.profiles pr ON pr.id = m.uid
  ),
  pairs AS (
    SELECT sl.*, p.*,
      -- Any of its days a Saturday or Sunday (a trip can start on a Friday).
      EXISTS (
        SELECT 1 FROM generate_series((sl.s_start AT TIME ZONE p.tz)::date::timestamp,
                                      ((sl.s_end - INTERVAL '1 microsecond') AT TIME ZONE p.tz)::date::timestamp,
                                      INTERVAL '1 day') AS d(day)
        WHERE EXTRACT(ISODOW FROM d.day) IN (6, 7)) AS weekend
    FROM slots sl CROSS JOIN people p
    WHERE sl.s_end > sl.s_start AND sl.s_end - sl.s_start <= INTERVAL '31 days'
  ),
  verdicts AS (
    SELECT pa.s_start, pa.s_end,
      CASE
        WHEN pa.uid = ANY(pa.sheep_busy) THEN 'busy'
        WHEN EXISTS (
          SELECT 1 FROM public.calendar_occurrences o
          JOIN public.calendar_connections cc ON cc.id = o.connection_id
          WHERE o.owner_user_id = pa.uid
            AND cc.include_in_availability AND cc.sync_status = 'ok'
            AND cc.last_synced_at > NOW() - INTERVAL '24 hours'
            AND cc.synced_from <= pa.s_start AND cc.synced_to >= pa.s_end
            AND o.busy_status <> 'free'
            AND o.start_at < pa.s_end AND o.end_at > pa.s_start) THEN 'busy'
        WHEN pa.weekend_mode = 'ask_first' AND pa.weekend AND pa.uid <> me THEN 'unknown'
        WHEN EXISTS (
          SELECT 1 FROM public.calendar_connections cc
          WHERE cc.user_id = pa.uid AND cc.include_in_availability)
          AND NOT EXISTS (
          SELECT 1 FROM public.calendar_connections cc
          WHERE cc.user_id = pa.uid AND cc.include_in_availability
            AND NOT (cc.sync_status = 'ok'
                     AND cc.last_synced_at > NOW() - INTERVAL '24 hours'
                     AND cc.synced_from <= pa.s_start AND cc.synced_to >= pa.s_end)) THEN 'free'
        ELSE 'unknown'
      END AS verdict,
      (CASE WHEN pa.spacing_enabled THEN LEAST(GREATEST(COALESCE((pa.nearby->>pa.uid::text)::int, 0), 0), 2) ELSE 0 END)
      + (CASE WHEN pa.weekend_mode = 'keep_one_free' AND pa.weekend AND pa.uid = ANY(pa.weekend_taken) THEN 2 ELSE 0 END)
        AS penalty
    FROM pairs pa
  )
  SELECT v.s_start, v.s_end,
    COUNT(*) FILTER (WHERE v.verdict = 'free')::int,
    COUNT(*) FILTER (WHERE v.verdict = 'busy')::int,
    COUNT(*) FILTER (WHERE v.verdict = 'unknown')::int,
    COUNT(*)::int,
    COALESCE(SUM(v.penalty) FILTER (WHERE v.verdict <> 'busy'), 0)::int
  FROM verdicts v
  GROUP BY v.s_start, v.s_end
  ORDER BY v.s_start;
END;
$$;
