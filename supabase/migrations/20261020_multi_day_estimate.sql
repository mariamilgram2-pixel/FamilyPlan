-- Plans that run several days in a row (a camping weekend, a trip).
--
-- availability_estimate() now takes times up to 31 days long (was 2), for trips of up to a month, and a
-- time counts as a weekend when any of its days is a Saturday or Sunday, not
-- just its first. So "ask me before suggesting weekend times" also covers a
-- Fri–Sun trip, and "keep one day free" sees a trip that takes a whole weekend.
--
-- Run once in the Supabase SQL Editor, after 20261019_calendars_categories_privacy.sql.
-- Safe to run again.

CREATE OR REPLACE FUNCTION public.availability_estimate(p_member_ids UUID[], p_slots JSONB, p_timezone TEXT DEFAULT 'UTC')
RETURNS TABLE (slot_start TIMESTAMPTZ, slot_end TIMESTAMPTZ, available_count INT, busy_count INT,
               unknown_count INT, total_count INT, soft_penalty INT)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  me UUID := auth.uid();
  zone TEXT := CASE WHEN public.is_time_zone(p_timezone) THEN p_timezone ELSE 'UTC' END;
BEGIN
  IF me IS NULL THEN
    RAISE EXCEPTION 'Sign in first';
  END IF;
  IF cardinality(p_member_ids) IS NULL OR cardinality(p_member_ids) > 50 THEN
    RAISE EXCEPTION 'Ask about 1 to 50 people';
  END IF;
  IF jsonb_typeof(p_slots) <> 'array' OR jsonb_array_length(p_slots) > 60 THEN
    RAISE EXCEPTION 'Ask about at most 60 times at once';
  END IF;
  IF EXISTS (
    SELECT 1 FROM unnest(p_member_ids) AS m(uid)
    WHERE m.uid <> me AND NOT EXISTS (
      SELECT 1 FROM public.group_members gm
      WHERE gm.user_id = m.uid AND gm.group_id IN (SELECT public.my_group_ids()))) THEN
    RAISE EXCEPTION 'Everyone asked about must share a group with you';
  END IF;

  RETURN QUERY
  WITH slots AS (
    SELECT (s->>'start')::timestamptz AS s_start,
           (s->>'end')::timestamptz   AS s_end,
           ARRAY(SELECT jsonb_array_elements_text(COALESCE(s->'sheep_busy', '[]'::jsonb)))::uuid[]    AS sheep_busy,
           COALESCE(s->'nearby', '{}'::jsonb)                                                          AS nearby,
           ARRAY(SELECT jsonb_array_elements_text(COALESCE(s->'weekend_taken', '[]'::jsonb)))::uuid[] AS weekend_taken
    FROM jsonb_array_elements(p_slots) s
  ),
  people AS (
    SELECT DISTINCT m.uid,
      COALESCE(ap.weekend_mode, 'any')      AS weekend_mode,
      COALESCE(ap.spacing_enabled, false)   AS spacing_enabled,
      COALESCE(pr.timezone, zone)           AS tz
    FROM unnest(p_member_ids) AS m(uid)
    LEFT JOIN public.availability_preferences ap ON ap.user_id = m.uid
    LEFT JOIN public.profiles pr ON pr.id = m.uid
  ),
  pairs AS (
    SELECT sl.*, p.*,
      -- Any of its days a Saturday or Sunday (a trip can start on a Friday).
      EXISTS (
        SELECT 1 FROM generate_series((sl.s_start AT TIME ZONE p.tz)::date::timestamp,
                                      ((sl.s_end - INTERVAL '1 microsecond') AT TIME ZONE p.tz)::date::timestamp,
                                      INTERVAL '1 day') AS d(day)
        WHERE EXTRACT(ISODOW FROM d.day) IN (6, 7)) AS weekend
    FROM slots sl CROSS JOIN people p
    WHERE sl.s_end > sl.s_start AND sl.s_end - sl.s_start <= INTERVAL '31 days'
  ),
  verdicts AS (
    SELECT pa.s_start, pa.s_end,
      CASE
        WHEN pa.uid = ANY(pa.sheep_busy) THEN 'busy'
        WHEN EXISTS (
          SELECT 1 FROM public.calendar_occurrences o
          JOIN public.calendar_connections cc ON cc.id = o.connection_id
          WHERE o.owner_user_id = pa.uid
            AND cc.include_in_availability AND cc.sync_status = 'ok'
            AND cc.last_synced_at > NOW() - INTERVAL '24 hours'
            AND cc.synced_from <= pa.s_start AND cc.synced_to >= pa.s_end
            AND o.busy_status <> 'free'
            AND o.start_at < pa.s_end AND o.end_at > pa.s_start) THEN 'busy'
        WHEN pa.weekend_mode = 'ask_first' AND pa.weekend AND pa.uid <> me THEN 'unknown'
        WHEN EXISTS (
          SELECT 1 FROM public.calendar_connections cc
          WHERE cc.user_id = pa.uid AND cc.include_in_availability)
          AND NOT EXISTS (
          SELECT 1 FROM public.calendar_connections cc
          WHERE cc.user_id = pa.uid AND cc.include_in_availability
            AND NOT (cc.sync_status = 'ok'
                     AND cc.last_synced_at > NOW() - INTERVAL '24 hours'
                     AND cc.synced_from <= pa.s_start AND cc.synced_to >= pa.s_end)) THEN 'free'
        ELSE 'unknown'
      END AS verdict,
      (CASE WHEN pa.spacing_enabled THEN LEAST(GREATEST(COALESCE((pa.nearby->>pa.uid::text)::int, 0), 0), 2) ELSE 0 END)
      + (CASE WHEN pa.weekend_mode = 'keep_one_free' AND pa.weekend AND pa.uid = ANY(pa.weekend_taken) THEN 2 ELSE 0 END)
        AS penalty
    FROM pairs pa
  )
  SELECT v.s_start, v.s_end,
    COUNT(*) FILTER (WHERE v.verdict = 'free')::int,
    COUNT(*) FILTER (WHERE v.verdict = 'busy')::int,
    COUNT(*) FILTER (WHERE v.verdict = 'unknown')::int,
    COUNT(*)::int,
    COALESCE(SUM(v.penalty) FILTER (WHERE v.verdict <> 'busy'), 0)::int
  FROM verdicts v
  GROUP BY v.s_start, v.s_end
  ORDER BY v.s_start;
END;
$$;
