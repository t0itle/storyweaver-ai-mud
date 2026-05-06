
-- =========================================================
-- HELPER: idempotent room insert
-- =========================================================

-- =========================================================
-- 1. NEW SUB-ROOMS PER CITY (out -> capital)
-- =========================================================

INSERT INTO public.rooms (slug, name, kind, label, description, ambience, exits) VALUES
-- FIRST CITY (ring around first-city-gate)
('veiled-cloister','The Veiled Cloister','temple','Cloister','A low colonnade of mouth-bound priests, prayer cloths fluttering. They nod to every traveler.','soft footfall, breathing through linen','{"out":"first-city-gate"}'),
('pilgrim-steps','The Pilgrim Steps','square','Steps','Wide weathered steps where new arrivals catch their breath and look back at the desert.','wind, distant bells','{"out":"first-city-gate"}'),
('lantern-bridge','The Lantern Bridge','bridge','Bridge','A narrow span hung with hundreds of paper lanterns, one for each name lost on the road.','creak of rope, paper rustle','{"out":"first-city-gate"}'),
('sigil-smithy','The Sigil Smithy','hall','Smithy','Seven anvils, one per Aether, all cold but for the Veiled smith who works without speaking.','hammer-tap, charcoal hiss','{"out":"first-city-gate"}'),
('refugee-tier','The Refugee Tier','square','Tier','Tents and lean-tos cluster along the inner wall. A free meal is poured from a black pot.','cooking smoke, crying child','{"out":"first-city-gate"}'),
('breadline','The Breadline','market','Line','A line that never ends — the Veiled hand out flatbread to anyone who asks.','flour dust, low murmur','{"out":"first-city-gate"}'),
('underbazaar','The Underbazaar','market','Underbazaar','A subterranean market lit by oil lamps. Stalls sell things the upper city pretends not to want.','copper smell, whispered haggling','{"out":"first-city-gate"}'),
('cistern-walk','The Cistern Walk','road','Walk','A flagstone path above the city cisterns. Water echoes far below.','dripping, cold air','{"out":"first-city-gate"}'),
('bell-tower-of-seven','The Bell-Tower of Seven','tower','Tower','Seven bells hang in a single frame. Only the Veiled know which to ring and when.','low resonant hum','{"out":"first-city-gate"}'),
('hospice-of-the-mute','The Hospice of the Mute','hall','Hospice','Pallets in long rows. The Veiled tend the silent dying.','soft cloth, slow breath','{"out":"first-city-gate"}'),
('chapel-of-the-unspoken','The Chapel of the Unspoken','temple','Chapel','A round room with no altar — only a circle of stones and a single empty mouth carved into the floor.','utter quiet','{"out":"first-city-gate"}'),
('foreigners-tier','The Foreigners'' Tier','square','Tier','Banners of distant places hang faded. Travelers from far roads share fires here.','foreign tongues, cookfire','{"out":"first-city-gate"}'),
('watchwall-north','The Northern Watchwall','tower','Wall','A long crenellated wall facing the wilderness. Veiled archers stand still as statues.','wind over stone','{"out":"first-city-gate"}'),
('watchwall-south','The Southern Watchwall','tower','Wall','The wall facing the desert. Sand piles at the foot of every embrasure.','grit-laden wind','{"out":"first-city-gate"}'),
('dock-of-lost-names','The Dock of Lost Names','dock','Dock','A wooden dock on the inner reservoir. Names are scratched into every plank.','lapping water','{"out":"first-city-gate"}'),

-- HIGH SANCTUM (Solastin / Light)
('penitents-stair','The Penitents'' Stair','road','Stair','A long stone stair worn smooth by knees. Confessions are whispered to each step.','sandstone scrape, low weeping','{"out":"high-sanctum"}'),
('hall-of-lit-names','The Hall of Lit Names','hall','Hall','Thousands of small candles, each labeled. Acolytes relight the ones that gutter.','wax, beeswax smoke','{"out":"high-sanctum"}'),
('reliquary-of-suns','The Reliquary of Suns','crypt','Reliquary','Glass cases hold sun-shaped relics — a tooth, a coin, a child''s drawing.','dust motes in shafts of gold','{"out":"high-sanctum"}'),
('tribunal-antechamber','The Tribunal Antechamber','hall','Antechamber','A bench against a marble wall where the accused wait their turn.','silence with breathing','{"out":"high-sanctum"}'),
('gilded-choir','The Gilded Choir','temple','Choir','A vault of gold leaf where boys'' voices spiral into the dome at dawn.','soft echo','{"out":"high-sanctum"}'),
('solar-forge','The Solar Forge','hall','Forge','A burning lens focuses the sun into a forge that needs no coal.','hot metal, ozone','{"out":"high-sanctum"}'),
('confessors-cell','The Confessor''s Cell','room','Cell','A booth with a wooden lattice. Behind it, a bored Veiled scribe takes notes.','wood creak','{"out":"high-sanctum"}'),
('pyre-court','The Pyre Court','square','Court','A round flagstone court with seven scorch marks. Heretics burn here. Rarely.','old smoke','{"out":"high-sanctum"}'),
('almsgate','The Almsgate','gate','Gate','A small gate where bread and coin are passed out at midday.','crowd murmur','{"out":"high-sanctum"}'),
('reading-loft','The Reading Loft','room','Loft','Cushioned benches under skylights. The light is always perfect.','page-turning','{"out":"high-sanctum"}'),
('mirror-walk','The Mirror Walk','hall','Walk','A corridor of polished bronze. You see yourself as you would prefer to be.','metallic hush','{"out":"high-sanctum"}'),
('acolyte-dorms','The Acolyte Dormitories','room','Dorms','Long lines of narrow beds, white linen, no possessions.','sleep-breathing','{"out":"high-sanctum"}'),
('scribes-tier','The Scribes'' Tier','hall','Tier','Stone desks built into the wall. Ink-stained fingers everywhere.','pen-scratch','{"out":"high-sanctum"}'),
('censer-garden','The Censer Garden','garden','Garden','Hanging brass censers smoke between potted lemon trees.','citrus and frankincense','{"out":"high-sanctum"}'),

