
CREATE TABLE public.songs (
  key text PRIMARY KEY,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  vocal_part text NOT NULL DEFAULT 'instrumental',
  instrument_key text,
  music_prompt text NOT NULL,
  duration_seconds int NOT NULL DEFAULT 22,
  rarity text NOT NULL DEFAULT 'common',
  audio_url text,
  base_tip int NOT NULL DEFAULT 5,
  amity_gain int NOT NULL DEFAULT 1,
  merit_gain int NOT NULL DEFAULT 0,
  vendor_price int,
  scroll_item_key text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.songs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "songs readable" ON public.songs FOR SELECT TO authenticated USING (true);

CREATE TABLE public.player_songs (
  user_id uuid NOT NULL,
  song_key text NOT NULL REFERENCES public.songs(key) ON DELETE CASCADE,
  learned_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL DEFAULT 'unknown',
  PRIMARY KEY (user_id, song_key)
);
ALTER TABLE public.player_songs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own songs readable" ON public.player_songs FOR SELECT TO authenticated USING (auth.uid() = user_id);

ALTER TABLE public.npcs ADD COLUMN IF NOT EXISTS is_bard boolean NOT NULL DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS voice text NOT NULL DEFAULT 'female';

INSERT INTO storage.buckets (id, name, public) VALUES ('music','music',true) ON CONFLICT (id) DO NOTHING;

CREATE POLICY "music public read" ON storage.objects FOR SELECT USING (bucket_id = 'music');
