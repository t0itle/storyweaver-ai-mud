import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { Leaf, Pickaxe, Fish, ChefHat, Sparkles, Hammer } from "lucide-react";

interface Props { open: boolean; onClose: () => void; userId: string }

const SKILLS: { key: string; name: string; icon: JSX.Element; flavor: string }[] = [
  { key: "foraging", name: "Foraging", icon: <Leaf className="w-4 h-4" />, flavor: "herbs, mushrooms, wood, salt" },
  { key: "mining", name: "Mining", icon: <Pickaxe className="w-4 h-4" />, flavor: "ore and gems from stone" },
  { key: "fishing", name: "Fishing", icon: <Fish className="w-4 h-4" />, flavor: "rivers, lakes, and shore" },
  { key: "cooking", name: "Cooking", icon: <ChefHat className="w-4 h-4" />, flavor: "food and well-fed buffs" },
  { key: "alchemy", name: "Alchemy", icon: <Sparkles className="w-4 h-4" />, flavor: "potions and draughts" },
  { key: "smithing", name: "Smithing", icon: <Hammer className="w-4 h-4" />, flavor: "weapons, armor, tools" },
];

function xpForLevel(level: number) { return Math.floor(50 * Math.pow(level, 1.5)); }

export function LifeskillsModal({ open, onClose, userId }: Props) {
  const [rows, setRows] = useState<Record<string, { level: number; xp: number }>>({});
  useEffect(() => {
    if (!open) return;
    supabase.from("player_lifeskills").select("skill,level,xp").eq("user_id", userId).then(({ data }) => {
      const acc: Record<string, { level: number; xp: number }> = {};
      for (const r of (data ?? []) as any[]) acc[r.skill] = { level: r.level, xp: r.xp };
      setRows(acc);
    });
  }, [open, userId]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg bg-card">
        <DialogHeader>
          <DialogTitle className="font-display text-parchment">Lifeskills</DialogTitle>
          <p className="text-xs text-ash/70 italic">The slow arts. They grow by doing.</p>
        </DialogHeader>
        <div className="space-y-2 mt-2">
          {SKILLS.map((s) => {
            const r = rows[s.key] ?? { level: 1, xp: 0 };
            const need = xpForLevel(r.level);
            const pct = Math.min(100, (r.xp / need) * 100);
            return (
              <div key={s.key} className="rounded border border-ash/30 bg-black/30 p-2.5">
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2 text-sm text-parchment font-medium">{s.icon}<span>{s.name}</span></div>
                  <span className="text-[10px] text-ash/70">lvl {r.level}</span>
                </div>
                <p className="text-[10px] text-ash/60 italic mb-1.5">{s.flavor}</p>
                <div className="h-1.5 rounded bg-black/50 overflow-hidden">
                  <div className="h-full bg-amber-500/60" style={{ width: `${pct}%` }} />
                </div>
                <p className="text-[10px] text-ash/60 mt-1 text-right">{r.xp} / {need} xp</p>
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
