-- One answer per person on an idea or plan, like an RSVP: In, Maybe, or
-- Can't. Everyone on it sees who said what. Answering one clears the others.
--   In     "I'm in" (idea_votes), counted on the row
--   Maybe  still on it and invited, but nobody waits on their dates
--   Can't  out of the planning: not asked about dates, not invited; they
--          still see it, and can change their answer
-- Whoever started it is always in, so they can't say Maybe or Can't.
--
-- Run once in the Supabase SQL Editor, after 20261029_whiteboard_stages_maybe.sql.
-- Safe to run again.

CREATE OR REPLACE FUNCTION public.set_idea_response(p_idea UUID, p_response TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE me UUID := auth.uid();
BEGIN
  IF p_response NOT IN ('in', 'maybe', 'cant', 'none') THEN RAISE EXCEPTION 'Unknown answer: %', p_response; END IF;
  IF NOT public.can_see_idea(p_idea) THEN RAISE EXCEPTION 'You’re not on this plan'; END IF;
  IF p_response IN ('maybe', 'cant') AND EXISTS (SELECT 1 FROM public.ideas WHERE id = p_idea AND created_by = me) THEN
    RAISE EXCEPTION 'You started this plan';
  END IF;

  IF p_response = 'in' THEN
    INSERT INTO public.idea_votes (idea_id, user_id) VALUES (p_idea, me) ON CONFLICT (idea_id, user_id) DO NOTHING;
  ELSE
    DELETE FROM public.idea_votes WHERE idea_id = p_idea AND user_id = me;
  END IF;

  UPDATE public.ideas SET
    tentative_user_ids = CASE WHEN p_response = 'maybe'
      THEN array_append(array_remove(tentative_user_ids, me), me) ELSE array_remove(tentative_user_ids, me) END,
    declined_user_ids = CASE WHEN p_response = 'cant'
      THEN array_append(array_remove(declined_user_ids, me), me) ELSE array_remove(declined_user_ids, me) END,
    slot_votes = CASE WHEN p_response = 'cant' THEN slot_votes - me::text ELSE slot_votes END,
    votes = (SELECT COUNT(*) FROM public.idea_votes WHERE idea_id = p_idea)
  WHERE id = p_idea;
END;
$$;
