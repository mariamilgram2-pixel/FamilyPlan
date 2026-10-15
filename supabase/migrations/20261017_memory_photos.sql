-- Memories with photos: a memory can be a note, photos, or both. Photos live
-- in a private storage bucket, readable only by people who can see the
-- event, and are shown through short-lived signed links.
-- Run once in the Supabase SQL Editor, after 20261016_home_traditions_comments.sql.

ALTER TABLE public.plan_comments
  ADD COLUMN IF NOT EXISTS photo_urls TEXT[] NOT NULL DEFAULT '{}';   -- storage paths in "memories"

-- A note may now be empty when there are photos.
ALTER TABLE public.plan_comments DROP CONSTRAINT IF EXISTS plan_comments_body_check;
ALTER TABLE public.plan_comments ALTER COLUMN body SET DEFAULT '';
ALTER TABLE public.plan_comments ADD CONSTRAINT plan_comments_body_check CHECK (
  length(body) <= 1000 AND (length(btrim(body)) > 0 OR cardinality(photo_urls) > 0)
);
ALTER TABLE public.plan_comments DROP CONSTRAINT IF EXISTS plan_comments_photo_count;
ALTER TABLE public.plan_comments ADD CONSTRAINT plan_comments_photo_count CHECK (cardinality(photo_urls) <= 12);

-- Private bucket. Paths are "<event id>/<user id>/<file>".
INSERT INTO storage.buckets (id, name, public)
VALUES ('memories', 'memories', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "People at an event can see its photos" ON storage.objects;
CREATE POLICY "People at an event can see its photos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'memories' AND public.can_see_plan(((storage.foldername(name))[1])::uuid, NULL));

DROP POLICY IF EXISTS "People at an event can add their own photos" ON storage.objects;
CREATE POLICY "People at an event can add their own photos"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'memories'
    AND (storage.foldername(name))[2] = auth.uid()::text
    AND public.can_see_plan(((storage.foldername(name))[1])::uuid, NULL)
  );

DROP POLICY IF EXISTS "People can remove their own photos" ON storage.objects;
CREATE POLICY "People can remove their own photos"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'memories' AND (storage.foldername(name))[2] = auth.uid()::text);
