-- Home, traditions, and conversation: birthdays on profiles, rotating hosts
-- on repeating events, and a comment thread on every plan (which becomes
-- "Memories" once the event has happened).
-- Run once in the Supabase SQL Editor, after 20261015_rsvps_and_date_votes.sql.

-- Birthday as MM-DD: the day matters for nudges, the year doesn't.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS birthday TEXT CHECK (birthday ~ '^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$');

-- Traditions: whose turn it is to host, in order. Occurrence n is hosted by
-- host_rotation[n mod length]. Empty = no rotation.
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS host_rotation UUID[] NOT NULL DEFAULT '{}';

CREATE TABLE IF NOT EXISTS public.plan_comments (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id    UUID        REFERENCES public.events(id) ON DELETE CASCADE,
  idea_id     UUID        REFERENCES public.ideas(id) ON DELETE CASCADE,
  user_id     UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  body        TEXT        NOT NULL CHECK (length(btrim(body)) BETWEEN 1 AND 1000),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT one_target CHECK ((event_id IS NULL) <> (idea_id IS NULL))
);

CREATE INDEX IF NOT EXISTS plan_comments_event ON public.plan_comments (event_id, created_at);
CREATE INDEX IF NOT EXISTS plan_comments_idea  ON public.plan_comments (idea_id, created_at);

ALTER TABLE public.plan_comments ENABLE ROW LEVEL SECURITY;

-- Whoever can see the plan can read and join the conversation.
CREATE OR REPLACE FUNCTION public.can_see_plan(p_event UUID, p_idea UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN p_event IS NOT NULL THEN EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = p_event
        AND (auth.uid() = ANY(e.attendees)
             OR e.group_id IN (SELECT group_id FROM public.group_members WHERE user_id = auth.uid())))
    ELSE EXISTS (
      SELECT 1 FROM public.ideas i
      WHERE i.id = p_idea
        AND (auth.uid() = ANY(i.audience_user_ids)
             OR i.group_id IN (SELECT group_id FROM public.group_members WHERE user_id = auth.uid())))
  END;
$$;

CREATE POLICY "People on a plan can read its comments"
  ON public.plan_comments FOR SELECT USING (public.can_see_plan(event_id, idea_id));
CREATE POLICY "People on a plan can comment as themselves"
  ON public.plan_comments FOR INSERT WITH CHECK (auth.uid() = user_id AND public.can_see_plan(event_id, idea_id));
CREATE POLICY "Authors can delete their comments"
  ON public.plan_comments FOR DELETE USING (auth.uid() = user_id);

ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_kind_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_kind_check CHECK (kind IN (
  'idea_proposed', 'dates_proposed', 'invite', 'assignment',
  'rsvp', 'event_changed', 'event_cancelled', 'date_votes', 'comment'
));
