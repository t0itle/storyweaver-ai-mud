import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Lock, Check, Sword, Coins, Sparkles, Flame } from "lucide-react";
import { usePlayerSkills, type SkillNode, type ClassSkillNode } from "@/hooks/usePlayerSkills";

interface Props {
  userId: string | undefined;
  talentPoints: number;
  classKey?: string | null;
  className?: string | null;
  onChanged: () => void;
}

type Branch = "steel" | "whisper" | "sigil";

const BRANCHES: { key: Branch; name: string; tagline: string; tone: string; icon: JSX.Element }[] = [
  { key: "steel",   name: "Steel",   tagline: "body, blade, road",        tone: "border-sky-500/40 text-sky-200/90",      icon: <Sword className="w-4 h-4" /> },
  { key: "whisper", name: "Whisper", tagline: "silver, secrets, sleight", tone: "border-amber-500/40 text-amber-200/90",  icon: <Coins className="w-4 h-4" /> },
  { key: "sigil",   name: "Sigil",   tagline: "runes, kanji, the grain",  tone: "border-rose-500/40 text-rose-200/90",    icon: <Sparkles className="w-4 h-4" /> },
];

function gateMessage(tier: number, ownedInBranchCount: number, ownedInLowerTiers: number): string | null {
  if (tier === 2 && ownedInLowerTiers < 1) return "Take 1 talent in tier 1";
  if (tier === 3 && ownedInLowerTiers < 2) return `Take 2 talents in tier 1–2 (${ownedInLowerTiers}/2)`;
  if (tier === 4 && ownedInBranchCount < 5) return `Requires 5 in this branch (${ownedInBranchCount}/5)`;
  return null;
}

export function SkillTreePanel({ userId, talentPoints, classKey, className, onChanged }: Props) {
  const { nodes, classNodes, owned, ownedClass, refresh } = usePlayerSkills(userId, classKey);
  const [busy, setBusy] = useState<string | null>(null);

  const byBranch = useMemo(() => {
    const out: Record<Branch, SkillNode[]> = { steel: [], whisper: [], sigil: [] };
    for (const n of nodes) out[n.branch].push(n);
    return out;
  }, [nodes]);

  const sortedClassNodes = useMemo(
    () => [...classNodes].sort((a, b) => a.tier - b.tier || a.sort_order - b.sort_order),
    [classNodes],
  );

  async function take(key: string, name: string) {
    setBusy(key);
    try {
      const { data, error } = await supabase.functions.invoke("spend-talent", { body: { node_key: key } });
      if (error || (data && (data as any).error)) {
        toast.error((data as any)?.error ?? error?.message ?? "Could not take talent");
      } else {
        toast.success(`${name} — taken.`);
        await refresh();
        onChanged();
      }
    } finally {
      setBusy(null);
    }
  }

  const renderNode = (
    key: string, tier: number, nodeName: string, description: string, isOwned: boolean,
    gate: string | null, isCapstone: boolean,
  ) => {
    const canTake = !isOwned && !gate && talentPoints > 0;
    return (
      <li
        key={key}
        className={`relative rounded border p-2 transition-colors ${
          isOwned
            ? "border-amber-400/50 bg-amber-950/20"
            : gate
              ? "border-ash/20 bg-black/30 opacity-60"
              : "border-ash/40 bg-black/30 hover:border-parchment/60"
        }`}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 text-xs font-medium text-parchment">
              {isOwned ? <Check className="w-3.5 h-3.5 text-amber-300" /> : gate ? <Lock className="w-3.5 h-3.5 text-ash/60" /> : null}
              <span>{nodeName}</span>
              {isCapstone && (
                <Badge variant="outline" className="border-rose-400/60 text-rose-200 text-[9px] px-1 py-0">capstone</Badge>
              )}
            </div>
            <p className="text-[11px] leading-snug text-ash/80 mt-1">{description}</p>
            {gate && <p className="text-[10px] text-ash/60 italic mt-1">{gate}</p>}
          </div>
          {!isOwned && (
            <Button
              size="sm"
              variant="outline"
              disabled={!canTake || busy === key}
              onClick={() => take(key, nodeName)}
              className="text-[11px] h-7 px-2 shrink-0"
            >
              {busy === key ? "…" : "Take"}
            </Button>
          )}
        </div>
      </li>
    );
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div>
          <h3 className="font-display text-lg text-parchment">The Long Path</h3>
          <p className="text-[11px] text-ash/70 italic">Small choices, made over many roads. Each one is permanent.</p>
        </div>
        <Badge variant="outline" className="border-amber-400/60 text-amber-200 bg-amber-950/30 shrink-0">
          {talentPoints} talent point{talentPoints === 1 ? "" : "s"}
        </Badge>
      </div>

      <div className={`grid grid-cols-1 ${classKey ? "md:grid-cols-2 lg:grid-cols-4" : "md:grid-cols-3"} gap-3`}>
        {BRANCHES.map((br) => {
          const branchNodes = byBranch[br.key];
          const ownedInBranch = branchNodes.filter((n) => owned.has(n.key));
          return (
            <section key={br.key} className={`border ${br.tone} rounded-md p-2.5 bg-black/20`}>
              <header className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2 font-display text-base">
                  {br.icon}<span>{br.name}</span>
                </div>
                <span className="text-[10px] uppercase tracking-widest text-ash/60">{ownedInBranch.length}/{branchNodes.length}</span>
              </header>
              <p className="text-[11px] text-ash/70 italic mb-3">{br.tagline}</p>
              <ol className="space-y-1.5">
                {branchNodes.map((node) => {
                  const isOwned = owned.has(node.key);
                  const inLower = ownedInBranch.filter((n) => n.tier < node.tier).length;
                  const gate = !isOwned ? gateMessage(node.tier, ownedInBranch.length, inLower) : null;
                  return renderNode(node.key, node.tier, node.name, node.description, isOwned, gate, node.tier === 4);
                })}
              </ol>
            </section>
          );
        })}

        {classKey && sortedClassNodes.length > 0 && (
          <section className="border border-emerald-500/40 text-emerald-200/90 rounded-md p-2.5 bg-black/20">
            <header className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 font-display text-base">
                <Flame className="w-4 h-4" /><span>{className ?? "Class"}</span>
              </div>
              <span className="text-[10px] uppercase tracking-widest text-ash/60">
                {sortedClassNodes.filter((n) => ownedClass.has(n.key)).length}/{sortedClassNodes.length}
              </span>
            </header>
            <p className="text-[11px] text-ash/70 italic mb-3">your bloodline of practice</p>
            <ol className="space-y-1.5">
              {sortedClassNodes.map((node) => {
                const isOwned = ownedClass.has(node.key);
                const ownedThisTree = sortedClassNodes.filter((n) => ownedClass.has(n.key));
                const inLower = ownedThisTree.filter((n) => n.tier < node.tier).length;
                const gate = !isOwned ? gateMessage(node.tier, ownedThisTree.length, inLower) : null;
                return renderNode(node.key, node.tier, node.name, node.description, isOwned, gate, node.tier === 4);
              })}
            </ol>
          </section>
        )}
      </div>
    </div>
  );
}
