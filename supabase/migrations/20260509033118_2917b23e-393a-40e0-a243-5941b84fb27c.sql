-- ─────────────────────────── towns ───────────────────────────
CREATE TABLE IF NOT EXISTS public.towns (
  key text PRIMARY KEY,
  name text NOT NULL,
  blurb text NOT NULL DEFAULT '',
  sort_order int NOT NULL DEFAULT 0
);
ALTER TABLE public.towns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "towns readable" ON public.towns FOR SELECT TO authenticated USING (true);

INSERT INTO public.towns (key, name, blurb, sort_order) VALUES
  ('first-city',         'The First City',         'The neutral shining city under the Veiled.',          0),
  ('high-sanctum',       'The High Sanctum',       'Capital of the Aether of Light.',                     1),
  ('iron-bastion',       'The Iron Bastion',       'Capital of the Aether of Forge.',                     2),
  ('mirrorlands-court',  'The Mirrorlands Court',  'Capital of the Aether of Mirror.',                    3),
  ('gilded-bazaar',      'The Gilded Bazaar',      'Capital of the Aether of Coin.',                      4),
  ('silent-horizon',     'The Silent Horizon',     'Capital of the Aether of Word.',                      5),
  ('evershade-court',    'The Evershade Court',    'Capital of the Aether of Mourning.',                  6),
  ('feastlands-keep',    'The Feastlands Keep',    'Capital of the Aether of Harvest.',                   7)
ON CONFLICT (key) DO NOTHING;

-- ─────────────────────── rooms.town_key ──────────────────────
ALTER TABLE public.rooms ADD COLUMN IF NOT EXISTS town_key text;
-- Backfill: tag each capital + its city gate as belonging to that town.
UPDATE public.rooms SET town_key = 'first-city'
  WHERE slug IN ('first-city','first-city-gate','grand-atrium-of-the-first-city');
UPDATE public.rooms SET town_key = 'high-sanctum'        WHERE slug IN ('high-sanctum','sanctum-gate');
UPDATE public.rooms SET town_key = 'iron-bastion'        WHERE slug IN ('iron-bastion','bastion-gate');
UPDATE public.rooms SET town_key = 'mirrorlands-court'   WHERE slug IN ('mirrorlands-court','mirror-gate');
UPDATE public.rooms SET town_key = 'gilded-bazaar'       WHERE slug IN ('gilded-bazaar','bazaar-gate');
UPDATE public.rooms SET town_key = 'silent-horizon'      WHERE slug IN ('silent-horizon','horizon-gate');
UPDATE public.rooms SET town_key = 'evershade-court'     WHERE slug IN ('evershade-court','vow-gate');
UPDATE public.rooms SET town_key = 'feastlands-keep'     WHERE slug IN ('feastlands-keep','keep-gate');
CREATE INDEX IF NOT EXISTS idx_rooms_town_key ON public.rooms(town_key) WHERE town_key IS NOT NULL;

-- ───────────────── player_town_rep ─────────────────
CREATE TABLE IF NOT EXISTS public.player_town_rep (
  user_id  uuid NOT NULL,
  town_key text NOT NULL REFERENCES public.towns(key) ON DELETE CASCADE,
  score    int  NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, town_key)
);
ALTER TABLE public.player_town_rep ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own town rep readable" ON public.player_town_rep
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- ─────────────── town_bank_accounts ───────────────
CREATE TABLE IF NOT EXISTS public.town_bank_accounts (
  user_id   uuid NOT NULL,
  town_key  text NOT NULL REFERENCES public.towns(key) ON DELETE CASCADE,
  balance   int  NOT NULL DEFAULT 0 CHECK (balance >= 0),
  opened_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, town_key)
);
ALTER TABLE public.town_bank_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own bank readable" ON public.town_bank_accounts
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- ─────────────────── posted_quests ───────────────────
CREATE TABLE IF NOT EXISTS public.posted_quests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  town_key text NOT NULL REFERENCES public.towns(key) ON DELETE CASCADE,
  author_user_id uuid,                 -- null = NPC / town-posted
  author_name text NOT NULL,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  objective text NOT NULL DEFAULT '',
  target_kind text NOT NULL DEFAULT 'visit',  -- visit | slay-named | slay-npc
  target_ref text,
  reward_gold int NOT NULL DEFAULT 0 CHECK (reward_gold >= 0),
  reward_xp   int NOT NULL DEFAULT 0 CHECK (reward_xp >= 0),
  status text NOT NULL DEFAULT 'open',  -- open | claimed | complete | expired
  claimed_by uuid,
  claimed_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (status IN ('open','claimed','complete','expired'))
);
ALTER TABLE public.posted_quests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "posted quests readable" ON public.posted_quests
  FOR SELECT TO authenticated USING (true);