-- IRON BASTION (Khalvaris / Justice)
('the-gauntlet','The Gauntlet','square','Yard','A circle of black sand where new wardens prove they can stand.','grunting, blade-clack','{"out":"iron-bastion"}'),
('slag-pits','The Slag Pits','cave','Pits','Open-air pits where bad iron is melted down and bad wardens sometimes vanish.','heat shimmer, hiss','{"out":"iron-bastion"}'),
('verdict-steps','The Verdict Steps','square','Steps','Seven black steps where sentences are spoken aloud.','crowd silence','{"out":"iron-bastion"}'),
('drillyard','The Drillyard','square','Yard','Boots stamping in unison from before dawn until after dusk.','synchronized stamp','{"out":"iron-bastion"}'),
('black-anvil','The Black Anvil','hall','Anvil','A single anvil on a dais. Vows are sworn over it; weapons are quenched in the same trough.','hammer ring','{"out":"iron-bastion"}'),
('iron-library','The Iron Library','hall','Library','Law books bound in scaled hide. Every page-edge is razor-sharp.','metal page-clink','{"out":"iron-bastion"}'),
('wardens-mess','The Wardens'' Mess','tavern','Mess','Long benches, plain bread, dark beer. Few jokes.','spoon on tin','{"out":"iron-bastion"}'),
('quenching-pool','The Quenching Pool','garden','Pool','A black pool of oil for cooling blades. No one swims here twice.','oil-quiet','{"out":"iron-bastion"}'),
('banner-hall','The Banner Hall','hall','Hall','Battered banners from every campaign hang from rafters; some are barely cloth.','soft creak of poles','{"out":"iron-bastion"}'),
('dueling-pit','The Dueling Pit','square','Pit','A round sand pit with no railing. Disputes end here, sometimes badly.','wager murmur','{"out":"iron-bastion"}'),
('helm-walk','The Helm Walk','hall','Walk','A corridor lined with the helms of fallen wardens. Each is named.','metal echo','{"out":"iron-bastion"}'),
('foundry-stair','The Foundry Stair','road','Stair','A black-iron staircase descending toward the magma-forge below.','heat-thump','{"out":"iron-bastion"}'),
('smoke-roost','The Smoke Roost','tower','Roost','A high platform where signal-smoke is set. The view is brutal and clear.','wind, ash','{"out":"iron-bastion"}'),
('veterans-tier','The Veterans'' Tier','square','Tier','Old wardens drink in the sun. Most are missing something.','low laughter, cane-tap','{"out":"iron-bastion"}'),

-- MIRRORLANDS COURT (Nyxara / Identity)
('hall-of-worn-faces','The Hall of Worn Faces','hall','Hall','Plaster masks line every wall — each labeled with a name no longer in use.','soft breath','{"out":"mirrorlands-court"}'),
('two-names-court','The Two-Names Court','square','Court','Where citizens come to legally trade one name for another.','quiet murmur','{"out":"mirrorlands-court"}'),
('veil-atelier','The Veil Atelier','hall','Atelier','A workshop where masks and veils are stitched. Some look back when you do.','silk-rasp','{"out":"mirrorlands-court"}'),
('whisper-maze','The Whisper Maze','room','Maze','Mirrored corridors where you hear yourself speak before you do.','echo of self','{"out":"mirrorlands-court"}'),
('pool-of-other-lives','The Pool of Other Lives','shore','Pool','A still pool. Look in, and see what you almost were.','perfect quiet','{"out":"mirrorlands-court"}'),
('wax-theatre','The Wax Theatre','hall','Theatre','Wax players stand mid-scene. They never finish the act.','stale candlewax','{"out":"mirrorlands-court"}'),
('naming-garden','The Naming Garden','garden','Garden','Saplings planted at every birth, each labeled in a child''s hand.','leaf-rustle','{"out":"mirrorlands-court"}'),
('lost-self-cells','The Lost-Self Cells','room','Cells','Where citizens go to forget for a season. They leave with new manners.','muffled humming','{"out":"mirrorlands-court"}'),
('quiet-mirror','The Quiet Mirror','hall','Mirror','A single mirror the size of a wall. It refuses some viewers.','dead silence','{"out":"mirrorlands-court"}'),
('borrowed-wardrobe','The Borrowed Wardrobe','hall','Wardrobe','Racks of other people''s clothing. You may try anything on; you may not always take it off.','fabric whisper','{"out":"mirrorlands-court"}'),
('reflection-stair','The Reflection Stair','road','Stair','Glass steps that show you a step behind, a step ahead.','glass-tap','{"out":"mirrorlands-court"}'),
('mask-vault','The Mask Vault','crypt','Vault','Locked cabinets of masks that ought never to be worn again.','lock-creak','{"out":"mirrorlands-court"}'),
('tutors-loft','The Tutors'' Loft','room','Loft','Where new identities are coached: posture, vocabulary, laugh.','soft instruction','{"out":"mirrorlands-court"}'),
('empty-frame','The Empty Frame','hall','Frame','A gilded frame on a plain wall. Some swear they have stepped through.','utter still','{"out":"mirrorlands-court"}'),

