import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Crown, X } from "lucide-react";

// Legends — the public chronicle: the most storied walkers and the deeds
// the bards are already singing about.

interface LegendRow {
  id: string; username: string; level: number; merit: number;
  aether: string | null; faction: string | null; dead: boolean;
}
interface DeedRow {
  kind: string; actor_name: string; target_name: string | null;
  details: Record<string, unknown> | null; created_at: string;
}

const DEED_KINDS = ["dragon_stirs", "aether_vow_complete", "chaos_complete", "died"];

function describeDeed(d: DeedRow): string | null {
  if (d.kind === "dragon_stirs" && (d.details as { fell?: boolean } | null)?.fell) {
    return `${(d.details as { slain_by?: string })?.slain_by ?? d.actor_name} slew ${d.target_name} — the bards are still arguing over the melody.`;
  }
  if (d.kind === "aether_vow_complete") {
    return `${d.actor_name} walked the full Vow of ${d.target_name} and rose Devout.`;
  }
  if (d.kind === "chaos_complete") {
    return `${d.actor_name} set the Crown of Refusal upon their own head.`;
  }
  if (d.kind === "died" && (d.details as { permadeath?: boolean } | null)?.permadeath) {
    return `${d.actor_name} fell, and no god caught them. Remember the name.`;
  }
  return null;
}

export function LegendsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [walkers, setWalkers] = useState<LegendRow[]>([]);
  const [deeds, setDeeds] = useState<DeedRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      const [{ data: top }, { data: ev }] = await Promise.all([
        supabase.from("profiles")
          .select("id, username, level, merit, aether, faction, dead")
          .order("merit", { ascending: false }).limit(10),
        supabase.from("world_events")
          .select("kind, actor_name, target_name, details, created_at")
          .in("kind", DEED_KINDS)
          .order("created_at", { ascending: false }).limit(30),
      ]);
      if (cancelled) return;
      setWalkers((top ?? []) as LegendRow[]);
      setDeeds((ev ?? []) as DeedRow[]);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [open]);

  if (!open) return null;

  const sungDeeds = deeds.map((d) => ({ d, line: describeDeed(d) })).filter((x) => x.line).slice(0, 10);

  return (
    <div className="fixed inset-0 z-50 bg-background/85 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card border border-border max-w-lg w-full max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <Crown className="w-4 h-4 text-ember" />
            <h2 className="font-display text-lg text-parchment">Legends of the Kingdoms</h2>
          </div>
          <button onClick={onClose} className="text-ash hover:text-parchment"><X className="w-4 h-4" /></button>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-thin px-5 py-4 space-y-5">
          {loading && <div className="text-ash italic text-sm">The bards clear their throats…</div>}

          {!loading && (
            <>
              <div>
                <h3 className="font-mono text-[10px] uppercase tracking-widest text-ash mb-2">Most storied walkers</h3>
                <ol className="space-y-1">
                  {walkers.map((w, i) => (
                    <li key={w.id} className="flex items-center gap-2 text-sm">
                      <span className={`font-mono text-[10px] w-5 text-right ${i === 0 ? "text-ember" : "text-ash"}`}>{i + 1}.</span>
                      <span className={`font-display ${w.dead ? "line-through text-ash" : "text-parchment"}`}>{w.username}</span>
                      <span className="font-mono text-[10px] text-ash">
                        lv {w.level}{w.aether ? ` · ${w.aether}` : w.faction === "chaos" ? " · chaos" : ""}{w.dead ? " · fallen" : ""}
                      </span>
                      <span className="ml-auto font-mono text-xs text-moss">❖ {w.merit}</span>
                    </li>
                  ))}
                  {walkers.length === 0 && <li className="text-ash italic text-sm">No names yet. Be the first worth singing about.</li>}
                </ol>
              </div>

              <div>
                <h3 className="font-mono text-[10px] uppercase tracking-widest text-ash mb-2">Deeds the bards keep</h3>
                <div className="space-y-1.5">
                  {sungDeeds.map(({ d, line }, i) => (
                    <p key={i} className="text-sm text-whisper italic border-l-2 border-ember/40 pl-2">{line}</p>
                  ))}
                  {sungDeeds.length === 0 && <p className="text-ash italic text-sm">The songbook is still blank. Slay something enormous.</p>}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
