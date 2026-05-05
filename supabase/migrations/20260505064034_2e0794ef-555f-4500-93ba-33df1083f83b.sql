
CREATE TABLE public.lore_entries (
  slug TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  source_url TEXT NOT NULL,
  summary TEXT,
  content TEXT NOT NULL,
  keywords TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.lore_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lore readable" ON public.lore_entries FOR SELECT TO authenticated USING (true);

CREATE TABLE public.player_lore_discoveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  lore_slug TEXT NOT NULL REFERENCES public.lore_entries(slug) ON DELETE CASCADE,
  source TEXT NOT NULL DEFAULT 'unknown',
  discovered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, lore_slug)
);
ALTER TABLE public.player_lore_discoveries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own discoveries readable" ON public.player_lore_discoveries
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own discoveries insertable" ON public.player_lore_discoveries
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_discoveries_user ON public.player_lore_discoveries(user_id);

-- Seed Solastin
INSERT INTO public.lore_entries (slug, title, source_url, summary, content, keywords) VALUES (
  'solastin',
  'Solastin, the Radiant Aether',
  'https://worldforge-collective.lovable.app/',
  'One of The Seven Aethers — embodiment of radiant truth and unyielding justice.',
  E'Solastin embodies radiant truth and unyielding justice. Born from the primordial light that pierced the initial void, Solastin is the eternal sentinel against deception, corruption, and the subtle creeping darkness of Chaos. Their essence is clarity, their will, unwavering law.\n\nDOMAIN — Solastin presides over the revelation of truth. Called upon in oaths, sought for guidance in clouded times, revered as the ultimate arbiter of cosmic balance.\n\nAPPEARANCE — An incandescent figure, a living sunbeam woven from pure golden light, without flesh or bone. Their presence brings warmth and pierces shadows.\n\nTHE BEACON AND THE BLADE — The Beacon: a pervasive spiritual light that seeks out falsehoods. The Blade: a cutting truth that excises corruption and brings swift, decisive justice.\n\nINFLUENCE — Cultures dedicated to Solastin prioritize order, transparency, and logical deduction. Their architecture features towering spires and reflective surfaces. Paladins and inquisitors draw conviction from Solastin''s radiant will.',
  ARRAY['solastin','aether','aethers','seven aethers','beacon','blade','radiant','justice','truth','light']
);
