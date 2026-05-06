INSERT INTO public.items (key, name, description, slot, weight, stackable, max_stack, base_damage, base_armor, rune_slots, capacity_weight, heal_amount, value)
VALUES ('tattered-cloak', 'tattered cloak', 'A dust-covered cloak of frayed cloth — the threadbare mantle every wanderer of the Crescent Kingdoms begins their road in.', 'body', 1.0, false, 1, 0, 1, 0, 0, 0, 0)
ON CONFLICT (key) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description, slot = EXCLUDED.slot, weight = EXCLUDED.weight, base_armor = EXCLUDED.base_armor;

-- Grant the tattered cloak (equipped) to any existing created players who don't already have one
INSERT INTO public.player_items (user_id, item_key, quantity, equipped_slot)
SELECT p.id, 'tattered-cloak', 1, 'body'
FROM public.profiles p
WHERE p.created = true
  AND NOT EXISTS (SELECT 1 FROM public.player_items pi WHERE pi.user_id = p.id AND pi.item_key = 'tattered-cloak');