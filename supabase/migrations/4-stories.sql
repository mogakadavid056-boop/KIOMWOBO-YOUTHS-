-- Optional dedicated Stories tables (24-hour ephemeral stories + Facebook-style view tracking)
CREATE TABLE IF NOT EXISTS public.stories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  church_id uuid REFERENCES public.churches(id) ON DELETE SET NULL,
  media_url text,
  caption text DEFAULT '',
  bg_style text DEFAULT 'royal-purple',
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours')
);

CREATE TABLE IF NOT EXISTS public.story_views (
  story_id uuid NOT NULL REFERENCES public.stories(id) ON DELETE CASCADE,
  viewer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  viewed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (story_id, viewer_id)
);

ALTER TABLE public.stories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.story_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Stories are viewable by authenticated users"
  ON public.stories FOR SELECT
  TO authenticated
  USING (expires_at > now());

CREATE POLICY "Users can create their own stories"
  ON public.stories FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users and admins can delete stories"
  ON public.stories FOR DELETE
  TO authenticated
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role IN ('super_admin', 'district_admin', 'church_admin')
    )
  );

CREATE POLICY "Story views are readable by authenticated users"
  ON public.story_views FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can record story views"
  ON public.story_views FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = viewer_id);

CREATE POLICY "Authenticated users can update own story views"
  ON public.story_views FOR UPDATE
  TO authenticated
  USING (auth.uid() = viewer_id);
