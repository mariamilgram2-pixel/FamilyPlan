-- A phone number for someone you added. In a plan's people picker you can
-- type a number, or pick someone from your phone's contacts: either one is
-- saved as one of your people (a contact) with their number, so they can be
-- in the plan like anyone else you've added.
--
-- Run once in the Supabase SQL Editor. Safe to run again.

ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS phone TEXT;
