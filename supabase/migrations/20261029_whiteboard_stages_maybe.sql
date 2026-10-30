-- "Not sure — plan without me": you stay on the plan and still get the
-- invite, but nobody waits on your date answers. Saying you can't make it
-- after all clears it too.
--
-- Run once in the Supabase SQL Editor, after 20261029_whiteboard_stages.sql.
-- Safe to run again.

ALTER TABLE public.ideas
  ADD COLUMN IF NOT EXISTS tentative_user_ids UUID[] NOT NULL DEFAULT '{}';

-- On: a maybe, nobody waits on you. Off: counted in again.
CREATE OR REPLACE FUNCTION public.set_tentative(p_idea UUID, p_on BOOLEAN)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE me UUID := auth.uid();
BEGIN
  IF NOT public.can_see_idea(p_idea) THEN RAISE EXCEPTION 'You’re not on this plan'; END IF;
  UPDATE public.ideas SET tentative_user_ids = CASE
    WHEN p_on THEN array_append(array_remove(tentative_user_ids, me), me)
    ELSE array_remove(tentative_user_ids, me)
  END
  WHERE id = p_idea;
END;
$$;

-- Can't make it: as before, and no longer a maybe.
CREATE OR REPLACE FUNCTION public.decline_plan(p_idea UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE me UUID := auth.uid();
BEGIN
  IF NOT public.can_see_idea(p_idea) THEN RAISE EXCEPTION 'You’re not on this plan'; END IF;
  IF EXISTS (SELECT 1 FROM public.ideas WHERE id = p_idea AND created_by = me) THEN
    RAISE EXCEPTION 'You started this plan; delete it instead';
  END IF;
  DELETE FROM public.idea_votes WHERE idea_id = p_idea AND user_id = me;
  UPDATE public.ideas SET
    declined_user_ids = array_append(array_remove(declined_user_ids, me), me),
    tentative_user_ids = array_remove(tentative_user_ids, me),
    audience_user_ids = array_remove(audience_user_ids, me),
    slot_votes = slot_votes - me::text,
    votes = (SELECT COUNT(*) FROM public.idea_votes WHERE idea_id = p_idea)
  WHERE id = p_idea;
END;
$$;