-- GILDED BAZAAR (Thalvora / Wealth)
('bonded-vaults','The Bonded Vaults','crypt','Vaults','Iron-bound chambers where citizens deposit a year of their lives in coin.','lock tumbler-click','{"out":"gilded-bazaar"}'),
('tithe-steps','The Tithe Steps','square','Steps','Where every visitor pays one coin to enter the inner bazaar.','coin-clink','{"out":"gilded-bazaar"}'),
('debt-pen','The Debtors'' Pen','square','Pen','A wooden enclosure where the truly broke wait to be bought out.','low shame, sniffling','{"out":"gilded-bazaar"}'),
('auction-tier','The Auction Tier','square','Tier','Tiered benches around a small stone block. Today: spices. Tomorrow: maybe people.','gavel rap, applause','{"out":"gilded-bazaar"}'),
('coin-press','The Coin-Press','hall','Press','A great brass press strikes the city''s mark on rough metal slugs.','press-thump','{"out":"gilded-bazaar"}'),
('spice-row','The Spice Row','market','Row','A laneway of saffron, sumac, and powders that have no name in any language you know.','warm spice cloud','{"out":"gilded-bazaar"}'),
('caravan-yard','The Caravan Yard','square','Yard','Camels and ash-mules wait while their owners haggle for the next leg.','dung, leather','{"out":"gilded-bazaar"}'),
('beggars-stair','The Beggars'' Stair','road','Stair','A wide stair where the poor catch what falls from richer hands.','shuffle, low pleading','{"out":"gilded-bazaar"}'),
('ledger-hall','The Ledger Hall','hall','Hall','Floor to ceiling books of every transaction. Clerks never look up.','pen-scratch, page-flip','{"out":"gilded-bazaar"}'),
('pawn-crypt','The Pawn Crypt','crypt','Crypt','Where unredeemed pledges go: rings, lockets, a single child''s shoe.','dust, sad gold','{"out":"gilded-bazaar"}'),
('silver-garden','The Silver Garden','garden','Garden','Trees with leaves that ring like small coins in the wind.','metallic chime','{"out":"gilded-bazaar"}'),
('brokers-loft','The Brokers'' Loft','room','Loft','A discreet upper room where contracts thicker than your arm are signed.','wax-seal hiss','{"out":"gilded-bazaar"}'),
('smugglers-cellar','The Smugglers'' Cellar','crypt','Cellar','A stone cellar that the city pretends does not exist. The Vealed politely look away.','musk, low laughter','{"out":"gilded-bazaar"}'),
('customs-walk','The Customs Walk','road','Walk','Where bags are opened and most things waved through, for a price.','crate-thunk','{"out":"gilded-bazaar"}'),

-- SILENT HORIZON (Lazareth / Knowledge)
('folio-stacks','The Folio Stacks','tower','Stacks','Tall narrow shelves on a sliding ladder. Most folios have not been opened in a hundred years.','leather, dust, slow ladder-creak','{"out":"silent-horizon"}'),
('glyph-hall','The Glyph Hall','hall','Hall','A long hall whose walls record glyphs from every dead language.','stone-hush','{"out":"silent-horizon"}'),
('translators-cells','The Translators'' Cells','room','Cells','Identical small rooms where scholars argue with the dead.','muttered debate','{"out":"silent-horizon"}'),
('hush-stair','The Hush Stair','road','Stair','A stair so steep that conversation gives out before the top.','your own breath','{"out":"silent-horizon"}'),
('map-vault','The Map Vault','crypt','Vault','Maps of places that were and places that never were.','parchment crackle','{"out":"silent-horizon"}'),
('telescope-walk','The Telescope Walk','tower','Walk','Brass instruments aimed at things very far away — and a few very near.','gear-tick','{"out":"silent-horizon"}'),
('forbidden-tier','The Forbidden Tier','hall','Tier','A locked floor. The librarians pretend it does not exist; some still go up.','iron-key turn','{"out":"silent-horizon"}'),
('long-beds','The Long-Beds of Sleep','hall','Beds','Cots where scholars sleep through whole seasons to think more clearly.','slow even breathing','{"out":"silent-horizon"}'),
('indexers-hall','The Indexers'' Hall','hall','Hall','Card catalogs in their thousands. A misfile here loses a book for a generation.','card-flick','{"out":"silent-horizon"}'),
('annex-of-errors','The Annex of Errors','crypt','Annex','Books that are wrong on purpose, kept for instruction.','pulp must','{"out":"silent-horizon"}'),
('drowsy-garden','The Drowsy Garden','garden','Garden','Slow-blooming poppies. Most readers nap here at midday and dream of the index.','warm stillness','{"out":"silent-horizon"}'),
('ink-dark-pool','The Ink-Dark Pool','shore','Pool','A black reflecting pool. Some scholars dip their pens directly in.','soft drip','{"out":"silent-horizon"}'),
('apprentices-loft','The Apprentices'' Loft','room','Loft','A high room of low desks. Yawning is forbidden.','quill, sigh','{"out":"silent-horizon"}'),
('footnote-crypt','The Footnote Crypt','crypt','Crypt','Where overruled citations go to die. The shelves go on past where the lamps reach.','distant page-turn','{"out":"silent-horizon"}'),

