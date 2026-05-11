UPDATE public.items SET slot='off_hand', base_armor=GREATEST(base_armor,2)
 WHERE key LIKE 'trade-%' AND slot='misc' AND name ~* '\m(shield|buckler|targe)\M';

UPDATE public.items SET slot='main_hand', base_damage=GREATEST(base_damage,4)
 WHERE key LIKE 'trade-%' AND slot='misc' AND name ~* '\m(greatsword|great sword|longsword|long.sword|warhammer|war hammer|battleaxe|battle.axe|halberd|glaive|polearm|maul|claymore|zweihander)\M';

UPDATE public.items SET slot='main_hand', base_damage=GREATEST(base_damage,2)
 WHERE key LIKE 'trade-%' AND slot='misc' AND name ~* '\m(dagger|knife|dirk|stiletto|hand.axe|handaxe|shortsword|short sword|short.sword)\M';

UPDATE public.items SET slot='main_hand', base_damage=GREATEST(base_damage,3)
 WHERE key LIKE 'trade-%' AND slot='misc' AND name ~* '\m(sword|blade|axe|mace|hammer|spear|club|staff|scimitar|rapier|sabre|saber|flail|morningstar|morning star|bow|crossbow|trident|whip|lance|pike)\M';

UPDATE public.items SET slot='body', base_armor=GREATEST(base_armor,3)
 WHERE key LIKE 'trade-%' AND slot='misc' AND name ~* '\m(plate|hauberk|cuirass|breastplate|mail|chainmail|chain mail)\M';

UPDATE public.items SET slot='body', base_armor=GREATEST(base_armor,2)
 WHERE key LIKE 'trade-%' AND slot='misc' AND name ~* '\m(armor|armour|robe|tunic|jerkin|vest|gambeson|surcoat|doublet|cloak|mantle)\M';

UPDATE public.items SET slot='head', base_armor=GREATEST(base_armor,1)
 WHERE key LIKE 'trade-%' AND slot='misc' AND name ~* '\m(helm|helmet|cap|hood|coif|circlet|crown|diadem)\M';

UPDATE public.items SET slot='feet', base_armor=GREATEST(base_armor,1)
 WHERE key LIKE 'trade-%' AND slot='misc' AND name ~* '\m(boot|boots|shoe|shoes|sandal|sandals|sabaton)\M';

UPDATE public.items SET slot='legs', base_armor=GREATEST(base_armor,1)
 WHERE key LIKE 'trade-%' AND slot='misc' AND name ~* '\m(greaves|leggings|trousers|pants|breeches|chausses)\M';

UPDATE public.items SET slot='neck'
 WHERE key LIKE 'trade-%' AND slot='misc' AND name ~* '\m(amulet|necklace|pendant|talisman|torc|locket)\M';

UPDATE public.items SET slot='ring'
 WHERE key LIKE 'trade-%' AND slot='misc' AND name ~* '\m(ring|signet|band)\M';

UPDATE public.items SET slot='focus'
 WHERE key LIKE 'trade-%' AND slot='misc' AND name ~* '\m(orb|wand|rod|tome|grimoire|focus|scepter|sceptre)\M';

UPDATE public.items SET slot='consumable', heal_amount=GREATEST(heal_amount,6)
 WHERE key LIKE 'trade-%' AND slot='misc' AND name ~* '\m(potion|elixir|draught|tonic|philter|philtre|cordial)\M';