-- Closing the loop: replies to invites, cancelling events, and voting on
-- proposed dates. Run once in the Supabase SQL Editor on databases created
-- before this change.

-- Replies: attendee id → 'going' | 'maybe' | 'declined'. Missing = no reply yet.
-- Notes: attendee id → why they changed it.
-- Cancelled events keep their row so invitees see "Cancelled" instead of a gap.
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS rsvps        JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS rsvp_notes   JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;

-- Date votes: user id → starts (ISO) of the proposed slots that work for them.
ALTER TABLE public.ideas
  ADD COLUMN IF NOT EXISTS slot_votes JSONB NOT NULL DEFAULT '{}';

ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_kind_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_kind_check CHECK (kind IN (
  'idea_proposed', 'dates_proposed', 'invite', 'assignment',
  'rsvp', 'event_changed', 'event_cancelled', 'date_votes'
));

-- Reply to an event you're invited to, without edit rights to the rest of it,
-- optionally with a note ("Sick, so sorry!"). A new reply replaces your old
-- note. Replies close when a one-off event starts (a repeating series stays
-- open; the app closes each date as it starts).
DROP FUNCTION IF EXISTS public.set_rsvp(UUID, TEXT);
CREATE OR REPLACE FUNCTION public.set_rsvp(p_event UUID, p_status TEXT, p_note TEXT DEFAULT NULL)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_status NOT IN ('going', 'maybe', 'declined') THEN
    RAISE EXCEPTION 'Unknown reply %', p_status;
  END IF;
  UPDATE public.events
  SET rsvps = rsvps || jsonb_build_object(auth.uid()::text, p_status),
      rsvp_notes = CASE
        WHEN NULLIF(btrim(p_note), '') IS NULL THEN rsvp_notes - auth.uid()::text
        ELSE rsvp_notes || jsonb_build_object(auth.uid()::text, left(btrim(p_note), 280))
      END
  WHERE id = p_event AND auth.uid() = ANY(attendees)
    AND cancelled_at IS NULL
    AND (recurrence IS NOT NULL OR start_time > NOW());
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Replies are closed for this event';
  END IF;
END;
$$;

-- Say which proposed dates work for you. Replaces only your own answer.
CREATE OR REPLACE FUNCTION public.set_slot_votes(p_idea UUID, p_starts TEXT[])
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.ideas i
  SET slot_votes = slot_votes || jsonb_build_object(auth.uid()::text, to_jsonb(p_starts))
  WHERE i.id = p_idea
    AND (auth.uid() = ANY(i.audience_user_ids)
         OR i.group_id IN (SELECT group_id FROM public.group_members WHERE user_id = auth.uid())
         OR i.audience_group_ids && ARRAY(SELECT group_id FROM public.group_members WHERE user_id = auth.uid()));
END;
$$;
