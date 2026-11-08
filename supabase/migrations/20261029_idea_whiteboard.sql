-- Ideas as a shared whiteboard: notes anyone on the idea can edit, a season
-- it's best in, and when it last saw activity (and from whom), so Ideas can
-- sort by what's moving and mark what's new since you last looked.
--
-- Run once in the Supabase SQL Editor, after 20261024_people_profiles.sql.
-- Safe to run again.

ALTER TABLE public.ideas
  ADD COLUMN IF NOT EXISTS season TEXT CHECK (season IN ('spring', 'summer', 'fall', 'winter')),
  ADD COLUMN IF NOT EXISTS notes_edited_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS notes_edited_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS last_activity_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

-- Existing ideas: their latest comment, else when they were made.
UPDATE public.ideas i SET
  last_activity_at = COALESCE((SELECT MAX(created_at) FROM public.plan_comments c WHERE c.idea_id = i.id), i.created_at),
  last_activity_by = COALESCE((SELECT c.user_id FROM public.plan_comments c WHERE c.idea_id = i.id ORDER BY c.created_at DESC LIMIT 1), i.created_by)
WHERE i.last_activity_by IS NULL;

CREATE INDEX IF NOT EXISTS ideas_last_activity ON public.ideas (group_id, last_activity_at DESC);

-- The server keeps the stamps, so nobody's client has to remember to:
-- editing the notes says who and when; sharing a draft counts as activity.
CREATE OR REPLACE FUNCTION public.stamp_idea_activity()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.last_activity_at := NOW();
    NEW.last_activity_by := NEW.created_by;
    RETURN NEW;
  END IF;
  IF NEW.description IS DISTINCT FROM OLD.description THEN
    NEW.notes_edited_by := auth.uid();
    NEW.notes_edited_at := NOW();
    NEW.last_activity_at := NOW();
    NEW.last_activity_by := auth.uid();
  ELSIF OLD.status = 'draft' AND NEW.status <> 'draft' THEN
    NEW.last_activity_at := NOW();
    NEW.last_activity_by := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ideas_stamp_activity ON public.ideas;
CREATE TRIGGER ideas_stamp_activity
  BEFORE INSERT OR UPDATE ON public.ideas
  FOR EACH ROW EXECUTE FUNCTION public.stamp_idea_activity();

-- A suggestion on an idea moves it up too. Commenters may not be allowed to
-- update the idea itself (audience-only people), hence SECURITY DEFINER.
CREATE OR REPLACE FUNCTION public.bump_idea_on_comment()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.idea_id IS NOT NULL THEN
    UPDATE public.ideas SET last_activity_at = NEW.created_at, last_activity_by = NEW.user_id WHERE id = NEW.idea_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS plan_comments_bump_idea ON public.plan_comments;
CREATE TRIGGER plan_comments_bump_idea
  AFTER INSERT ON public.plan_comments
  FOR EACH ROW EXECUTE FUNCTION public.bump_idea_on_comment();
