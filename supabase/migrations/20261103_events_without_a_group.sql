-- Plans don't have to be a group's. Lock in a plan with just people (say,
-- only Fran) and the invite belongs to no group: it's on your calendar and
-- theirs, never on a group's shared calendar, and only you and the people
-- invited can see it. A plan for a group still lives on that group's calendar.
-- Same idea as 20261029_ideas_without_a_group.sql, for events.
--
-- Run once in the Supabase SQL Editor. Safe to run again.

ALTER TABLE public.events ALTER COLUMN group_id DROP NOT NULL;

-- Whoever made it can always see it (they're normally invited too).
DROP POLICY IF EXISTS "Creators can view their events" ON public.events;
CREATE POLICY "Creators can view their events"
  ON public.events FOR SELECT USING (auth.uid() = created_by);

-- Make one for a group you're in, or for no group at all.
DROP POLICY IF EXISTS "Group members can create events" ON public.events;
DROP POLICY IF EXISTS "Anyone can create their own events" ON public.events;
CREATE POLICY "Anyone can create their own events"
  ON public.events FOR INSERT
  WITH CHECK (auth.uid() = created_by
              AND (group_id IS NULL OR group_id IN (SELECT group_id FROM public.group_members WHERE user_id = auth.uid())));
