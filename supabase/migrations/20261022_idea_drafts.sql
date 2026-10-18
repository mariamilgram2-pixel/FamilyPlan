-- Drafts: a plan you started and haven't sent. Closing New Plan keeps what
-- you typed as a draft in Plans, so it's never lost. Only you see your drafts:
-- nobody's notified and nobody else's Plans list shows them.
--
-- Run once in the Supabase SQL Editor, after 20261021_saved_places.sql.
-- Safe to run again.

ALTER TABLE public.ideas DROP CONSTRAINT IF EXISTS ideas_status_check;
ALTER TABLE public.ideas ADD CONSTRAINT ideas_status_check
  CHECK (status IN ('draft', 'proposed', 'planned', 'done'));

DROP POLICY IF EXISTS "Group members can view ideas" ON public.ideas;
CREATE POLICY "Group members can view ideas"
  ON public.ideas FOR SELECT
  USING (group_id IN (SELECT group_id FROM public.group_members WHERE user_id = auth.uid())
         AND (status <> 'draft' OR created_by = auth.uid()));

DROP POLICY IF EXISTS "Group members can update ideas (status / votes)" ON public.ideas;
CREATE POLICY "Group members can update ideas (status / votes)"
  ON public.ideas FOR UPDATE
  USING (group_id IN (SELECT group_id FROM public.group_members WHERE user_id = auth.uid())
         AND (status <> 'draft' OR created_by = auth.uid()));
