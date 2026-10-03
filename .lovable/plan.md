# Guild System: Halls, Guild XP, Guild Quests

Right now guilds are a modal you can only open from a guildmaster in Souls Here. Ranks only count finished quests, and many chapters share one generic room. This plan makes membership something you can feel.

## What players get

1. **A real Guild Hall per chapter.** Each of the 3 guilds (Warriors, Traders, Mages) gets its own hall room in every town that has a chapter. The hall is reached by an exit from the town square, and only members can enter. Prospects and outsiders are turned back at the door.
   - Every hall has a guildmaster, a quest board and a hall perk:
     - Warriors' hall has a training forge.
     - Traders' hall has a shared strongbox and better sell prices.
     - Mages' hall has an alembic bench and a rune lectern.
   - Resting inside a hall is free.
2. **Guild XP and levels.**
   - Each guild quest, guild kill and guild craft gives you Guild XP.
   - Your rank (Initiate up to Master, 5 ranks) is now set by Guild XP instead of the number of quests.
   - Each rank-up is announced in the hall and unlocks the next tier of stock and quests.
3. **Guild Quest Board.**
   - Each hall offers 3 rotating quests a day, picked from the existing 135 quest templates for your rank.
   - One weekly "Chapter Charge" pays out more and is shared with other members in that town.
   - Progress shows in a new "Guild" tab in the Quests panel.
4. **Guild tab on the Character Sheet.** It shows your guild glyph, your rank, a Guild XP bar, your hall's location and the perks you've unlocked.

## Rules
- You belong to one guild at a time. Leaving keeps your Guild XP for 7 days in case you return.
- Guild XP to reach each rank: 0 / 100 / 300 / 700 / 1500. Existing members are converted using quests completed × 50.

## Technical details
- Migration:
  - Add `guild_xp` to `player_guild_membership`.
  - Add a `guild_board` table with columns guild_key, town_key, template_id, kind (daily/weekly) and expires_at.
  - Add `guild_hall_access` on `rooms` (holding the guild_key).
  - All with grants and RLS.
- Seed: one hall room per chapter (52 rooms), each linked from its town square, plus stations and a guildmaster move-in.
- `guild-action`:
  - New actions `board`, `enter_hall` and `leave`.
  - Award XP when guild quests are completed, and use `rankFor(xp)`.
- `world-tick`: refresh the daily and weekly boards.
- Movement check: block entry to a hall room for non-members.
- UI: a new Board tab in `GuildModal`, a Guild tab in `QuestsPanel`, a Guild block in `CharacterSheet`, and a hall-perk badge in the room view.
- Add a test for the XP-to-rank thresholds.
