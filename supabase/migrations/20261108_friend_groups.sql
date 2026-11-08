-- Groups without a shared calendar, like group chats: a few friends planning
-- a party or a trip. Everyone in one sees it and its plans (through every
-- stage, as with any group), anyone in it can add or remove people, and
-- anyone can leave. A name is optional: without one, the app shows who's in it.
--
-- They're ordinary groups (public.groups) with shared_calendar off, so plans,
-- invites and who-can-see-what work exactly as they do for groups now. Groups
-- with a shared calendar (family) are unchanged: only admins remove people,
-- and others join with the invite code.
--
-- Also: a photo and background color for any group (Edit, on its page). Anyone
-- in a group without a shared calendar can edit it; a shared calendar's admins can.
--
-- Run once in the Supabase SQL Editor. Safe to run again.

ALTER TABLE public.groups ADD COLUMN IF NOT EXISTS shared_calendar BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE public.groups ALTER COLUMN name DROP NOT NULL;
-- A group's look, editable from its page (Edit): a photo, and a background
-- color for its cover and flock (one of the calendar palette's colors).
ALTER TABLE public.groups ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE public.groups ADD COLUMN IF NOT EXISTS avatar_color TEXT CHECK (avatar_color IS NULL OR avatar_color ~ '^#[0-9A-Fa-f]{6}$');

-- The groups without a shared calendar that you're in. SECURITY DEFINER, like
-- my_group_ids(): reading group_members inside its own policy would recurse.
CREATE OR REPLACE FUNCTION public.my_plain_group_ids()
RETURNS SETOF UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT gm.group_id FROM public.group_members gm
  JOIN public.groups g ON g.id = gm.group_id
  WHERE gm.user_id = auth.uid() AND NOT g.shared_calendar;
$$;

DROP POLICY IF EXISTS "Members add people to their groups" ON public.group_members;
CREATE POLICY "Members add people to their groups"
  ON public.group_members FOR INSERT
  WITH CHECK (group_id IN (SELECT public.my_plain_group_ids()) AND role = 'member');

DROP POLICY IF EXISTS "Members remove people from their groups" ON public.group_members;
CREATE POLICY "Members remove people from their groups"
  ON public.group_members FOR DELETE
  USING (group_id IN (SELECT public.my_plain_group_ids()));

DROP POLICY IF EXISTS "Members rename their groups" ON public.groups;
CREATE POLICY "Members rename their groups"
  ON public.groups FOR UPDATE
  USING (id IN (SELECT public.my_plain_group_ids()))
  WITH CHECK (NOT shared_calendar);