-- EVERSHADE COURT (Velithria / Devotion)
('vow-walk','The Vow Walk','road','Walk','A colonnade where promises are made aloud and bound with a thread.','silk-tear','{"out":"evershade-court"}'),
('veil-garden','The Veil Garden','garden','Garden','Roses behind muslin. Couples walk slowly here, not touching.','rose, soft footfall','{"out":"evershade-court"}'),
('mourners-tier','The Mourners'' Tier','square','Tier','Black benches arranged so no one need see anyone else weep.','contained sob','{"out":"evershade-court"}'),
('singers-hollow','The Singers'' Hollow','room','Hollow','A round room where a single voice can be heard everywhere.','one held note','{"out":"evershade-court"}'),
('chamber-of-one-name','The Chamber of One Name','crypt','Chamber','A bare room where you may speak only one name and no other.','breathing','{"out":"evershade-court"}'),
('memory-pool','The Memory Pool','shore','Pool','Toss a coin and remember someone who is gone.','small splash','{"out":"evershade-court"}'),
('kept-promises-hall','The Kept Promises Hall','hall','Hall','Threads of every kept vow hang from the rafters in great soft drifts.','silk shimmer','{"out":"evershade-court"}'),
('locket-vault','The Locket Vault','crypt','Vault','Lockets bequeathed by the dead, none yet opened.','metal-tick','{"out":"evershade-court"}'),
('bridal-loft','The Bridal Loft','room','Loft','Where a single garment is kept, worn by whoever has the courage that season.','linen breath','{"out":"evershade-court"}'),
('tear-glass-window','The Tear-Glass Window','tower','Window','A stained glass window made from set tears. The colors are wrong and beautiful.','colored hush','{"out":"evershade-court"}'),
('confessional-booths','The Confessional Booths','room','Booths','Carved wood. The lattice is so close it ought to be improper.','wood scent','{"out":"evershade-court"}'),
('empty-bed','The Empty Bed','room','Room','A made bed in a small room. The pillow holds a single pressed flower.','still air','{"out":"evershade-court"}'),
('ribbon-crypt','The Ribbon Crypt','crypt','Crypt','Coffins wrapped in colored ribbon, each color a vow kept till death.','silk drag','{"out":"evershade-court"}'),
('candle-spire','The Candle Spire','tower','Spire','A pillar of half-burned candles set against the inner wall.','wax drip','{"out":"evershade-court"}'),

-- FEASTLANDS KEEP (Morvayne / Plenty)
('long-tables','The Long Tables','tavern','Hall','Tables that go on for a hundred paces. Anyone may sit. Anyone must give thanks.','low feast-roar','{"out":"feastlands-keep"}'),
('spit-yard','The Spit-Yard','square','Yard','A row of fires under turning carcasses. The smoke is the city''s perfume.','dripping fat, woodsmoke','{"out":"feastlands-keep"}'),
('brewing-cellar','The Brewing Cellar','crypt','Cellar','Casks the size of small houses. The brewmaster wears no shoes.','yeast, malt','{"out":"feastlands-keep"}'),
('cull-pens','The Cull Pens','square','Pens','Where animals wait their turn. The keepers thank each one by name.','low animal sound','{"out":"feastlands-keep"}'),
('granary-stair','The Granary Stair','road','Stair','A stair up the side of a tower of grain. Mice abound. So do cats.','grain-shift','{"out":"feastlands-keep"}'),
('honey-loft','The Honey Loft','room','Loft','Hives in clay cylinders. Bees pass over the city like moving punctuation.','low hum','{"out":"feastlands-keep"}'),
('smokehouse-row','The Smokehouse Row','market','Row','Hams and fish hang in dim sheds, each shed a different fragrant wood.','hickory, fish','{"out":"feastlands-keep"}'),
('salt-vault','The Salt Vault','crypt','Vault','A pillared chamber of grey salt. Taste the wall and you''ll see.','grit-dry','{"out":"feastlands-keep"}'),
('bone-soup-kitchen','The Bone-Soup Kitchen','tavern','Kitchen','A cauldron the size of a cart, never empty, never washed.','rich broth','{"out":"feastlands-keep"}'),
('vine-garden','The Vine Garden','garden','Garden','Trellises of grape and hop, low and easy to walk through.','leaf-shade','{"out":"feastlands-keep"}'),
('fat-furnace','The Fat Furnace','hall','Furnace','Where rendered fat is stored in great copper jars.','tallow-warm','{"out":"feastlands-keep"}'),
('drunkards-tier','The Drunkards'' Tier','square','Tier','Cushions and low tables. People here have not stood up in three days. They are happy.','low laughter, snoring','{"out":"feastlands-keep"}'),
('hunting-lodge','The Hunting Lodge','hall','Lodge','Antlers everywhere. Maps of the surrounding wilds, marked in red.','leather, woodsmoke','{"out":"feastlands-keep"}'),
('famine-door','The Famine Door','room','Door','A black door always kept locked. Behind it: nothing. They keep it locked anyway.','still cold','{"out":"feastlands-keep"}')
ON CONFLICT (slug) DO NOTHING;

