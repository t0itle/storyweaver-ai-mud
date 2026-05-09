
-- Guilds: warriors, traders, mages
CREATE TABLE public.guilds (
  key text PRIMARY KEY,
  name text NOT NULL,
  blurb text NOT NULL DEFAULT '',
  glyph text NOT NULL DEFAULT '✦',
  specialty text NOT NULL DEFAULT ''
);
ALTER TABLE public.guilds ENABLE ROW LEVEL SECURITY;
CREATE POLICY "guilds readable" ON public.guilds FOR SELECT TO authenticated USING (true);

-- A chapter = (guild, town). Hosts a guildmaster NPC and a city-flavored stock.
CREATE TABLE public.guild_chapters (
  guild_key text NOT NULL,
  town_key text NOT NULL,
  hall_room text NOT NULL,
  guildmaster_npc_id uuid,
  flavor_blurb text NOT NULL DEFAULT '',
  PRIMARY KEY (guild_key, town_key)
);
ALTER TABLE public.guild_chapters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "chapters readable" ON public.guild_chapters FOR SELECT TO authenticated USING (true);

-- City-flavored stock: runes to teach + items to sell, per chapter.
CREATE TABLE public.guild_stock (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_key text NOT NULL,
  town_key text NOT NULL,
  kind text NOT NULL, -- 'lesser_rune' | 'kanji_rune' | 'item'
  ref_key text NOT NULL,         -- rune key or item key
  price_gold integer NOT NULL DEFAULT 0,
  rank_required integer NOT NULL DEFAULT 0, -- 0..4 (Initiate..Grandmaster)
  blurb text NOT NULL DEFAULT ''
);
ALTER TABLE public.guild_stock ENABLE ROW LEVEL SECURITY;
CREATE POLICY "stock readable" ON public.guild_stock FOR SELECT TO authenticated USING (true);
CREATE INDEX guild_stock_chapter_idx ON public.guild_stock(guild_key, town_key);

-- Quest templates (city-flavored). Generated per ask via 'guild-action accept_quest'.
CREATE TABLE public.guild_quest_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_key text NOT NULL,
  town_key text NOT NULL,
  rank_required integer NOT NULL DEFAULT 0,
  title text NOT NULL,
  objective text NOT NULL,
  description text NOT NULL DEFAULT '',
  target_kind text NOT NULL DEFAULT 'visit',
  target_ref text,
  reward_gold integer NOT NULL DEFAULT 20,
  reward_xp integer NOT NULL DEFAULT 30,
  reward_item_key text,
  reward_rune_key text
);
ALTER TABLE public.guild_quest_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "guild quests readable" ON public.guild_quest_templates FOR SELECT TO authenticated USING (true);

-- Membership per (player, guild). Tracks rank by quest count + initiation.
CREATE TABLE public.player_guild_membership (
  user_id uuid NOT NULL,
  guild_key text NOT NULL,
  status text NOT NULL DEFAULT 'prospect', -- 'prospect'|'initiating'|'member'
  rank integer NOT NULL DEFAULT 0,         -- 0..4
  quests_completed integer NOT NULL DEFAULT 0,
  initiation_quest_id uuid,
  joined_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, guild_key)
);
ALTER TABLE public.player_guild_membership ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own membership readable" ON public.player_guild_membership
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- Mark guild quests on the existing quests table by source_guild
ALTER TABLE public.quests ADD COLUMN IF NOT EXISTS source_guild text;
ALTER TABLE public.quests ADD COLUMN IF NOT EXISTS source_guild_town text;
ALTER TABLE public.quests ADD COLUMN IF NOT EXISTS is_initiation boolean NOT NULL DEFAULT false;

-- Mark NPCs as guildmasters
ALTER TABLE public.npcs ADD COLUMN IF NOT EXISTS is_guildmaster boolean NOT NULL DEFAULT false;
ALTER TABLE public.npcs ADD COLUMN IF NOT EXISTS guild_key text;
ALTER TABLE public.npcs ADD COLUMN IF NOT EXISTS guild_town text;

-- Seed guilds
INSERT INTO public.guilds (key, name, blurb, glyph, specialty) VALUES
('warriors','Warriors'' Compact','A pact of arms — shields raised in every city under every banner.','⚔','arms+combat runes'),
('traders','Traders'' League','A web of weights and ledgers stitching the kingdoms together.','⚖','cargo+haggle'),
('mages','Mages'' Conclave','Silent rooms where strokes of language bend the world.','✶','runes+scrolls')
ON CONFLICT (key) DO NOTHING;
