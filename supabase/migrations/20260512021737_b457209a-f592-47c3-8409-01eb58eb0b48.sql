
WITH banks(slug, name, town_key, hub, description) AS (VALUES
  ('anvilrest-bank',         'The Iron Strongbox',           'anvilrest',         'anvilrest-square',    'A windowless block of riveted plate sweating heat from the forges next door. The teller weighs every coin twice on a tiny brass scale.'),
  ('cider-hollow-bank',      'The Cellar Ledger',            'cider-hollow',      'cider-hollow-square', 'A cool stone cellar smelling of pressed apples and old vellum. A clerk in stained sleeves drags a quill down a long bound book.'),
  ('evershade-court-bank',   'The Vow Counting House',       'evershade-court',   'evershade-court',     'A hush like a shrine. Coin is weighed in silence, sealed in wax, and entered into a black-bound oath ledger by a veiled clerk.'),
  ('feastlands-keep-bank',   'The Granary Vault',            'feastlands-keep',   'feastlands-keep',     'Tall iron-banded chests line the walls of a converted granary. The teller, broad as a barrel, smells of bread and fresh ink.'),
  ('first-city-bank',        'The Seven-Sigil Counting House','first-city',        'first-city',          'A round hall floored in pale stone, the seven sigils inlaid in concentric circles. Veiled clerks behind brass grilles count without speaking.'),
  ('gilded-bazaar-bank',     'The Gilded Vault',             'gilded-bazaar',     'gilded-bazaar',       'Gold leaf, gold scales, gold-eyed cats curled on cushions. Three tellers work in unison; their abacuses click like rain.'),
  ('high-sanctum-bank',      'The Almsgiver''s Reckoning',   'high-sanctum',      'high-sanctum',        'A bright limewashed chamber where coin is treated as a kind of prayer. The teller asks your name softly before unlocking the box.'),
  ('iron-bastion-bank',      'The Iron Vault',               'iron-bastion',      'iron-bastion',        'A bunker of black-iron doors and oil-lamp shadow. Two soldiers stand at the entrance, halberds grounded, and pretend not to watch you.'),
  ('marginalia-bank',        'The Margin Ledger',            'marginalia',        'marginalia-square',   'A scribe''s den converted to a bank: every coin you deposit is annotated in a tiny hand in the margins of an enormous register.'),
  ('mirrorlands-court-bank', 'The Reflected Coffer',         'mirrorlands-court', 'mirrorlands-court',   'Mirrors line every wall so the room counts itself twice. The teller does not look up; their reflection takes your coin instead.'),
  ('quietshore-bank',        'The Glassrest Counting House', 'quietshore',        'quietshore-square',   'Glass beads dangle from the rafters, chiming faintly. The teller writes everything in a small, careful hand on water-marked paper.'),
  ('silent-horizon-bank',    'The Hush Vault',               'silent-horizon',    'silent-horizon',      'No one speaks. A clerk gestures: place coins on the felt, lift fingers when finished. The receipt is slid across in silence.'),
  ('sunken-well-bank',       'The Date-Coin House',          'sunken-well',       'sunken-well-square',  'A low mud-brick room cooled by a clay water-pot. The teller offers you a date before counting; refuse politely or accept — both are watched.'),
  ('thornwatch-bank',        'The Bramble Strongbox',        'thornwatch',        'thornwatch-square',   'An iron-strapped chest sunk into the floor of a guard-post. The watchwoman who keeps the keys also keeps a crossbow leant beside her stool.'),
  ('wolfmoot-bank',          'The Pelt Ledger',              'wolfmoot',          'wolfmoot-square',     'A timber lodge hung with worked pelts. Coin is stored in a hollowed bear-skull lockbox, and the teller swears it has never been robbed.')
)
INSERT INTO public.rooms (slug, name, description, ambience, exits, kind, label, town_key)
SELECT b.slug, b.name, b.description,
       'A teller works behind a polished counter. Quiet ledgers, soft lamplight.',
       jsonb_build_object('out', b.hub),
       'bank', 'Bank', b.town_key
FROM banks b
ON CONFLICT (slug) DO NOTHING;

UPDATE public.rooms r
   SET exits = r.exits || jsonb_build_object('bank', x.bank_slug)
  FROM (VALUES
    ('anvilrest-square',    'anvilrest-bank'),
    ('cider-hollow-square', 'cider-hollow-bank'),
    ('evershade-court',     'evershade-court-bank'),
    ('feastlands-keep',     'feastlands-keep-bank'),
    ('first-city',          'first-city-bank'),
    ('gilded-bazaar',       'gilded-bazaar-bank'),
    ('high-sanctum',        'high-sanctum-bank'),
    ('iron-bastion',        'iron-bastion-bank'),
    ('marginalia-square',   'marginalia-bank'),
    ('mirrorlands-court',   'mirrorlands-court-bank'),
    ('quietshore-square',   'quietshore-bank'),
    ('silent-horizon',      'silent-horizon-bank'),
    ('sunken-well-square',  'sunken-well-bank'),
    ('thornwatch-square',   'thornwatch-bank'),
    ('wolfmoot-square',     'wolfmoot-bank')
  ) AS x(hub_slug, bank_slug)
 WHERE r.slug = x.hub_slug;
