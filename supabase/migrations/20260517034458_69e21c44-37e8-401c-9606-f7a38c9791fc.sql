
CREATE TABLE IF NOT EXISTS public.pending_resurrections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  original_npc_id uuid NOT NULL,
  original_name text NOT NULL,
  room text NOT NULL,
  resurrect_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  new_name text NOT NULL,
  new_title text,
  new_persona text,
  new_max_hp integer NOT NULL DEFAULT 360,
  new_damage_min integer NOT NULL DEFAULT 16,
  new_damage_max integer NOT NULL DEFAULT 32,
  new_boss_intro text,
  necromancer_name text NOT NULL DEFAULT 'Vhasric the Bone-Bidder',
  necromancer_title text NOT NULL DEFAULT 'pale stitcher of fallen lords',
  necromancer_persona text NOT NULL DEFAULT 'A gaunt figure in patched grey, hands stained with tomb-ash. His voice is calm, almost kind, but his eyes never blink.',
  necromancer_max_hp integer NOT NULL DEFAULT 80,
  necromancer_damage_min integer NOT NULL DEFAULT 6,
  necromancer_damage_max integer NOT NULL DEFAULT 12,
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);

ALTER TABLE public.pending_resurrections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pending resurrections readable" ON public.pending_resurrections FOR SELECT TO authenticated USING (true);

ALTER TABLE public.npcs ADD COLUMN IF NOT EXISTS sustained_by_npc_id uuid;
CREATE INDEX IF NOT EXISTS idx_npcs_sustained_by ON public.npcs(sustained_by_npc_id) WHERE sustained_by_npc_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pending_resurrections_due ON public.pending_resurrections(resurrect_at) WHERE status = 'pending';
