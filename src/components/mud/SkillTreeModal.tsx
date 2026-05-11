import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Lock, Check, Sword, Coins, Sparkles } from "lucide-react";
import { usePlayerSkills, type SkillNode } from "@/hooks/usePlayerSkills";

interface Props {
  open: boolean;
  onClose: () => void;
  userId: string | undefined;
  talentPoints: number;
  onChanged: () => void;
}

type Branch = "steel" | "whisper" | "sigil";

const BRANCHES: { key: Branch; name: string; tagline: string; tone: string; icon: JSX.Element }[] = [
  { key: "steel",   name: "Steel",   tagline: "body, blade, road",        tone: "border-sky-500/40 text-sky-200/90",      icon: <Sword className="w-4 h-4" /> },
  { key: "whisper", name: "Whisper", tagline: "silver, secrets, sleight", tone: "border-amber-500/40 text-amber-200/90",  icon: <Coins className="w-4 h-4" /> },
  { key: "sigil",   name: "Sigil",   tagline: "runes, kanji, the grain",  tone: "border-rose-500/40 text-rose-200/90",    icon: <Sparkles className="w-4 h-4" /> },
];

function gateMessage(node: SkillNode, ownedInBranch: SkillNode[]): string | null {
  const inLowerTiers = ownedInBranch.filter((n) => n.tier < node.tier).length;
  const totalInBranch = ownedInBranch.length;
  if (node.tier === 2 && inLowerTiers < 1) return "Take 1 talent in tier 1";
  if (node.tier === 3 && inLowerTiers < 2) return `Take 2 talents in tier 1–2 (${inLowerTiers}/2)`;
  if (node.tier === 4 && totalInBranch < 5) return `Requires 5 in this branch (${totalInBranch}/5)`;
  return null;
}

export default function SkillTreeModal({ open, onClose, userId, talentPoints, onChanged }: Props) {
  const { nodes, owned, refresh } = usePlayerSkills(userId);
  const [busy, setBusy] = useState<string | null>(null);

  const byBranch = useMemo(() => {
    const out: Record<Branch, SkillNode[]> = { steel: [], whisper: [], sigil: [] };
    for (const n of nodes) out[n.branch].push(n);
    return out;
  }, [nodes]);

  async function take(node: SkillNode) {
    setBusy(node.key);
    try {
      const { data, error } = await supabase.functions.invoke("spend-talent", { body: { node_key: node.key } });
      if (error || (data && (data as any).error)) {
        toast.error((data as any)?.error ?? error?.message ?? "Could not take talent");
      } else {
        toast.success(`${node.name} — taken.`);
        await refresh();
        onChanged();
      }
    } finally {
      setBusy(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-5xl bg-card border-ash/40">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl text-parchment flex items-center justify-between">
            <span>The Long Path</span>
            <Badge variant="outline" className="border-amber-400/60 text-amber-200 bg-amber-950/30">
              {talentPoints} talent point{talentPoints === 1 ? "" : "s"}
            </Badge>
          </DialogTitle>
          <DialogDescription className="text-ash/80 italic">
            Small choices, made over many roads. Each one is permanent — the path does not unwalk.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-h-[70vh] overflow-y-auto pr-2">
          {BRANCHES.map((br) => {
            const branchNodes = byBranch[br.key];
            const ownedInBranch = branchNodes.filter((n) => owned.has(n.key));
            return (
              <section key={br.key} className={`border ${br.tone} rounded-md p-3 bg-black/20`}>
                <header className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2 font-display text-lg">
                    {br.icon}<span>{br.name}</span>
                  </div>
                  <span className="text-[10px] uppercase tracking-widest text-ash/60">{ownedInBranch.length}/{branchNodes.length}</span>
                </header>
                <p className="text-xs text-ash/70 italic mb-4">{br.tagline}</p>

                <ol className="space-y-2">
                  {branchNodes.map((node) => {
                    const isOwned = owned.has(node.key);
                    const gate = !isOwned ? gateMessage(node, ownedInBranch) : null;
                    const canTake = !isOwned && !gate && talentPoints > 0;
                    return (
                      <li
                        key={node.key}
                        className={`relative rounded border p-2.5 transition-colors ${
                          isOwned
                            ? "border-amber-400/50 bg-amber-950/20"
                            : gate
                              ? "border-ash/20 bg-black/30 opacity-60"
                              : "border-ash/40 bg-black/30 hover:border-parchment/60"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 text-sm font-medium text-parchment">
                              {isOwned ? <Check className="w-3.5 h-3.5 text-amber-300" /> : gate ? <Lock className="w-3.5 h-3.5 text-ash/60" /> : null}
                              <span>{node.name}</span>
                              {node.tier === 4 && (
                                <Badge variant="outline" className="border-rose-400/60 text-rose-200 text-[9px] px-1 py-0">capstone</Badge>
                              )}
                            </div>
                            <p className="text-[11px] leading-snug text-ash/80 mt-1">{node.description}</p>
                            {gate && <p className="text-[10px] text-ash/60 italic mt-1">{gate}</p>}
                          </div>
                          {!isOwned && (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={!canTake || busy === node.key}
                              onClick={() => take(node)}
                              className="text-[11px] h-7 px-2 shrink-0"
                            >
                              {busy === node.key ? "…" : "Take"}
                            </Button>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </section>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
