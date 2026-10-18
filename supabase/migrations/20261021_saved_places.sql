-- Saved places: "Home", "Work", "Grandma's" — your own names for places you
-- plan at often, shown first when you add where a plan is. Private to you.
--
-- `place` is stored the way plans store a location: the name, then the
-- address ("Home, 123 Maple St, Brooklyn, NY 11215").
--
-- Run once in the Supabase SQL Editor, after 20261020_multi_day_estimate.sql.
-- Safe to run again.

CREATE TABLE IF NOT EXISTS public.saved_places (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id    UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  label       TEXT        NOT NULL CHECK (char_length(label) BETWEEN 1 AND 40),
  place       TEXT        NOT NULL CHECK (char_length(place) BETWEEN 1 AND 300),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS saved_places_owner ON public.saved_places (owner_id);

ALTER TABLE public.saved_places ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own saved places" ON public.saved_places;
CREATE POLICY "Users can view their own saved places"
  ON public.saved_places FOR SELECT USING (auth.uid() = owner_id);
DROP POLICY IF EXISTS "Users can save places as themselves" ON public.saved_places;
CREATE POLICY "Users can save places as themselves"
  ON public.saved_places FOR INSERT WITH CHECK (auth.uid() = owner_id);
DROP POLICY IF EXISTS "Users can delete their own saved places" ON public.saved_places;
CREATE POLICY "Users can delete their own saved places"
  ON public.saved_places FOR DELETE USING (auth.uid() = owner_id);
