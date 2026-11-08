-- People profiles: a little you share with the people you plan with, and
-- notes and photos you keep about them.
--
-- `about` and `favorites` live on profiles, which everyone can read, so
-- they're what you choose to share. person_notes are private to whoever
-- wrote them: the person they're about never sees them.
--
-- Run once in the Supabase SQL Editor, after 20261022_idea_drafts.sql.
-- Safe to run again.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS about     TEXT   CHECK (about IS NULL OR char_length(about) <= 140),
  ADD COLUMN IF NOT EXISTS favorites TEXT[] NOT NULL DEFAULT '{}' CHECK (cardinality(favorites) <= 6);

-- A photo for someone you added (they aren't on sheep to set their own).
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- About someone in your groups (subject_user_id) or someone you added
-- (subject_contact_id); exactly one.
CREATE TABLE IF NOT EXISTS public.person_notes (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id            UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  subject_user_id     UUID        REFERENCES public.profiles(id) ON DELETE CASCADE,
  subject_contact_id  UUID        REFERENCES public.contacts(id) ON DELETE CASCADE,
  body                TEXT        NOT NULL DEFAULT '' CHECK (char_length(body) <= 1000),
  photo_urls          TEXT[]      NOT NULL DEFAULT '{}' CHECK (cardinality(photo_urls) <= 12),   -- paths in "person-notes"
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK ((subject_user_id IS NULL) <> (subject_contact_id IS NULL)),
  CHECK (length(btrim(body)) > 0 OR cardinality(photo_urls) > 0)
);

CREATE INDEX IF NOT EXISTS person_notes_owner ON public.person_notes (owner_id);

ALTER TABLE public.person_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own notes about people" ON public.person_notes;
CREATE POLICY "Users can view their own notes about people"
  ON public.person_notes FOR SELECT USING (auth.uid() = owner_id);
DROP POLICY IF EXISTS "Users can write notes about people as themselves" ON public.person_notes;
CREATE POLICY "Users can write notes about people as themselves"
  ON public.person_notes FOR INSERT WITH CHECK (auth.uid() = owner_id);
DROP POLICY IF EXISTS "Users can delete their own notes about people" ON public.person_notes;
CREATE POLICY "Users can delete their own notes about people"
  ON public.person_notes FOR DELETE USING (auth.uid() = owner_id);

-- Private bucket. Paths are "<owner id>/<file>"; only the owner can touch them.
INSERT INTO storage.buckets (id, name, public)
VALUES ('person-notes', 'person-notes', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "People can see their own person-note photos" ON storage.objects;
CREATE POLICY "People can see their own person-note photos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'person-notes' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "People can add their own person-note photos" ON storage.objects;
CREATE POLICY "People can add their own person-note photos"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'person-notes' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "People can remove their own person-note photos" ON storage.objects;
CREATE POLICY "People can remove their own person-note photos"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'person-notes' AND (storage.foldername(name))[1] = auth.uid()::text);
