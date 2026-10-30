-- Hide an idea or draft from your own Plans without deleting it. Hidden is
-- per person: everyone else still sees it. Hidden ideas wait in a "Hidden"
-- folder at the bottom of Ideas, and still turn up in search.
--
-- Run once in the Supabase SQL Editor, after 20261029_ideas_without_a_group.sql.
-- Safe to run again.

CREATE TABLE IF NOT EXISTS public.hidden_ideas (
  user_id     UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  idea_id     UUID        NOT NULL REFERENCES public.ideas(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, idea_id)
);

ALTER TABLE public.hidden_ideas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "You see what you hid" ON public.hidden_ideas;
CREATE POLICY "You see what you hid"
  ON public.hidden_ideas FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "You hide ideas for yourself" ON public.hidden_ideas;
CREATE POLICY "You hide ideas for yourself"
  ON public.hidden_ideas FOR INSERT WITH CHECK (auth.uid() = user_id AND public.can_see_idea(idea_id));
DROP POLICY IF EXISTS "You unhide your own" ON public.hidden_ideas;
CREATE POLICY "You unhide your own"
  ON public.hidden_ideas FOR DELETE USING (auth.uid() = user_id);