-- =========================================================
-- 2. ROAD CORRIDORS BETWEEN GATE AND CAPITALS
--    pattern: gate -[direction]-> roadA <-> roadB <-> capital
-- =========================================================

INSERT INTO public.rooms (slug, name, kind, label, description, ambience, exits) VALUES
-- to High Sanctum (sanctum:)
('pilgrim-causeway','The Pilgrim Causeway','road','Causeway','A raised stone causeway lined with prayer-flags. Pilgrims walk it on their knees during Light-tide.','wind-snap of cloth','{"in":"solar-foothills","out":"first-city-gate"}'),
('solar-foothills','The Solar Foothills','road','Foothills','Yellow grass and blackened olive trees climb gently toward the white walls of the Sanctum.','dry grass-hiss','{"in":"high-sanctum","out":"pilgrim-causeway"}'),
-- to Iron Bastion (bastion:)
('ironroad','The Ironroad','road','Road','A black flagstone road, perfectly straight. Warden patrols pass without looking at you.','boot-step in unison','{"in":"slag-flats","out":"first-city-gate"}'),
('slag-flats','The Slag Flats','road','Flats','A waste of cooled slag and rusted blade-shards. The Bastion''s smoke-plume sits above it all.','wind through metal','{"in":"iron-bastion","out":"ironroad"}'),
-- to Mirrorlands Court (mirrorhall:)
('mirror-pass','The Mirror Pass','road','Pass','A narrow defile lined with shards of bronze mirror set into the rock. You see fragments of yourself walking beside you.','soft metal-clink','{"in":"glassmere","out":"first-city-gate"}'),
('glassmere','Glassmere','road','Mere','A shallow lake of perfectly still water. Citizens cross by stepping-stone, watching their faces.','no wind at all','{"in":"mirrorlands-court","out":"mirror-pass"}'),
-- to Gilded Bazaar (bazaar:)
('caravan-spur','The Caravan Spur','road','Spur','A wide market-road already busy with carts before dawn.','wheel-creak, mule-bray','{"in":"goldwash","out":"first-city-gate"}'),
('goldwash','Goldwash','road','Wash','A dry riverbed where, they say, gold once flowed. People still pan, hopefully.','grit-pan-rasp','{"in":"gilded-bazaar","out":"caravan-spur"}'),
-- to Silent Horizon (reach:)
('star-stairs','The Star Stairs','road','Stairs','Stone stairs cut into a hillside. Each landing is paved with a different constellation.','wind-hush','{"in":"hush-pines","out":"first-city-gate"}'),
('hush-pines','The Hush Pines','road','Pines','A pine grove so quiet that travelers find themselves walking on tiptoe.','needle-fall','{"in":"silent-horizon","out":"star-stairs"}'),
-- to Evershade Court (court:)
('vow-walk-road','The Vow Walk Road','road','Road','A colonnade-road of cypresses, each tied with a faded ribbon.','cloth-flutter','{"in":"silver-pines","out":"first-city-gate"}'),
('silver-pines','The Silver Pines','road','Pines','Pale-barked pines whose needles catch the moonlight even at noon.','soft branch-creak','{"in":"evershade-court","out":"vow-walk-road"}'),
-- to Feastlands Keep (throne:)
('hearth-road','The Hearth Road','road','Road','A wide track lined with roadside ovens. Travelers eat for free if they can carry the loaf.','baking bread, woodsmoke','{"in":"barley-flats","out":"first-city-gate"}'),
('barley-flats','The Barley Flats','road','Flats','Endless rolling fields of barley. The Keep''s towers rise out of them like teeth.','grain-shush','{"in":"feastlands-keep","out":"hearth-road"}')
ON CONFLICT (slug) DO NOTHING;

-- =========================================================
-- 3. WILDERNESS EXPANSION (north from old-flag-road via wilderness-edge)
-- =========================================================

