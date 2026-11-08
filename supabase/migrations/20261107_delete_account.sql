-- Delete your account, from Profile. Removes your sign-in and your profile;
-- everything that's yours goes with it (your people, notes, saved places,
-- connected calendars and their synced times, votes, notifications…) through
-- the ON DELETE CASCADE references in schema.sql. Plans and events you made
-- stay for the others in them, with no creator.
--
-- Also takes you off guest lists and plan audiences, and removes groups that
-- would be left with no one in them.
--
-- Run once in the Supabase SQL Editor. Safe to run again.

CREATE OR REPLACE FUNCTION public.delete_my_account()
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  me UUID := auth.uid();
  my_groups UUID[];
BEGIN
  IF me IS NULL THEN
    RAISE EXCEPTION 'Sign in first';
  END IF;

  SELECT coalesce(array_agg(group_id), '{}') INTO my_groups FROM public.group_members WHERE user_id = me;

  UPDATE public.events SET attendees = array_remove(attendees, me) WHERE me = ANY(attendees);
  UPDATE public.ideas SET audience_user_ids = array_remove(audience_user_ids, me) WHERE me = ANY(audience_user_ids);

  -- Your sign-in; your profile and everything that hangs off it follow.
  DELETE FROM auth.users WHERE id = me;

  -- Groups nobody is in any more.
  DELETE FROM public.groups g
  WHERE g.id = ANY(my_groups)
    AND NOT EXISTS (SELECT 1 FROM public.group_members m WHERE m.group_id = g.id);
END;
$$;

REVOKE ALL ON FUNCTION public.delete_my_account() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_my_account() TO authenticated;
