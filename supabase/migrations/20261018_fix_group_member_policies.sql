-- Fix "infinite recursion detected in policy for relation group_members".
--
-- The group_members policies asked "which groups am I in?" by reading
-- group_members, which re-ran the same policy, forever. Every table whose
-- policies look at group_members (groups, events, ideas, …) failed with it.
-- Answer that question in SECURITY DEFINER helpers instead, which read the
-- table without re-entering its policies.
--
-- Also lets members leave a group themselves (before, only admins could
-- remove anyone, so "Leave Group" failed for everyone else).
-- Run once in the Supabase SQL Editor. Safe to run again.

CREATE OR REPLACE FUNCTION public.my_group_ids()
RETURNS SETOF UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT group_id FROM public.group_members WHERE user_id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.my_admin_group_ids()
RETURNS SETOF UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT group_id FROM public.group_members WHERE user_id = auth.uid() AND role = 'admin';
$$;

DROP POLICY IF EXISTS "Members can view membership of their groups" ON public.group_members;
CREATE POLICY "Members can view membership of their groups"
  ON public.group_members FOR SELECT
  USING (group_id IN (SELECT public.my_group_ids()));

DROP POLICY IF EXISTS "Admins can manage members" ON public.group_members;
CREATE POLICY "Admins can manage members"
  ON public.group_members FOR DELETE
  USING (group_id IN (SELECT public.my_admin_group_ids()));

DROP POLICY IF EXISTS "Members can leave their groups" ON public.group_members;
CREATE POLICY "Members can leave their groups"
  ON public.group_members FOR DELETE
  USING (user_id = auth.uid());