INSERT INTO public.rooms (slug, name, kind, label, description, ambience, exits) VALUES
('briar-hollow','The Briar Hollow','wilds','Hollow','A bowl-shaped clearing surrounded by black briars. Birds avoid it.','cricket, briar-rasp','{"south":"wilderness-edge","north":"standing-stones"}'),
('standing-stones','The Standing Stones','wilds','Circle','Seven leaning stones, older than any Aether. The grass between them refuses to grow.','low wind-keen','{"south":"briar-hollow","north":"wolf-glade","east":"hermits-hut"}'),
('wolf-glade','Wolf-Glade','wilds','Glade','A broad clearing scarred with claw-marks on every tree.','distant howl','{"south":"standing-stones","north":"drowned-chapel"}'),
('drowned-chapel','The Drowned Chapel','ruin','Chapel','A small stone chapel half-sunk in a bog. The bell still rings underwater when the wind is right.','underwater-tone, frog','{"south":"wolf-glade","west":"black-tarn","east":"moss-bridge"}'),
('hermits-hut','The Hermit''s Hut','room','Hut','A turf hut. The hermit may or may not be home. Smoke rises in any case.','crackling fire','{"west":"standing-stones","north":"witch-tree"}'),
('moss-bridge','The Moss Bridge','bridge','Bridge','A fallen tree across a slow stream, carpeted with green moss inches thick.','running water','{"west":"drowned-chapel","north":"cairn-field"}'),
('witch-tree','The Witch-Tree','wilds','Tree','A black tree hung with hundreds of small bones tied with red string.','bone-clack','{"south":"hermits-hut","north":"foxhole-pit"}'),
('cairn-field','The Cairn Field','wilds','Field','Hundreds of stone cairns of every size. Most are old. A few are new.','wind through stone','{"south":"moss-bridge","west":"foxhole-pit"}'),
('foxhole-pit','Foxhole Pit','cave','Pit','A collapsed sinkhole. Something lives at the bottom. Probably foxes.','distant skittering','{"south":"witch-tree","east":"cairn-field"}'),
('black-tarn','The Black Tarn','shore','Tarn','A small black lake. The trees on the far shore are all dead. None of them have fallen.','still water','{"east":"drowned-chapel"}')
ON CONFLICT (slug) DO NOTHING;

-- =========================================================
-- 4. DESERT EXPANSION (off caravan-road, desert-verge, bone-dunes)
-- =========================================================

INSERT INTO public.rooms (slug, name, kind, label, description, ambience, exits) VALUES
('glass-flats','The Glass Flats','desert','Flats','A great plain of fused sand. Walking it sounds like walking on cracked plates.','glass-crackle, hot wind','{"north":"caravan-road","south":"salt-mirror","east":"vulture-spire"}'),
('salt-mirror','The Salt Mirror','desert','Pan','A dry salt pan that mirrors the sky so well you forget which way is up.','silence','{"north":"glass-flats","south":"sun-bleached-caravan","west":"mirage-wells"}'),
('sun-bleached-caravan','The Sun-Bleached Caravan','desert','Wreck','Skeletons of camels, drivers, and crates lie in a line going nowhere. The wind has bleached everything bone-white.','dry creak','{"north":"salt-mirror","south":"ember-dunes"}'),
('vulture-spire','The Vulture Spire','desert','Spire','A natural rock spire crowned with a dozen patient vultures.','dry feather-rustle','{"west":"glass-flats","south":"whisper-stones"}'),
('mirage-wells','The Mirage Wells','desert','Wells','Three stone wellheads. Two are empty. The third pours water that vanishes before you can drink.','distant dripping','{"east":"salt-mirror","south":"forgotten-oasis"}'),
('ember-dunes','The Ember Dunes','desert','Dunes','Dunes that glow faintly red at night. The sand is warm even before dawn.','soft sand-hiss','{"north":"sun-bleached-caravan","east":"whisper-stones"}'),
('whisper-stones','The Whisper Stones','desert','Stones','A field of stones the size of fists. They whisper to each other when no one listens.','very faint murmur','{"north":"vulture-spire","west":"ember-dunes","south":"skeleton-kiln"}'),
('forgotten-oasis','The Forgotten Oasis','desert','Oasis','A ring of palms around a single clear pool. There are footprints all around it. None are recent.','rustling palm','{"north":"mirage-wells","east":"wind-carved-arches"}'),
('skeleton-kiln','The Skeleton Kiln','desert','Kiln','A ruined brick kiln, half-buried in sand. Bones poke from the sand around it. Searching here may uncover a way down.','hot brick-tick','{"north":"whisper-stones","down":"sunken-gate"}'),
('wind-carved-arches','The Wind-Carved Arches','desert','Arches','Sandstone arches polished to glass by the wind. Walking through them is said to age you slightly.','low wind-tone','{"west":"forgotten-oasis"}')
ON CONFLICT (slug) DO NOTHING;

-- =========================================================
-- 5. THE TOMB-BELOW (buried city of the dead, under skeleton-kiln)
-- =========================================================

