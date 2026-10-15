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
