-- Foundations for connected calendars: time zones, shared categories, synced
-- free/busy, private scheduling preferences, and a group availability
-- estimate that never reveals whose calendar said what.
--
-- Four things stay separate, and nothing here turns one into another:
--   synced free/busy (calendar_occurrences)  — evidence, private to its owner
--   scheduling preferences                   — private, soft
--   date votes (ideas.slot_votes)            — what someone said works
--   replies (events.rsvps)                   — whether someone's going
--
-- Run once in the Supabase SQL Editor, after 20261018_fix_group_member_policies.sql.
-- Safe to run again.

-- ─── Time zones ──────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.is_time_zone(p_tz TEXT)
RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = p_tz);
$$;

-- IANA names ("America/New_York"). Null = not known yet; the app uses the device's.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS timezone TEXT CHECK (timezone IS NULL OR public.is_time_zone(timezone));
-- The zone an event's wall-clock time belongs to ("7pm" where it happens),
-- so repeats keep their local time across daylight-saving changes.
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS timezone TEXT CHECK (timezone IS NULL OR public.is_time_zone(timezone));

-- ─── Categories ──────────────────────────────────────────────
-- Filters, summaries, and analytics refer to a category by id, never by name
-- or color, so renaming one changes nothing else. Built-ins have no owner and
-- fixed ids; anyone can add their own, or one for a group.

CREATE TABLE IF NOT EXISTS public.categories (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 40),
  color       TEXT        NOT NULL,
  icon        TEXT,
  is_default  BOOLEAN     NOT NULL DEFAULT false,
  owner_id    UUID        REFERENCES public.profiles(id) ON DELETE CASCADE,
  group_id    UUID        REFERENCES public.groups(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT categories_default_unowned CHECK (is_default = (owner_id IS NULL AND group_id IS NULL))
);

INSERT INTO public.categories (id, name, color, icon, is_default) VALUES
  ('00000000-0000-4000-8000-000000000001', 'Meals',    'orange', 'restaurant', true),
  ('00000000-0000-4000-8000-000000000002', 'Outdoors', 'green',  'leaf',       true),
  ('00000000-0000-4000-8000-000000000003', 'Kids',     'blue',   'happy',      true),
  ('00000000-0000-4000-8000-000000000004', 'Holidays', 'red',    'gift',       true),
  ('00000000-0000-4000-8000-000000000005', 'Errands',  'gray',   'cart',       true)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL;
ALTER TABLE public.ideas
  ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL;

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Categories visible to who can use them" ON public.categories;
CREATE POLICY "Categories visible to who can use them"
  ON public.categories FOR SELECT
  USING (is_default OR owner_id = auth.uid() OR group_id IN (SELECT public.my_group_ids()));
DROP POLICY IF EXISTS "Users add their own or their group's categories" ON public.categories;
CREATE POLICY "Users add their own or their group's categories"
  ON public.categories FOR INSERT
  WITH CHECK (NOT is_default AND (
    (owner_id = auth.uid() AND group_id IS NULL)
    OR (owner_id IS NULL AND group_id IN (SELECT public.my_group_ids()))));
DROP POLICY IF EXISTS "Users edit their own or their group's categories" ON public.categories;
CREATE POLICY "Users edit their own or their group's categories"
  ON public.categories FOR UPDATE
  USING (NOT is_default AND (owner_id = auth.uid() OR group_id IN (SELECT public.my_group_ids())))
  WITH CHECK (NOT is_default AND (
    (owner_id = auth.uid() AND group_id IS NULL)
    OR (owner_id IS NULL AND group_id IN (SELECT public.my_group_ids()))));
DROP POLICY IF EXISTS "Users delete their own or their group's categories" ON public.categories;
CREATE POLICY "Users delete their own or their group's categories"
  ON public.categories FOR DELETE
  USING (NOT is_default AND (owner_id = auth.uid() OR group_id IN (SELECT public.my_group_ids())));

-- ─── Connected calendars ─────────────────────────────────────
-- One row per external calendar a person lets Sheep consult. Rows are
-- created by the server after the provider's sign-in (never by the app), and
-- only read: Sheep never writes to an external calendar.

CREATE TABLE IF NOT EXISTS public.calendar_connections (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  provider                TEXT        NOT NULL CHECK (provider IN ('google', 'apple', 'outlook', 'ics')),
  remote_calendar_id      TEXT        NOT NULL,
  calendar_name           TEXT,
  account_label           TEXT,       -- e.g. the account's email; owner-only like the rest
  permissions             TEXT        NOT NULL DEFAULT 'freebusy' CHECK (permissions IN ('freebusy', 'read')),
  sync_status             TEXT        NOT NULL DEFAULT 'pending'
                                      CHECK (sync_status IN ('pending', 'ok', 'error', 'revoked')),
  include_in_availability BOOLEAN     NOT NULL DEFAULT true,
  synced_from             TIMESTAMPTZ,   -- the window the last sync covered
  synced_to               TIMESTAMPTZ,
  last_synced_at          TIMESTAMPTZ,
  last_error              TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, provider, remote_calendar_id),
  UNIQUE (id, user_id)                   -- so occurrences can't name someone else as owner
);

