-- Friends on sheep: send a request, they accept, and you're friends: you can
-- add each other to plans and groups without sharing a group first.
--
-- Finding people: by the phone numbers you've added (your people), or by an
-- exact email or number you type. Only exact matches come back, and only a
-- name and picture. Your own number (Profile) is kept here, apart from
-- profiles, and nobody can read it: find_people() only checks it.
--
-- Also: notifications for a request, an accepted request, and being added to
-- a group.
--
-- Run once in the Supabase SQL Editor. Safe to run again.

-- ─── Your number, for being found ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.profile_phones (
  user_id     UUID        PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  phone_key   TEXT        NOT NULL CHECK (phone_key ~ '^[0-9]{7,15}$'),   -- digits; the last 10 for longer numbers
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS profile_phones_key ON public.profile_phones (phone_key);
ALTER TABLE public.profile_phones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "You see your own number" ON public.profile_phones;
CREATE POLICY "You see your own number" ON public.profile_phones FOR SELECT USING (user_id = auth.uid());
DROP POLICY IF EXISTS "You add your own number" ON public.profile_phones;
CREATE POLICY "You add your own number" ON public.profile_phones FOR INSERT WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "You change your own number" ON public.profile_phones;
CREATE POLICY "You change your own number" ON public.profile_phones FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "You remove your own number" ON public.profile_phones;
CREATE POLICY "You remove your own number" ON public.profile_phones FOR DELETE USING (user_id = auth.uid());

-- ─── Friendships ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.friendships (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id  UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  addressee_id  UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status        TEXT        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  accepted_at   TIMESTAMPTZ,
  CHECK (requester_id <> addressee_id)
);
-- One friendship per pair, whoever asked.
CREATE UNIQUE INDEX IF NOT EXISTS friendships_pair
  ON public.friendships (LEAST(requester_id, addressee_id), GREATEST(requester_id, addressee_id));
ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "You see your friendships" ON public.friendships;
CREATE POLICY "You see your friendships"
  ON public.friendships FOR SELECT USING (auth.uid() IN (requester_id, addressee_id));
DROP POLICY IF EXISTS "You send friend requests" ON public.friendships;
CREATE POLICY "You send friend requests"
  ON public.friendships FOR INSERT WITH CHECK (requester_id = auth.uid() AND status = 'pending');
DROP POLICY IF EXISTS "You accept requests sent to you" ON public.friendships;
CREATE POLICY "You accept requests sent to you"
  ON public.friendships FOR UPDATE
  USING (addressee_id = auth.uid())
  WITH CHECK (addressee_id = auth.uid() AND status = 'accepted');
-- Decline, cancel, or unfriend.
DROP POLICY IF EXISTS "Either of you can end it" ON public.friendships;
CREATE POLICY "Either of you can end it"
  ON public.friendships FOR DELETE USING (auth.uid() IN (requester_id, addressee_id));

-- ─── Finding people on sheep ────────────────────────────────────────────────
-- Exact matches only: numbers (as phone keys) and/or one email. A number
-- comes back only if you asked with it, so looking someone up by email never
-- reveals their number.
CREATE OR REPLACE FUNCTION public.find_people(p_phones TEXT[] DEFAULT '{}', p_email TEXT DEFAULT NULL)
RETURNS TABLE (id UUID, full_name TEXT, avatar_url TEXT, phone_key TEXT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id, p.full_name, p.avatar_url,
         CASE WHEN pp.phone_key = ANY (p_phones[1:500]) THEN pp.phone_key END
  FROM public.profiles p
  LEFT JOIN public.profile_phones pp ON pp.user_id = p.id
  WHERE auth.uid() IS NOT NULL
    AND p.id <> auth.uid()
    AND (pp.phone_key = ANY (p_phones[1:500])
         OR (NULLIF(trim(p_email), '') IS NOT NULL AND lower(p.email) = lower(trim(p_email))));
$$;
REVOKE ALL ON FUNCTION public.find_people(TEXT[], TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.find_people(TEXT[], TEXT) TO authenticated;

-- ─── Notifications ──────────────────────────────────────────────────────────
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_kind_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_kind_check CHECK (kind IN (
  'idea_proposed', 'dates_proposed', 'invite', 'assignment',
  'rsvp', 'event_changed', 'event_cancelled', 'date_votes', 'comment',
  'friend_request', 'friend_accepted', 'group_added'
));
