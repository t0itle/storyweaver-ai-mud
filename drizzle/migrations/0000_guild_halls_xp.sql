ALTER TABLE public.player_guild_membership ADD COLUMN IF NOT EXISTS guild_xp integer NOT NULL DEFAULT 0;
ALTER TABLE public.player_guild_membership ADD COLUMN IF NOT EXISTS left_at timestamptz;
ALTER TABLE public.rooms ADD COLUMN IF NOT EXISTS guild_hall_access text;
UPDATE public.player_guild_membership SET guild_xp = quests_completed * 50 WHERE guild_xp = 0;