-- Provider tokens. RLS on with no policies: only the server (service role)
-- can read or write them. Gone with the connection.
CREATE TABLE IF NOT EXISTS public.calendar_credentials (
  connection_id     UUID        PRIMARY KEY REFERENCES public.calendar_connections(id) ON DELETE CASCADE,
  encrypted_token   TEXT        NOT NULL,
  scopes            TEXT[]      NOT NULL DEFAULT '{}',
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Synced busy times. Titles and notes are kept for the owner's own view only;
-- nobody else can select these rows, and the group estimate returns counts.
CREATE TABLE IF NOT EXISTS public.calendar_occurrences (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id   UUID        NOT NULL,
  owner_user_id   UUID        NOT NULL,
  source          TEXT        NOT NULL,      -- provider, copied for analysis queries
  external_id     TEXT        NOT NULL,
  start_at        TIMESTAMPTZ NOT NULL,
  end_at          TIMESTAMPTZ NOT NULL,
  all_day         BOOLEAN     NOT NULL DEFAULT false,   -- start/end are local midnights in `timezone`
  timezone        TEXT,
  busy_status     TEXT        NOT NULL DEFAULT 'busy'
                              CHECK (busy_status IN ('busy', 'tentative', 'free', 'out_of_office')),
  visibility      TEXT        NOT NULL DEFAULT 'default' CHECK (visibility IN ('default', 'public', 'private')),
  title           TEXT,
  description     TEXT,
  sheep_event_id  UUID        REFERENCES public.events(id) ON DELETE SET NULL,   -- same thing as a Sheep event
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (connection_id, owner_user_id)
    REFERENCES public.calendar_connections(id, user_id) ON DELETE CASCADE,
  UNIQUE (connection_id, external_id, start_at),
  CONSTRAINT occurrence_end_after_start CHECK (end_at > start_at)
);

CREATE INDEX IF NOT EXISTS calendar_occurrences_owner_start
  ON public.calendar_occurrences (owner_user_id, start_at);

ALTER TABLE public.calendar_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calendar_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calendar_occurrences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users see their own calendar connections" ON public.calendar_connections;
CREATE POLICY "Users see their own calendar connections"
  ON public.calendar_connections FOR SELECT USING (user_id = auth.uid());
-- Disconnecting deletes the row; its credentials and synced times go with it.
DROP POLICY IF EXISTS "Users disconnect their own calendars" ON public.calendar_connections;
CREATE POLICY "Users disconnect their own calendars"
  ON public.calendar_connections FOR DELETE USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users see their own synced events" ON public.calendar_occurrences;
CREATE POLICY "Users see their own synced events"
  ON public.calendar_occurrences FOR SELECT USING (owner_user_id = auth.uid());

-- Include or leave out a calendar without disconnecting it. The only change
-- the app makes to a connection; sync state is the server's to set.
CREATE OR REPLACE FUNCTION public.set_calendar_included(p_connection UUID, p_included BOOLEAN)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.calendar_connections
  SET include_in_availability = p_included
  WHERE id = p_connection AND user_id = auth.uid();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No such calendar';
  END IF;
END;
$$;

-- ─── Scheduling preferences ──────────────────────────────────
-- "Free time doesn't always mean you're up for plans." Private and soft:
-- they reorder suggestions, never mark anyone busy, never remove an option,
-- never answer for anyone, and are never returned to anyone else.
--   weekend_mode  any            — any free time works (default; as before)
--                 keep_one_free  — avoid filling the second day of a weekend
--                 ask_first      — your weekend times are never shown to
--                                  others as free; they count as unknown
--   spacing_enabled               — avoid back-to-back plans

CREATE TABLE IF NOT EXISTS public.availability_preferences (
  user_id          UUID        PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  weekend_mode     TEXT        NOT NULL DEFAULT 'any' CHECK (weekend_mode IN ('any', 'keep_one_free', 'ask_first')),
  spacing_enabled  BOOLEAN     NOT NULL DEFAULT false,
  quiet_weeknights BOOLEAN     NOT NULL DEFAULT false,   -- reserved; not used yet
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.availability_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage their own scheduling preferences" ON public.availability_preferences;
CREATE POLICY "Users manage their own scheduling preferences"
  ON public.availability_preferences FOR ALL
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ─── Availability estimate ───────────────────────────────────
-- For each candidate time: how many people's calendars look free, busy, or
-- can't be told, plus one combined "preference fit" penalty. Counts only —
-- no names, titles, preferences, or whose calendar is whose. Mirrors
-- memberAvailability() and softPenalty() in src/lib/availability.ts.
--
-- A person counts as free only when every calendar they've included was
-- synced recently and covers the time. No calendar, a stale one, or one with
-- an error or revoked access makes them unknown, never free. So does a
-- weekend time for someone who asked to be asked first (except for the one
-- asking). Busy is busy whatever anyone prefers.
--
-- Sheep facts the app already knows are passed in per slot, since the app
-- expands repeating events:
--   sheep_busy     [user id]           on a Sheep event then
--   nearby         { user id: 1 | 2 }  a Sheep plan the day before/after (1) or the same day (2)
--   weekend_taken  [user id]           a Sheep plan on the other day of that weekend
--
-- Everyone asked about must be the caller or share a group with them.
-- p_timezone decides what's a weekend for people without one on their profile.

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
      EXTRACT(ISODOW FROM sl.s_start AT TIME ZONE p.tz) IN (6, 7) AS weekend
    FROM slots sl CROSS JOIN people p
    WHERE sl.s_end > sl.s_start AND sl.s_end - sl.s_start <= INTERVAL '2 days'
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
