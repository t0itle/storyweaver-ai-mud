import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Hammer, Sparkles, ChefHat, Lock } from "lucide-react";

type Station = { key: string; kind: "kitchen" | "alchemy_bench" | "forge"; name: string; description: string | null };
type Recipe = {
  key: string; name: string; description: string | null; skill: "cooking" | "alchemy" | "smithing";
  station_kind: string; level_req: number; inputs: { item: string; qty: number }[];
  output_item: string; output_qty: number; xp_reward: number; starter: boolean;
};
type Item = { key: string; name: string };
type Stack = { item_key: string; quantity: number };

const KIND_META: Record<string, { label: string; icon: JSX.Element; skill: string }> = {
  kitchen: { label: "Kitchen", icon: <ChefHat className="w-5 h-5" />, skill: "cooking" },
  alchemy_bench: { label: "Alchemy Bench", icon: <Sparkles className="w-5 h-5" />, skill: "alchemy" },
  forge: { label: "Forge", icon: <Hammer className="w-5 h-5" />, skill: "smithing" },
};

interface Props {
  open: boolean;
  onClose: () => void;
  station: Station | null;
  userId: string;
  onChanged: () => void;
}

export function CraftingModal({ open, onClose, station, userId, onChanged }: Props) {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [learned, setLearned] = useState<Set<string>>(new Set());
  const [level, setLevel] = useState(1);
  const [xp, setXp] = useState(0);
  const [inventory, setInventory] = useState<Record<string, number>>({});
  const [items, setItems] = useState<Record<string, Item>>({});
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !station) return;
    const skill = KIND_META[station.kind].skill;
    (async () => {
      const [rec, plr, sk, inv, allItems] = await Promise.all([
        supabase.from("recipes").select("*").eq("station_kind", station.kind).order("level_req"),
        supabase.from("player_recipes").select("recipe_key").eq("user_id", userId),
        supabase.from("player_lifeskills").select("level,xp").eq("user_id", userId).eq("skill", skill).maybeSingle(),
        supabase.from("player_items").select("item_key,quantity").eq("user_id", userId).is("container_id", null),
        supabase.from("items").select("key,name"),
      ]);
      setRecipes((rec.data ?? []) as Recipe[]);
      setLearned(new Set((plr.data ?? []).map((r: any) => r.recipe_key)));
      setLevel(sk.data?.level ?? 1);
      setXp(sk.data?.xp ?? 0);
      const acc: Record<string, number> = {};
      for (const s of (inv.data ?? []) as Stack[]) acc[s.item_key] = (acc[s.item_key] ?? 0) + (s.quantity ?? 1);
      setInventory(acc);
      const itMap: Record<string, Item> = {};
      for (const i of (allItems.data ?? []) as Item[]) itMap[i.key] = i;
      setItems(itMap);
    })();
  }, [open, station, userId]);

  if (!station) return null;
  const meta = KIND_META[station.kind];

  async function craft(recipe: Recipe) {
    setBusy(recipe.key);
    const { data, error } = await supabase.functions.invoke("craft-item", { body: { recipe_key: recipe.key, count: 1 } });
    setBusy(null);
    if (error || (data as any)?.error) {
      toast.error((data as any)?.error ?? error?.message ?? "Craft failed");
      return;
    }
    toast.success(`Crafted ${(data as any).produced}× ${recipe.name}${(data as any).leveled ? ` — ${meta.skill} reached level ${(data as any).level}!` : ""}`);
    // refresh inventory + lifeskill
    const [inv, sk] = await Promise.all([
      supabase.from("player_items").select("item_key,quantity").eq("user_id", userId).is("container_id", null),
      supabase.from("player_lifeskills").select("level,xp").eq("user_id", userId).eq("skill", meta.skill).maybeSingle(),
    ]);
    const acc: Record<string, number> = {};
    for (const s of (inv.data ?? []) as Stack[]) acc[s.item_key] = (acc[s.item_key] ?? 0) + (s.quantity ?? 1);
    setInventory(acc);
    setLevel(sk.data?.level ?? 1);
    setXp(sk.data?.xp ?? 0);
    onChanged();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col bg-card">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display text-parchment">
            {meta.icon}
            <span>{station.name}</span>
            <Badge variant="outline" className="ml-2 border-amber-500/60 text-amber-200">
              {meta.skill} lvl {level} · {xp} xp
            </Badge>
          </DialogTitle>
          {station.description && <p className="text-xs text-ash/80 italic">{station.description}</p>}
        </DialogHeader>

        <ScrollArea className="flex-1 pr-2">
          <div className="space-y-2">
            {recipes.map((r) => {
              const known = r.starter || learned.has(r.key);
              const levelGate = level < r.level_req;
              const missing = r.inputs.filter((inp) => (inventory[inp.item] ?? 0) < inp.qty);
              const canCraft = known && !levelGate && missing.length === 0;
              const output = items[r.output_item]?.name ?? r.output_item;
              return (
                <div key={r.key} className={`rounded border p-2.5 ${canCraft ? "border-ash/40 bg-black/30" : "border-ash/20 bg-black/20 opacity-70"}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 text-sm text-parchment font-medium">
                        {!known && <Lock className="w-3.5 h-3.5 text-ash/60" />}
                        <span>{r.name}</span>
                        <Badge variant="outline" className="text-[9px] px-1 py-0 border-ash/40 text-ash">
                          lvl {r.level_req}
                        </Badge>
                        <span className="text-[10px] text-ash/70">→ {r.output_qty}× {output}</span>
                      </div>
                      <p className="text-[11px] text-ash/70 italic mt-0.5">{r.description}</p>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {r.inputs.map((inp) => {
                          const have = inventory[inp.item] ?? 0;
                          const ok = have >= inp.qty;
                          return (
                            <span key={inp.item} className={`text-[10px] px-1.5 py-0.5 rounded border ${ok ? "border-emerald-400/40 text-emerald-200" : "border-rose-400/40 text-rose-200"}`}>
                              {items[inp.item]?.name ?? inp.item.replace(/_/g, " ")} {have}/{inp.qty}
                            </span>
                          );
                        })}
                      </div>
                      {!known && <p className="text-[10px] text-ash/60 mt-1">You don't know this recipe.</p>}
                      {known && levelGate && <p className="text-[10px] text-ash/60 mt-1">Requires {meta.skill} lvl {r.level_req}.</p>}
                    </div>
                    <Button size="sm" variant="outline" disabled={!canCraft || busy === r.key} onClick={() => craft(r)} className="shrink-0">
                      {busy === r.key ? "…" : "Craft"}
                    </Button>
                  </div>
                </div>
              );
            })}
            {recipes.length === 0 && <p className="text-sm text-ash/70 italic p-4 text-center">No recipes here yet.</p>}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
