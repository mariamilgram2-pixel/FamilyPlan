-- Where an event is. It's in schema.sql's events table, but databases made
-- from an older schema don't have it, and saving an invite needs it.
--
-- Run once in the Supabase SQL Editor. Safe to run again.

ALTER TABLE public.events ADD COLUMN IF NOT EXISTS location TEXT;
