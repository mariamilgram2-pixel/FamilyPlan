-- Idea planning: optional place/date on ideas, proposed date options, the
-- event an idea became, and an in-app notifications inbox. Also on events:
-- repeat rules, group invites, and assignments.
-- Run once in the Supabase SQL Editor on databases created before this change.

ALTER TABLE public.ideas
  ADD COLUMN IF NOT EXISTS location       TEXT,
  ADD COLUMN IF NOT EXISTS target_date    DATE,
  ADD COLUMN IF NOT EXISTS proposed_slots JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS event_id       UUID REFERENCES public.events(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS planned_at     TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS public.notifications (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  actor_id    UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
  kind        TEXT        NOT NULL CHECK (kind IN ('idea_proposed', 'dates_proposed', 'invite', 'assignment')),
  idea_id     UUID        REFERENCES public.ideas(id) ON DELETE CASCADE,
  event_id    UUID        REFERENCES public.events(id) ON DELETE CASCADE,
  title       TEXT        NOT NULL,
  body        TEXT,
  read_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS notifications_user_created ON public.notifications (user_id, created_at DESC);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own notifications"
  ON public.notifications FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can send notifications as themselves"
  ON public.notifications FOR INSERT WITH CHECK (auth.uid() = actor_id);
CREATE POLICY "Users can mark their own notifications read"
  ON public.notifications FOR UPDATE USING (auth.uid() = user_id);

-- Recurring events: one row per series, with its repeat rule.
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS recurrence JSONB;

-- Invites and assignments: whole groups can be invited (members land in
-- attendees, who can then see the event), and items can be assigned.
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS invited_group_ids UUID[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS assignments       JSONB  NOT NULL DEFAULT '[]';

CREATE POLICY "Invitees can view events they're invited to"
  ON public.events FOR SELECT USING (auth.uid() = ANY(attendees));

-- Claim or release an assignment ("I'll bring dessert") without edit rights
-- to the rest of the event. Only fills an open slot, and only releases your own.
CREATE OR REPLACE FUNCTION public.claim_assignment(p_event UUID, p_item TEXT, p_claim BOOLEAN)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.events e
  SET assignments = (
    SELECT COALESCE(jsonb_agg(
      CASE
        WHEN a->>'id' <> p_item THEN a
        WHEN p_claim AND (a->>'assignee_id') IS NULL THEN jsonb_set(a, '{assignee_id}', to_jsonb(auth.uid()::text))
        WHEN NOT p_claim AND a->>'assignee_id' = auth.uid()::text THEN jsonb_set(a, '{assignee_id}', 'null'::jsonb)
        ELSE a
      END ORDER BY ord), '[]'::jsonb)
    FROM jsonb_array_elements(e.assignments) WITH ORDINALITY AS t(a, ord)
  )
  WHERE e.id = p_event
    AND (auth.uid() = ANY(e.attendees)
         OR e.group_id IN (SELECT group_id FROM public.group_members WHERE user_id = auth.uid()));
END;
$$;
