CREATE TABLE public.player_artifact_rumors (
  user_id uuid NOT NULL,
  artifact_key text NOT NULL REFERENCES public.speaker_artifacts(key) ON DELETE CASCADE,
  snippet text NOT NULL DEFAULT '',
  source text NOT NULL DEFAULT 'rumor',
  heard_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, artifact_key)
);
ALTER TABLE public.player_artifact_rumors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own rumors readable" ON public.player_artifact_rumors
  FOR SELECT TO authenticated USING (auth.uid() = user_id);