INSERT INTO public.rooms (slug, name, kind, label, description, ambience, exits, hidden) VALUES
('sunken-gate','The Sunken Gate','ruin','Gate','A great basalt gate, half-buried, half-fallen. Sigils older than the seven Aethers are carved into the lintel. The air is suddenly cold.','stone-quiet, far drip','{"up":"skeleton-kiln","down":"hall-of-folded-names"}',true),
('hall-of-folded-names','The Hall of Folded Names','crypt','Hall','A long hall whose walls are graven with names — every name folded in on itself, the way the Speaker''s mouth was folded shut.','breath that is not yours','{"up":"sunken-gate","north":"long-crypts","east":"coin-choked-river"}',true),
('long-crypts','The Long Crypts','crypt','Crypts','Niches stacked five high, each holding a wrapped figure. Many are empty. Many are not.','linen-rasp','{"south":"hall-of-folded-names","north":"silent-market"}',true),
('coin-choked-river','The Coin-Choked River','shore','River','A black underground river, its bed carpeted in coins so old the metal cannot be named. Crossing requires a toll you cannot afford.','soft current, coin-tinkle','{"west":"hall-of-folded-names","east":"reliquary-of-the-first-voice"}',true),
('silent-market','The Silent Market','market','Market','A perfect mirror of the Gilded Bazaar above, but every stall is empty and every coin laid out is grey. The dead came here to buy what living cannot.','no sound at all','{"south":"long-crypts","east":"throne-of-dust"}',true),
('throne-of-dust','The Throne of Dust','hall','Throne','A throne carved from a single piece of pale stone, drowned to the seat in fine grey dust. A crown sits on it. No one wears it.','stillness','{"west":"silent-market","north":"chorus-of-bones"}',true),
('chorus-of-bones','The Chorus of Bones','temple','Choir','A vault where bones are arranged into hundreds of standing figures. They face an empty pulpit.','very faint hum','{"south":"throne-of-dust","east":"drowned-library"}',true),
('reliquary-of-the-first-voice','The Reliquary of the First Voice','crypt','Reliquary','A small chamber holding a single stone tongue on a velvet cushion. This is what was taken from the Speaker. Looking at it too long hurts.','high keening at the edge of hearing','{"west":"coin-choked-river","north":"tomb-heart"}',true),
('drowned-library','The Drowned Library','crypt','Library','A library half-flooded with black water. Books float, still legible, in a script that bypasses your eyes entirely.','slow water-lap','{"west":"chorus-of-bones","north":"tomb-heart"}',true),
('tomb-heart','The Tomb-Heart','crypt','Heart','A round chamber at the centre of the buried city. A stone sarcophagus is open, empty. The lid is broken from the inside.','cold-pulse','{"south":"reliquary-of-the-first-voice"}',true)
ON CONFLICT (slug) DO NOTHING;

-- =========================================================
-- 6. REWIRE EXISTING EXITS
--    a) gate -> road heads (instead of capitals directly)
--    b) capitals' south -> their road tail (instead of gate directly)
--    c) wilderness-edge gets new north chain
--    d) caravan-road gets new south branch
-- =========================================================

UPDATE public.rooms
SET exits = jsonb_build_object(
  'sanctum',     'pilgrim-causeway',
  'bastion',     'ironroad',
  'mirrorhall',  'mirror-pass',
  'bazaar',      'caravan-spur',
  'reach',       'star-stairs',
  'court',       'vow-walk-road',
  'throne',      'hearth-road',
  'caravan',     'caravan-road',
  'north',       'sevenfold-square',
  'south',       'old-flag-road'
)
WHERE slug = 'first-city-gate';

UPDATE public.rooms SET exits = exits - 'south' || '{"south":"solar-foothills"}'::jsonb WHERE slug = 'high-sanctum';
UPDATE public.rooms SET exits = exits - 'south' || '{"south":"slag-flats"}'::jsonb WHERE slug = 'iron-bastion';
UPDATE public.rooms SET exits = exits - 'south' || '{"south":"glassmere"}'::jsonb WHERE slug = 'mirrorlands-court';
UPDATE public.rooms SET exits = exits - 'south' || '{"south":"goldwash"}'::jsonb WHERE slug = 'gilded-bazaar';
UPDATE public.rooms SET exits = exits - 'south' || '{"south":"hush-pines"}'::jsonb WHERE slug = 'silent-horizon';
UPDATE public.rooms SET exits = exits - 'south' || '{"south":"silver-pines"}'::jsonb WHERE slug = 'evershade-court';
UPDATE public.rooms SET exits = exits - 'south' || '{"south":"barley-flats"}'::jsonb WHERE slug = 'feastlands-keep';

-- wilderness chain (north from wilderness-edge)
UPDATE public.rooms
SET exits = exits || '{"north":"briar-hollow"}'::jsonb
WHERE slug = 'wilderness-edge';

-- desert chain (south from caravan-road into glass-flats)
UPDATE public.rooms
SET exits = exits || '{"south":"glass-flats"}'::jsonb
WHERE slug = 'caravan-road';

-- =========================================================
-- 7. NEW TABLES: room_caches, claims, wagon_routes
-- =========================================================

CREATE TABLE IF NOT EXISTS public.room_caches (
  room text PRIMARY KEY,
  gold integer NOT NULL DEFAULT 0,
  item_key text,
  hint text NOT NULL DEFAULT '',
  reveal_text text NOT NULL DEFAULT 'You uncover something half-buried.'
);
ALTER TABLE public.room_caches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "caches readable" ON public.room_caches FOR SELECT TO authenticated USING (true);

