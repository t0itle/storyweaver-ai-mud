# Expanded trader stock

Shops today mostly carry trade goods; real gear is thin (about 80 weapons, 50 armors, 23 rings) and there are no spell books, rune scrolls, potions or tools for sale. This adds a broader catalogue and specialist traders.

## What players get
- **~150 new gear pieces**: weapons (swords, axes, bows, staves, daggers), full armor sets (head/body/legs/feet, light/medium/heavy), shields, rings, amulets, focuses — in 4 quality tiers (Common, Fine, Masterwork, Relic) with rising stats and prices.
- **Spell books** (~20): reading one teaches a rune you don't know (uses the existing rune system).
- **Rune scrolls** (~15): one-shot casts of lesser runes.
- **Potions, foods, tools, bags** now sold too.
- **Specialist traders in each capital** (one new NPC per capital, 7 total): Armorer, Weaponsmith, Arcanist (books/scrolls/focuses), plus existing general merchants gain a few "rare" slots that rotate daily.
- Shop window shows up to 60 items (raised to 90) grouped by type; Relic-tier items only appear for players with enough town reputation.

## Technical details
- New `trade_goods` categories: `armor`, `weapon`, `arcana`, `provisions`; seed items + trade_goods rows via data inserts; existing unsold gear (potions, tools, food, feet) gets trade_goods rows.
- New item kind for spell books: `items.teaches_rune` (nullable column, migration); `use-item` path learns the rune into `player_runes` and consumes the book.
- Seed 7 specialist merchant NPCs in capital market rooms with `merchant_categories` set; add new categories to existing arms/gem merchants.
- `market-action` list: raise cap, add tier gate by `town_rep`, daily-seeded rare rotation.
- Add test for tier gating thresholds.
