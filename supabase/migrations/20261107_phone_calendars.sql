-- Connect the calendars on your phone. The app reads them on the phone
-- (iCloud, and any Google, Outlook or work accounts added to it) and sends
-- what it found for a window of days; this saves it as your connected
-- calendars and their busy times, the same tables a server-side sign-in
-- would fill. Only you can see them; others get counts from
-- availability_estimate(), as before.
--
-- A phone calendar is provider 'device'. Each sync replaces that calendar's
-- times, so something deleted on the phone is gone here at the next sync.
-- Turning a calendar off deletes its connection (and its times) through the
-- existing "Users disconnect their own calendars" policy.
--
-- Run once in the Supabase SQL Editor, after the connected-calendars tables
-- in schema.sql exist. Safe to run again.

ALTER TABLE public.calendar_connections DROP CONSTRAINT IF EXISTS calendar_connections_provider_check;
ALTER TABLE public.calendar_connections ADD CONSTRAINT calendar_connections_provider_check
  CHECK (provider IN ('google', 'apple', 'outlook', 'ics', 'device'));

-- p_calendars: [{ id, name, account, events: [{ id, start, end, all_day, tz, busy, title }] }]
-- p_from / p_to: the window the phone read; at most 120 days.
-- Returns how many calendars were saved.
CREATE OR REPLACE FUNCTION public.sync_device_calendars(p_calendars JSONB, p_from TIMESTAMPTZ, p_to TIMESTAMPTZ)
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  me   UUID := auth.uid();
  cal  JSONB;
  conn UUID;
  n    INT := 0;
BEGIN
  IF me IS NULL THEN
    RAISE EXCEPTION 'Sign in first';
  END IF;
  IF p_to <= p_from OR p_to - p_from > INTERVAL '120 days' THEN
    RAISE EXCEPTION 'Sync window must be under 120 days';
  END IF;
  IF jsonb_typeof(p_calendars) <> 'array' OR jsonb_array_length(p_calendars) > 50 THEN
    RAISE EXCEPTION 'Send up to 50 calendars';
  END IF;

  FOR cal IN SELECT * FROM jsonb_array_elements(p_calendars) LOOP
    IF coalesce(cal->>'id', '') = '' THEN CONTINUE; END IF;

    INSERT INTO public.calendar_connections
      (user_id, provider, remote_calendar_id, calendar_name, account_label, permissions,
       sync_status, synced_from, synced_to, last_synced_at, last_error)
    VALUES
      (me, 'device', left(cal->>'id', 300), left(cal->>'name', 200), left(cal->>'account', 200), 'read',
       'ok', p_from, p_to, NOW(), NULL)
    ON CONFLICT (user_id, provider, remote_calendar_id) DO UPDATE SET
      calendar_name  = EXCLUDED.calendar_name,
      account_label  = EXCLUDED.account_label,
      sync_status    = 'ok',
      synced_from    = EXCLUDED.synced_from,
      synced_to      = EXCLUDED.synced_to,
      last_synced_at = NOW(),
      last_error     = NULL
    RETURNING id INTO conn;

    DELETE FROM public.calendar_occurrences WHERE connection_id = conn;

    INSERT INTO public.calendar_occurrences
      (connection_id, owner_user_id, source, external_id, start_at, end_at, all_day, timezone, busy_status, title)
    SELECT conn, me, 'device', left(e->>'id', 300),
           (e->>'start')::timestamptz, (e->>'end')::timestamptz,
           coalesce((e->>'all_day')::boolean, false),
           left(e->>'tz', 64),
           CASE WHEN e->>'busy' IN ('busy', 'tentative', 'free', 'out_of_office') THEN e->>'busy' ELSE 'busy' END,
           left(e->>'title', 300)
    FROM jsonb_array_elements(coalesce(cal->'events', '[]'::jsonb)) AS e
    WHERE coalesce(e->>'id', '') <> ''
      AND (e->>'end')::timestamptz > (e->>'start')::timestamptz
    LIMIT 3000
    ON CONFLICT (connection_id, external_id, start_at) DO NOTHING;

    n := n + 1;
  END LOOP;
  RETURN n;
END;
$$;
