import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const RANKS = ["Initiate", "Journeyman", "Adept", "Master", "Grandmaster"];
const XP = [0, 100, 300, 700, 1500];
const PERKS: Record<string, string> = {
  warriors: "Training forge · free cot in hall",
  traders: "Members' galley · free cot in hall",
  mages: "Hall alembic · free cot in hall",
  thieves: "Fence access",
};

export function GuildBlock({ userId }: { userId: string }) {
  const [m, setM] = useState<{ guild_key: string; guild_xp: number; rank: number; name: string; glyph: string } | null>(null);
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("player_guild_membership")
        .select("guild_key, guild_xp, rank").eq("user_id", userId).eq("status", "member").limit(1).maybeSingle();
      if (!data) return setM(null);
      const { data: g } = await supabase.from("guilds").select("name, glyph").eq("key", data.guild_key).maybeSingle();
      setM({ ...data, name: g?.name ?? data.guild_key, glyph: g?.glyph ?? "◆" });
    })();
  }, [userId]);
  if (!m) return (
    <div className="font-mono text-[10px] uppercase tracking-widest text-ash">Guild · <span className="normal-case italic">unsworn — seek a guildmaster in any town</span></div>
  );
  const floor = XP[m.rank] ?? 0, next = XP[Math.min(m.rank + 1, 4)];
  const pct = m.rank >= 4 ? 100 : Math.min(100, ((m.guild_xp - floor) / (next - floor)) * 100);
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="font-mono text-[10px] uppercase tracking-widest text-ash">{m.glyph} {m.name} · {RANKS[m.rank]}</span>
        <span className="font-mono text-[10px] text-ash">{m.guild_xp} guild xp</span>
      </div>
      <div className="h-2 bg-border relative overflow-hidden mt-1">
        <div className="absolute inset-y-0 left-0 bg-gradient-to-r from-accent to-ember" style={{ width: `${pct}%` }} />
      </div>
      <div className="font-mono text-[10px] text-ash mt-1">
        {m.rank >= 4 ? "highest rank" : `next: ${RANKS[m.rank + 1]} at ${next}`} · {PERKS[m.guild_key] ?? ""}
      </div>
    </div>
  );
}