CREATE TABLE IF NOT EXISTS public.player_room_cache_claims (
  user_id uuid NOT NULL,
  room text NOT NULL,
  claimed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, room)
);
ALTER TABLE public.player_room_cache_claims ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own claims readable" ON public.player_room_cache_claims FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own claims insertable" ON public.player_room_cache_claims FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.wagon_routes (
  hub text NOT NULL,
  destination text NOT NULL,
  cost_gold integer NOT NULL DEFAULT 10,
  flavor text NOT NULL DEFAULT 'The wagon shudders to a halt.',
  PRIMARY KEY (hub, destination)
);
ALTER TABLE public.wagon_routes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wagon routes readable" ON public.wagon_routes FOR SELECT TO authenticated USING (true);

-- =========================================================
-- 8. SEED CACHES (hidden treasures across wilds, desert, tomb)
-- =========================================================
INSERT INTO public.room_caches (room, gold, item_key, hint, reveal_text) VALUES
('briar-hollow', 12, NULL, 'A patch of disturbed earth.', 'Beneath the briars, a leather pouch heavy with old coin.'),
('standing-stones', 25, NULL, 'A loose stone at the central monolith.', 'Behind the stone, a small reliquary holding pre-Aether coin.'),
('drowned-chapel', 40, NULL, 'A pew floats wrong.', 'Under the pew, a brass-bound coffer of waterlogged silver.'),
('cairn-field', 18, NULL, 'One cairn is too neat.', 'Inside the cairn — a bone hand still clutching a coin-purse.'),
('foxhole-pit', 30, NULL, 'A glint at the bottom.', 'A predator''s den, lined with the rings of those it ate.'),
('black-tarn', 60, NULL, 'Something pale below the surface.', 'A drowned satchel rises when you reach: gold and a single tooth.'),
('mirage-wells', 22, NULL, 'A fourth well, just glimpsed.', 'A sealed jar of coin, left for travelers who never came.'),
('sun-bleached-caravan', 45, NULL, 'A driver''s purse, still belted.', 'You unbuckle the bone hand and take what was kept.'),
('forgotten-oasis', 35, NULL, 'A rock at the pool''s lip.', 'A pilgrim''s offering, never claimed.'),
('wind-carved-arches', 55, NULL, 'A niche at the highest arch.', 'A wind-polished casket of trade-coin.'),
('coin-choked-river', 120, NULL, 'The riverbed itself.', 'You scoop a fistful of grey coin. The river permits this once.'),
('silent-market', 80, NULL, 'A stall with no shadow.', 'A grey strongbox: coin from a kingdom no one remembers.'),
('throne-of-dust', 200, NULL, 'A loose flagstone before the throne.', 'A king''s burial-coin, untaken for an age.'),
('drowned-library', 90, NULL, 'A weighted book.', 'Inside the hollowed binding, gold leaf wrapped in vellum.'),
('tomb-heart', 300, NULL, 'The empty sarcophagus.', 'At the bottom of the empty tomb, a single golden tongue. You take it.')
ON CONFLICT (room) DO NOTHING;

-- =========================================================
-- 9. SEED WAGON ROUTES (hubs <-> hubs, costs by distance)
--   hubs: first-city-gate, high-sanctum, iron-bastion, mirrorlands-court,
--         gilded-bazaar, silent-horizon, evershade-court, feastlands-keep
-- =========================================================
INSERT INTO public.wagon_routes (hub, destination, cost_gold, flavor) VALUES
-- from First City Gate
('first-city-gate','high-sanctum',15,'The wagon climbs the Pilgrim Causeway in golden dust.'),
('first-city-gate','iron-bastion',15,'The wagon rattles down the Ironroad past silent patrols.'),
('first-city-gate','mirrorlands-court',15,'The wagon threads the Mirror Pass; your reflection rides alongside.'),
('first-city-gate','gilded-bazaar',12,'The wagon joins the morning caravan; coin clinks the whole way.'),
('first-city-gate','silent-horizon',18,'The wagon climbs the Star Stairs in a silence the driver enforces.'),
('first-city-gate','evershade-court',18,'The wagon passes between silver pines; the driver does not speak.'),
('first-city-gate','feastlands-keep',15,'The wagon rolls through barley-flats; the driver tears bread for both of you.'),
-- from each capital back to the Gate
('high-sanctum','first-city-gate',15,'The wagon descends from the white walls in a hush of dust.'),
('iron-bastion','first-city-gate',15,'The wagon escapes the Bastion''s smoke at last.'),
('mirrorlands-court','first-city-gate',15,'The wagon clatters across Glassmere; you watch yourself leave.'),
('gilded-bazaar','first-city-gate',12,'The wagon rolls back along the caravan spur, lighter of coin.'),
('silent-horizon','first-city-gate',18,'The wagon glides down the hush-pines.'),
('evershade-court','first-city-gate',18,'The wagon leaves the colonnade of vows.'),
('feastlands-keep','first-city-gate',15,'The wagon trundles home through the bread-smoke.')
ON CONFLICT (hub, destination) DO NOTHING;