CREATE INDEX IF NOT EXISTS idx_pq_town_status ON public.posted_quests(town_key, status);

-- ───────────────────── bounties ─────────────────────
CREATE TABLE IF NOT EXISTS public.bounties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  town_key text NOT NULL REFERENCES public.towns(key) ON DELETE CASCADE,
  posted_by uuid,                       -- null = auto / town-posted
  posted_by_name text NOT NULL,
  target_user_id uuid NOT NULL,
  target_name text NOT NULL,
  reason text NOT NULL DEFAULT '',
  reward_gold int NOT NULL DEFAULT 50 CHECK (reward_gold >= 0),
  alive_bonus_gold int NOT NULL DEFAULT 50 CHECK (alive_bonus_gold >= 0),
  status text NOT NULL DEFAULT 'open',  -- open | claimed | cancelled | expired
  claimed_by uuid,
  claim_kind text,                      -- 'dead' | 'alive'
  claimed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (status IN ('open','claimed','cancelled','expired'))
);
ALTER TABLE public.bounties ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bounties readable" ON public.bounties
  FOR SELECT TO authenticated USING (true);
CREATE INDEX IF NOT EXISTS idx_bounty_target_status ON public.bounties(target_user_id, status);
CREATE INDEX IF NOT EXISTS idx_bounty_town_status   ON public.bounties(town_key, status);

-- ─────────── auto-bounty trigger on world_events.npc_killed ───────────
CREATE OR REPLACE FUNCTION public.maybe_post_auto_bounty()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  npc_town text;
  recent_kills int;
  killer_name text;
  town_name text;
BEGIN
  IF NEW.kind <> 'npc_killed' OR NEW.actor_id IS NULL OR NEW.target_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT r.town_key INTO npc_town
    FROM public.npcs n
    JOIN public.rooms r ON r.slug = n.home_room
   WHERE n.id = NEW.target_id;

  IF npc_town IS NULL THEN RETURN NEW; END IF;

  -- count this player's town-NPC kills in the last 7 days
  SELECT count(*) INTO recent_kills
    FROM public.world_events we
    JOIN public.npcs n   ON n.id = we.target_id
    JOIN public.rooms r2 ON r2.slug = n.home_room
   WHERE we.kind = 'npc_killed'
     AND we.actor_id = NEW.actor_id
     AND r2.town_key = npc_town
     AND we.created_at >= now() - interval '7 days';

  -- knock town rep regardless of bounty status
  INSERT INTO public.player_town_rep (user_id, town_key, score, updated_at)
       VALUES (NEW.actor_id, npc_town, -10, now())
  ON CONFLICT (user_id, town_key) DO UPDATE
       SET score = public.player_town_rep.score - 10,
           updated_at = now();

  IF recent_kills < 3 THEN RETURN NEW; END IF;

  -- skip if there's already an open bounty by this town on this player
  IF EXISTS (SELECT 1 FROM public.bounties
              WHERE target_user_id = NEW.actor_id
                AND town_key = npc_town
                AND status = 'open'
                AND posted_by IS NULL) THEN
    RETURN NEW;
  END IF;

  SELECT username INTO killer_name FROM public.profiles WHERE id = NEW.actor_id;
  SELECT name     INTO town_name   FROM public.towns    WHERE key = npc_town;

  INSERT INTO public.bounties (
    town_key, posted_by, posted_by_name,
    target_user_id, target_name,
    reason, reward_gold, alive_bonus_gold
  ) VALUES (
    npc_town, NULL, town_name,
    NEW.actor_id, COALESCE(killer_name, 'A drifter'),
    'For repeated killings of folk under our protection.',
    100, 100
  );

  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS trg_auto_bounty ON public.world_events;
CREATE TRIGGER trg_auto_bounty
AFTER INSERT ON public.world_events
FOR EACH ROW EXECUTE FUNCTION public.maybe_post_auto_bounty();