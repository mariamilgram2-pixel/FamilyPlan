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
CREATE POLICY "Members can view membership of their groups"
  ON public.group_members FOR SELECT
  USING (group_id IN (SELECT group_id FROM public.group_members WHERE user_id = auth.uid()));
CREATE POLICY "Authenticated users can join groups"
  ON public.group_members FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins can manage members"
  ON public.group_members FOR DELETE
  USING (group_id IN (SELECT group_id FROM public.group_members WHERE user_id = auth.uid() AND role = 'admin'));

-- events
CREATE POLICY "Group members can view events"
  ON public.events FOR SELECT
  USING (group_id IN (SELECT group_id FROM public.group_members WHERE user_id = auth.uid()));
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
