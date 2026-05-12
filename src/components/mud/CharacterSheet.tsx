import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Sword, Shield, Shirt, HardHat, Footprints, Circle, Gem, Wand2, Loader2, Skull, Droplet, Pencil } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { InvItem } from "./Panels";
import { SkillTreePanel } from "./SkillTreePanel";

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
  portrait_variants?: Record<string, string> | null;
  last_damage_kind?: string | null;
}

type WoundState = "healthy" | "scratched" | "wounded" | "bloodied";
function woundStateFor(hp: number, maxHp: number): WoundState {
  const pct = maxHp > 0 ? hp / maxHp : 1;
  if (pct >= 0.75) return "healthy";
  if (pct >= 0.5) return "scratched";
  if (pct >= 0.25) return "wounded";
  return "bloodied";
}
const STATE_LABEL: Record<WoundState, string> = {
  healthy: "Unharmed", scratched: "Scratched", wounded: "Wounded", bloodied: "Bloodied",
};
const STATE_TONE: Record<WoundState, string> = {
  healthy: "text-moss", scratched: "text-parchment", wounded: "text-ember", bloodied: "text-destructive",
};
// CSS wound overlay shown instantly while the AI repaint loads in the background.
const STATE_FILTER: Record<WoundState, string> = {
  healthy: "none",
  scratched: "saturate(0.92) contrast(1.03) brightness(0.97)",
  wounded: "saturate(0.78) contrast(1.08) brightness(0.9) sepia(0.08)",
  bloodied: "saturate(0.55) contrast(1.15) brightness(0.78) sepia(0.18)",
};
const STATE_TINT: Record<WoundState, string> = {
  healthy: "transparent",
  scratched: "transparent",
  wounded: "transparent",
  bloodied: "transparent",
};
const KIND_LABEL: Record<string, string> = {
  physical: "blade & fist", fire: "flame", cold: "frost", arcane: "rune-burn",
  shadow: "shadow", holy: "searing light", poison: "venom",
};

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
  open, onClose, profile, inventory, onPortraitUpdated, onRestarted, onRenamed,
}: {
  open: boolean; onClose: () => void;
  profile: SheetProfile;
  inventory: InvItem[];
  onPortraitUpdated?: (url: string) => void;
  onRestarted?: () => void;
  onRenamed?: (name: string) => void;
}) {
  const [restyling, setRestyling] = useState(false);
  const [confirmRestart, setConfirmRestart] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(profile.username);
  const [renaming, setRenaming] = useState(false);
  const equipped = inventory.filter(i => i.equipped_slot);
  const findSlot = (slot: string) => equipped.find(i => i.equipped_slot === slot);

  const restart = async () => {
    setRestarting(true);
    try {
      const { data, error } = await supabase.functions.invoke("restart-character", { body: {} });
      if (error || data?.error) throw new Error(data?.error ?? error?.message);
      toast.success("The wind takes your old name. A new road waits.");
      try { sessionStorage.removeItem("everbloom-intro-seen"); } catch {}
      setConfirmRestart(false);
      onClose();
      onRestarted?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "The wind refuses.");
    } finally { setRestarting(false); }
  };

  const rename = async () => {
    const trimmed = nameDraft.trim();
    if (trimmed.length < 2) { toast.error("A name needs at least two letters."); return; }
    if (trimmed === profile.username) { setEditingName(false); return; }
    setRenaming(true);
    try {
      const { data, error } = await supabase.functions.invoke("rename-character", { body: { name: trimmed } });
      if (error || data?.error) throw new Error(data?.error ?? error?.message);
      toast.success("The world now knows you as " + trimmed + ".");
      setEditingName(false);
      onRenamed?.(trimmed);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "The name would not take.");
    } finally { setRenaming(false); }
  };

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

  // Wound state portrait variant
  const state = woundStateFor(profile.hp, profile.max_hp);
  const kind = profile.last_damage_kind ?? "physical";
  const cacheKey = `${state}:${kind}`;
  const cachedVariant = useMemo(
    () => (profile.portrait_variants ?? {})[cacheKey] ?? null,
    [profile.portrait_variants, cacheKey],
  );
  const [variantUrl, setVariantUrl] = useState<string | null>(cachedVariant);
  const [variantLoading, setVariantLoading] = useState(false);

  useEffect(() => { setVariantUrl(cachedVariant); }, [cachedVariant]);

  useEffect(() => {
    if (!open || state === "healthy" || !profile.portrait_url || variantUrl || variantLoading) return;
    setVariantLoading(true);
    supabase.functions.invoke("portrait-state-variant", { body: { state, kind } })
      .then(({ data, error }) => {
        if (error || data?.error) return;
        if (data?.portrait_url) setVariantUrl(data.portrait_url);
      })
      .finally(() => setVariantLoading(false));
  }, [open, state, kind, profile.portrait_url, variantUrl, variantLoading]);

  // Show base portrait instantly with a CSS wound overlay; swap in the AI repaint silently when ready.
  const usingAiVariant = state !== "healthy" && !!variantUrl;
  const shownPortrait = usingAiVariant ? variantUrl : profile.portrait_url;

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
          <DialogTitle className="font-display text-2xl text-ember flex items-center gap-2">
            {editingName ? (
              <>
                <input
                  type="text"
                  value={nameDraft}
                  onChange={(e) => setNameDraft(e.target.value.slice(0, 32))}
                  onKeyDown={(e) => { if (e.key === "Enter") rename(); if (e.key === "Escape") { setEditingName(false); setNameDraft(profile.username); } }}
                  disabled={renaming}
                  autoFocus
                  className="bg-card/40 border border-ember/60 focus:border-ember outline-none px-2 py-1 font-display text-2xl text-ember w-full max-w-xs"
                />
                <button onClick={rename} disabled={renaming} className="text-moss hover:text-ember transition-colors disabled:opacity-50" title="Save">
                  {renaming ? <Loader2 className="w-4 h-4 animate-spin" /> : "✓"}
                </button>
                <button onClick={() => { setEditingName(false); setNameDraft(profile.username); }} disabled={renaming} className="text-ash hover:text-ember transition-colors disabled:opacity-50" title="Cancel">
                  ✕
                </button>
              </>
            ) : (
              <>
                {profile.username}
                <button
                  onClick={() => { setNameDraft(profile.username); setEditingName(true); }}
                  className="text-ash/60 hover:text-ember transition-colors"
                  title="Change your name"
                >
                  <Pencil className="w-4 h-4" />
                </button>
              </>
            )}
          </DialogTitle>
          <DialogDescription className="font-mono text-[10px] uppercase tracking-widest">
            {profile.race ?? "wanderer"} · level {profile.level}
            {profile.aether && <> · sworn to <span className="text-ember">{profile.aether}</span></>}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 sm:grid-cols-[200px_1fr] gap-5">
          {/* Portrait */}
          <div className="space-y-2">
            <div className="relative aspect-[3/4] w-40 sm:w-full mx-auto bg-card border border-ember/40 overflow-hidden">
              {shownPortrait ? (
                <img
                  src={shownPortrait}
                  alt={profile.username}
                  className="w-full h-full object-cover transition-opacity duration-500"
                  style={usingAiVariant ? undefined : { filter: STATE_FILTER[state] }}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-ash text-xs italic">no likeness</div>
              )}
              {!usingAiVariant && state !== "healthy" && (
                <div className="absolute inset-0 pointer-events-none" style={{ background: STATE_TINT[state] }} />
              )}
              {state !== "healthy" && (
                <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-background/95 to-transparent px-2 py-1.5 flex items-center gap-1.5">
                  <Droplet className={`w-3 h-3 ${STATE_TONE[state]}`} />
                  <span className={`font-mono text-[10px] uppercase tracking-widest ${STATE_TONE[state]}`}>{STATE_LABEL[state]}</span>
                  <span className="font-mono text-[9px] text-ash ml-auto">by {KIND_LABEL[kind] ?? kind}</span>
                </div>
              )}
              {variantLoading && !usingAiVariant && (
                <div className="absolute top-1 right-1 bg-background/70 rounded-full p-1" title="painting wounds…">
                  <Loader2 className="w-3 h-3 animate-spin text-ember" />
                </div>
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

            <div className="border-t border-border/60 pt-4 mt-2">
              <h3 className="font-mono text-[10px] uppercase tracking-widest text-ash mb-2">Begin Anew</h3>
              <p className="text-xs text-whisper italic mb-2 leading-snug">
                Walk away from this life entirely. Your name, your face, your gold, your runes — all surrendered to the wind. A new walker stands up at the dunes' edge.
              </p>
              <button
                onClick={() => setConfirmRestart(true)}
                className="w-full font-mono text-[10px] uppercase tracking-widest text-ash hover:text-ember border border-border hover:border-ember/60 px-2 py-1.5 transition-colors flex items-center justify-center gap-1.5"
              >
                <Skull className="w-3 h-3" /> begin a new adventure
              </button>
            </div>
          </div>
        </div>
      </DialogContent>

      <AlertDialog open={confirmRestart} onOpenChange={(o) => !restarting && setConfirmRestart(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display text-ember">Surrender this life?</AlertDialogTitle>
            <AlertDialogDescription className="font-body text-ash leading-relaxed">
              Everything {profile.username} has carried, learned, or earned will be unstitched from the world. This cannot be undone. A new walker will wake on the road in their place.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={restarting}>Stay this life</AlertDialogCancel>
            <AlertDialogAction onClick={restart} disabled={restarting} className="bg-ember text-background hover:bg-ember/90">
              {restarting ? <><Loader2 className="w-3 h-3 mr-1.5 animate-spin" /> unstitching…</> : "Yes — let it go"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
