-- Clearing notifications: anyone can delete their own from Activity (one at
-- a time, or Clear All). Nobody else's.
--
-- Run once in the Supabase SQL Editor. Safe to run again.

DROP POLICY IF EXISTS "Users can clear their own notifications" ON public.notifications;
CREATE POLICY "Users can clear their own notifications"
  ON public.notifications FOR DELETE USING (auth.uid() = user_id);
