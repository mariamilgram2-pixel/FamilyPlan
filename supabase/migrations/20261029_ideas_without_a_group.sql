-- Ideas don't have to belong to a group. Jotting one down keeps it just
-- yours; sharing it picks the people and/or groups it's for. Anyone it's
-- shared with (a group it's in, a group it's tagged into, or by name) can
-- see it, say they're in, add notes, and comment.
--
-- Run once in the Supabase SQL Editor, after 20261029_idea_whiteboard.sql.
-- Safe to run again.

ALTER TABLE public.ideas ALTER COLUMN group_id DROP NOT NULL;

-- Who an idea is for, beyond whoever made it. SECURITY DEFINER so policies on
-- other tables can ask without tripping the ideas policies.
CREATE OR REPLACE FUNCTION public.can_see_idea(p_idea UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.ideas i
    WHERE i.id = p_idea
      AND (i.created_by = auth.uid()
           OR (i.status <> 'draft'
               AND (auth.uid() = ANY(i.audience_user_ids)
                    OR i.group_id IN (SELECT group_id FROM public.group_members WHERE user_id = auth.uid())
                    OR i.audience_group_ids && ARRAY(SELECT group_id FROM public.group_members WHERE user_id = auth.uid())))));
$$;

DROP POLICY IF EXISTS "Group members can view ideas" ON public.ideas;
DROP POLICY IF EXISTS "People an idea is for can view it" ON public.ideas;
CREATE POLICY "People an idea is for can view it"
  ON public.ideas FOR SELECT
  USING (created_by = auth.uid()
         OR (status <> 'draft'
             AND (auth.uid() = ANY(audience_user_ids)
                  OR group_id IN (SELECT group_id FROM public.group_members WHERE user_id = auth.uid())
                  OR audience_group_ids && ARRAY(SELECT group_id FROM public.group_members WHERE user_id = auth.uid()))));

DROP POLICY IF EXISTS "Group members can create ideas" ON public.ideas;
DROP POLICY IF EXISTS "Anyone can create their own ideas" ON public.ideas;
CREATE POLICY "Anyone can create their own ideas"
  ON public.ideas FOR INSERT
  WITH CHECK (auth.uid() = created_by
              AND (group_id IS NULL OR group_id IN (SELECT group_id FROM public.group_members WHERE user_id = auth.uid())));

DROP POLICY IF EXISTS "Group members can update ideas (status / votes)" ON public.ideas;
DROP POLICY IF EXISTS "People an idea is for can update it" ON public.ideas;
CREATE POLICY "People an idea is for can update it"
  ON public.ideas FOR UPDATE
  USING (created_by = auth.uid()
         OR (status <> 'draft'
             AND (auth.uid() = ANY(audience_user_ids)
                  OR group_id IN (SELECT group_id FROM public.group_members WHERE user_id = auth.uid())
                  OR audience_group_ids && ARRAY(SELECT group_id FROM public.group_members WHERE user_id = auth.uid()))))
  WITH CHECK (group_id IS NULL OR group_id IN (SELECT group_id FROM public.group_members WHERE user_id = auth.uid())
              OR created_by <> auth.uid());

-- "I'm in" follows who can see the idea, not just its group.
DROP POLICY IF EXISTS "Group members can view votes" ON public.idea_votes;
DROP POLICY IF EXISTS "People on an idea can view votes" ON public.idea_votes;
CREATE POLICY "People on an idea can view votes"
  ON public.idea_votes FOR SELECT USING (public.can_see_idea(idea_id));

DROP POLICY IF EXISTS "Users can vote on ideas in their groups" ON public.idea_votes;
DROP POLICY IF EXISTS "People on an idea can vote" ON public.idea_votes;
CREATE POLICY "People on an idea can vote"
  ON public.idea_votes FOR INSERT WITH CHECK (auth.uid() = user_id AND public.can_see_idea(idea_id));

-- Comments: the same people.
CREATE OR REPLACE FUNCTION public.can_see_plan(p_event UUID, p_idea UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN p_event IS NOT NULL THEN EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = p_event
        AND (auth.uid() = ANY(e.attendees)
             OR e.group_id IN (SELECT group_id FROM public.group_members WHERE user_id = auth.uid())))
    ELSE public.can_see_idea(p_idea)
  END;
$$;
