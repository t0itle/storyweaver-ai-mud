-- NPCs as agents, phase 1 ("bones"). See docs/npc-agents.md.
-- Logic lives in supabase/functions/_shared/npcMind.ts; these tables only hold each NPC's own state.
-- All four tables are written and read by edge functions with the service role only (RLS on, no policies).

-- Stable core identity. The AI may read it but never rewrites it.
CREATE TABLE IF NOT EXISTS public.npc_souls (
  npc_id     uuid PRIMARY KEY REFERENCES public.npcs(id) ON DELETE CASCADE,
  core       jsonb NOT NULL DEFAULT '{}'::jsonb,   -- {background, voice, traits{}, values[], fears[], desires[], secrets[]}
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Live, changing state that the code brain updates every tick.
CREATE TABLE IF NOT EXISTS public.npc_state (
  npc_id         uuid PRIMARY KEY REFERENCES public.npcs(id) ON DELETE CASCADE,
  tier           text NOT NULL DEFAULT 'dreaming' CHECK (tier IN ('agent', 'dreaming')),
  needs          jsonb NOT NULL DEFAULT '{"coin":70,"hunger":80,"rest":80,"safety":80,"belonging":70,"faith":70}'::jsonb,
  mood           text NOT NULL DEFAULT 'content',
  mood_intensity smallint NOT NULL DEFAULT 1,
  goals          jsonb NOT NULL DEFAULT '[]'::jsonb,  -- [{text, from, until}]
  wants          jsonb NOT NULL DEFAULT '[]'::jsonb,  -- [{need, text, since, posted_quest_id?, letter_to?}]
  current_action text,
  last_tick_at   timestamptz,
  next_think_at  timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS npc_state_due_idx ON public.npc_state (next_think_at);

-- The NPC's own memory stream: about players, other NPCs, places or itself.
CREATE TABLE IF NOT EXISTS public.npc_journal (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  npc_id       uuid NOT NULL REFERENCES public.npcs(id) ON DELETE CASCADE,
  created_at   timestamptz NOT NULL DEFAULT now(),
  kind         text NOT NULL CHECK (kind IN ('observation','conversation','deed','want','reflection','rumor','decree')),
  subject_kind text CHECK (subject_kind IN ('player','npc','place','self','aether')),
  subject_id   text,
  summary      text NOT NULL,
  emotion      text,
  importance   smallint NOT NULL DEFAULT 1 CHECK (importance BETWEEN 1 AND 5),
  disclosure   smallint NOT NULL DEFAULT 0 CHECK (disclosure BETWEEN 0 AND 3), -- 0 public .. 3 confidant
  source       text NOT NULL DEFAULT 'self',   -- 'self' | 'witnessed' | 'told_by:<npc_id>' | 'aether:<key>'
  room         text,
  expires_at   timestamptz
);
CREATE INDEX IF NOT EXISTS npc_journal_npc_idx ON public.npc_journal (npc_id, created_at DESC);

-- What an NPC thinks of another NPC (players stay in npc_amity for now).
CREATE TABLE IF NOT EXISTS public.npc_relations (
  npc_id     uuid NOT NULL REFERENCES public.npcs(id) ON DELETE CASCADE,
  other_kind text NOT NULL CHECK (other_kind IN ('npc','player','aether')),
  other_id   text NOT NULL,
  affinity   smallint NOT NULL DEFAULT 0 CHECK (affinity BETWEEN -100 AND 100),
  label      text,     -- 'friend' | 'rival' | 'kin' | 'debtor' | ...
  notes      text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (npc_id, other_kind, other_id)
);

ALTER TABLE public.npc_souls     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.npc_state     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.npc_journal   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.npc_relations ENABLE ROW LEVEL SECURITY;

-- Enrol the "bones" cohort as full agents: living, visible role NPCs.
-- Everyone else stays on the static schedule until a player engages them (npc-respond promotes them).
INSERT INTO public.npc_state (npc_id, tier)
SELECT id, 'agent' FROM public.npcs
WHERE NOT hidden AND NOT is_aether AND NOT is_soul AND NOT is_boss
  AND (is_merchant OR is_guildmaster OR is_warden OR is_bard OR is_fence OR is_guard)
ON CONFLICT (npc_id) DO NOTHING;
