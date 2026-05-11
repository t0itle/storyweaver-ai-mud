
-- Neck: chain/necklace/pendant/amulet/choker/torc
UPDATE public.items SET slot='neck', base_armor=GREATEST(base_armor,0)
WHERE slot='misc' AND key LIKE 'trade-%'
  AND (name ~* '\m(chain|necklace|pendant|amulet|choker|torc)\M');

-- Ring: ring/bracelet/bangle/cuff/band/signet
UPDATE public.items SET slot='ring', base_armor=GREATEST(base_armor,0)
WHERE slot='misc' AND key LIKE 'trade-%'
  AND (name ~* '\m(ring|bracelet|bangle|cuff|signet)\M');

-- Head: circlet/diadem/tiara/crown/coif/veil/hood/cap/hat/headband
UPDATE public.items SET slot='head', base_armor=1
WHERE slot='misc' AND key LIKE 'trade-%'
  AND (name ~* '\m(circlet|diadem|tiara|crown|coif|veil|hood|cap|hat|headband)\M');

-- Body: robe/cloak/mantle/cape/tunic/vest/gown/dress/coat/jerkin
UPDATE public.items SET slot='body', base_armor=2
WHERE slot='misc' AND key LIKE 'trade-%'
  AND (name ~* '\m(robe|cloak|mantle|cape|tunic|vest|gown|dress|coat|jerkin)\M');

-- Body (light): belt/girdle/sash/baldric
UPDATE public.items SET slot='body', base_armor=GREATEST(base_armor,1)
WHERE slot='misc' AND key LIKE 'trade-%'
  AND (name ~* '\m(belt|girdle|sash|baldric)\M');

-- Feet: boots/shoes/sandals/slippers
UPDATE public.items SET slot='feet', base_armor=1
WHERE slot='misc' AND key LIKE 'trade-%'
  AND (name ~* '\m(boots|shoes|sandals|slippers)\M');

-- Focus: orb/focus/relic-shard/idol/talisman/charm/fetish
UPDATE public.items SET slot='focus'
WHERE slot='misc' AND key LIKE 'trade-%'
  AND (name ~* '\m(orb|focus|talisman|charm|fetish|idol)\M');
