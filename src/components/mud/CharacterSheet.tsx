import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Sword, Shield, Shirt, HardHat, Footprints, Circle, Gem, Wand2, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { InvItem } from "./Panels";

interface SheetProfile {
  username: string;
  race: string | null;
  level: number;
  xp: number;
  hp: number; max_hp: number;
  gold: number;
  merit: number;
  corruption: number;
  aether: string | null;
  portrait_url: string | null;
  char_description: string | null;
}

// Cumulative XP needed to reach level N (N>=2) is fib(N+1) * 10
// fib(2)=1, fib(3)=2, fib(4)=3, fib(5)=5, fib(6)=8, fib(7)=13 → thresholds 20, 30, 50, 80, 130 …
function xpThresholdForLevel(n: number): number {
  if (n <= 1) return 0;
  let a = 1, b = 2; // fib(2), fib(3)
  // we want fib(n+1); currently b = fib(3) when iterating from level 2
  for (let i = 2; i < n; i++) { const t = a + b; a = b; b = t; }
  return b * 10;
}

const SLOT_ORDER = ["main_hand", "off_hand", "head", "body", "legs", "feet", "neck", "ring", "focus"] as const;
const SLOT_LABEL: Record<string, string> = {
  main_hand: "Main Hand", off_hand: "Off Hand", head: "Head", body: "Body",
  legs: "Legs", feet: "Feet", neck: "Neck", ring: "Ring", focus: "Focus",
};
const SLOT_ICON: Record<string, any> = {
  main_hand: Sword, off_hand: Shield, head: HardHat, body: Shirt,
  legs: Shirt, feet: Footprints, neck: Circle, ring: Circle, focus: Gem,
};

export function CharacterSheet({
  open, onClose, profile, inventory, onPortraitUpdated,
}: {
  open: boolean; onClose: () => void;
  profile: SheetProfile;
  inventory: InvItem[];
  onPortraitUpdated?: (url: string) => void;
}) {
  const [restyling, setRestyling] = useState(false);
  const equipped = inventory.filter(i => i.equipped_slot);
  const findSlot = (slot: string) => equipped.find(i => i.equipped_slot === slot);

  const restyle = async () => {
    setRestyling(true);
    try {
      const { data, error } = await supabase.functions.invoke("restyle-portrait", { body: {} });
      if (error || data?.error) throw new Error(data?.error ?? error?.message);
      toast.success("Your likeness is repainted.");
      if (data?.portrait_url) onPortraitUpdated?.(data.portrait_url);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "The brush refuses.");
    } finally { setRestyling(false); }
  };

  const armor = equipped.reduce((s, i) => s + (i.items.base_armor ?? 0), 0);
  const weapon = findSlot("main_hand");
  const dmg = weapon ? weapon.items.base_damage : 1;

  const curThreshold = xpThresholdForLevel(profile.level);
  const nextThreshold = xpThresholdForLevel(profile.level + 1);
  const intoLevel = Math.max(0, profile.xp - curThreshold);
  const span = Math.max(1, nextThreshold - curThreshold);
  const pct = Math.min(100, Math.round((intoLevel / span) * 100));

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl text-ember">{profile.username}</DialogTitle>
          <DialogDescription className="font-mono text-[10px] uppercase tracking-widest">
            {profile.race ?? "wanderer"} · level {profile.level}
            {profile.aether && <> · sworn to <span className="text-ember">{profile.aether}</span></>}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 sm:grid-cols-[200px_1fr] gap-5">
          {/* Portrait */}
          <div className="space-y-2">
            <div className="aspect-[3/4] w-40 sm:w-full mx-auto bg-card border border-ember/40 overflow-hidden">
              {profile.portrait_url ? (
                <img src={profile.portrait_url} alt={profile.username} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-ash text-xs italic">no likeness</div>
              )}
            </div>
            <button
              onClick={restyle}
              disabled={restyling}
              className="w-full font-mono text-[10px] uppercase tracking-widest text-ash hover:text-ember border border-border hover:border-ember/60 px-2 py-1.5 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
              title="Repaint your portrait to reflect what you currently wear"
            >
              {restyling ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />}
              {restyling ? "repainting…" : "reflect my gear"}
            </button>
            {profile.char_description && (
              <p className="text-xs text-whisper italic leading-snug">{profile.char_description}</p>
            )}
          </div>

          {/* Stats + level + xp + equipment */}
          <div className="space-y-4">
            <div>
              <div className="flex items-baseline justify-between">
                <span className="font-mono text-[10px] uppercase tracking-widest text-ash">Experience</span>
                <span className="font-mono text-[10px] text-ash">
                  {intoLevel} / {span} ({profile.xp} total)
                </span>
              </div>
              <div className="h-2 bg-border relative overflow-hidden mt-1">
                <div className="absolute inset-y-0 left-0 bg-gradient-to-r from-accent to-ember" style={{ width: `${pct}%` }} />
              </div>
              <div className="font-mono text-[10px] text-ash mt-1">
                next: level {profile.level + 1} at {nextThreshold} xp
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 font-mono text-xs">
              <Stat label="Health" value={`${profile.hp} / ${profile.max_hp}`} tone="text-ember" />
              <Stat label="Damage" value={`+${dmg}`} tone="text-parchment" />
              <Stat label="Armor" value={`+${armor}`} tone="text-accent" />
              <Stat label="Gold" value={`${profile.gold}`} tone="text-parchment" />
              <Stat label="Merit" value={`${profile.merit}`} tone="text-moss" />
              <Stat label="Corruption" value={`${profile.corruption} / 100`} tone="text-whisper" />
            </div>

            <div>
              <h3 className="font-mono text-[10px] uppercase tracking-widest text-ash mb-2">Worn & Wielded</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {SLOT_ORDER.map(slot => {
                  const it = findSlot(slot);
                  const Icon = SLOT_ICON[slot] ?? Circle;
                  return (
                    <div key={slot} className={`flex items-center gap-2 px-2 py-1.5 border ${it ? "border-ember/40 bg-ember/5" : "border-border"}`}>
                      <Icon className={`w-3.5 h-3.5 ${it ? "text-ember" : "text-ash/50"}`} />
                      <div className="min-w-0 flex-1">
                        <div className="font-mono text-[9px] uppercase tracking-widest text-ash">{SLOT_LABEL[slot]}</div>
                        <div className={`text-xs truncate ${it ? "text-parchment" : "text-ash/50 italic"}`}>
                          {it ? it.items.name : "—"}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="border border-border px-2 py-1.5">
      <div className="font-mono text-[9px] uppercase tracking-widest text-ash">{label}</div>
      <div className={`font-display text-base ${tone}`}>{value}</div>
    </div>
  );
}
