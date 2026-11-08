-- Profile photos from your camera roll. Public bucket (a profile picture is
-- shown to everyone you plan with, and links never expire), but only you can
-- add, replace or remove the files in your own folder: "<user id>/<file>".
-- The link is saved in profiles.avatar_url. Sheep avatars need none of this:
-- they're saved there as "sheep:<id>".
--
-- Run once in the Supabase SQL Editor. Safe to run again.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('avatars', 'avatars', true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic'])
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "You add your own profile photo" ON storage.objects;
CREATE POLICY "You add your own profile photo"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "You replace your own profile photo" ON storage.objects;
CREATE POLICY "You replace your own profile photo"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "You remove your own profile photo" ON storage.objects;
CREATE POLICY "You remove your own profile photo"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
