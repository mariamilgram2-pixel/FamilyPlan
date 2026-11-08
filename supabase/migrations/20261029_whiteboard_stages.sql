-- Plans move Ideas → Finish planning → Coming up. Starting to plan an idea
-- moves it to Finish planning, and it stays there until it's booked, even if
-- you stop halfway. Anyone on a plan who isn't running it can say they can't
-- make it, which takes them off it while everyone else keeps going.
--
-- Run once in the Supabase SQL Editor, after 20261029_whiteboard_hidden_ideas.sql.
-- Safe to run again.

ALTER TABLE public.ideas
  ADD COLUMN IF NOT EXISTS planning_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS declined_user_ids UUID[] NOT NULL DEFAULT '{}';

-- Ideas that already had dates out were being planned.
UPDATE public.ideas SET planning_started_at = created_at
WHERE planning_started_at IS NULL AND jsonb_array_length(proposed_slots) > 0;

-- "Can't make it": off the people it's for, your "I'm in" and date answers
-- gone, and remembered so it doesn't ask you again. Whoever made it can't.
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
    audience_user_ids = array_remove(audience_user_ids, me),
    slot_votes = slot_votes - me::text,
    votes = (SELECT COUNT(*) FROM public.idea_votes WHERE idea_id = p_idea)
  WHERE id = p_idea;
END;
$$;
