-- Make Khessareth a true party-tier boss + add a boss-aggro flag.
ALTER TABLE public.npcs ADD COLUMN IF NOT EXISTS aggro_on_sight boolean NOT NULL DEFAULT false;

UPDATE public.npcs
   SET combat_max_hp     = 720,
       combat_damage_min = 22,
       combat_damage_max = 44,
       str = 22, dex = 14, con = 22, level = 18, base_armor = 8,
       boss_reward_gold  = 12000,
       boss_reward_xp    = 9000,
       boss_reward_merit = 400,
       aggro_on_sight    = true,
       boss_intro = COALESCE(boss_intro,
         'Khessareth the Hour-Eater uncoils across her hoard, eyes like burning coins fixing upon the intruder. The air thickens with smoke and centuries.')
 WHERE name = 'Khessareth';

-- Any future risen bone-dragon should also aggro on sight.
UPDATE public.npcs SET aggro_on_sight = true
 WHERE is_boss = true AND name ILIKE '%bone%' AND name ILIKE '%dragon%';