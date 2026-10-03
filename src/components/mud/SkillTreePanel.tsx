import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Lock, Sword, Coins, Sparkles, Flame } from "lucide-react";
import { usePlayerSkills, type SkillNode, type ClassSkillNode } from "@/hooks/usePlayerSkills";

interface Props {
  userId: string | undefined;
  talentPoints: number;
  classKey?: string | null;
  className?: string | null;
  onChanged: () => void;
}

type Branch = "steel" | "whisper" | "sigil";

type Accent = {
  heading: string;
  headerRule: string;
  ownedBar: string;
  ownedBorder: string;
  ownedHover: string;
  takeBtn: string;
  cardHover: string;
  hoverGlow: string;
  hoverTitle: string;
};

const BRANCHES: { key: Branch; name: string; tagline: string; icon: JSX.Element; accent: Accent }[] = [
  {
    key: "steel", name: "Steel", tagline: "body, blade, road", icon: <Sword className="w-3.5 h-3.5" />,
    accent: {
      heading: "text-sky-300/90",
      headerRule: "border-sky-800/40",
      ownedBar: "border-sky-800/50 bg-sky-950/30 text-sky-300",
      ownedBorder: "border-l-2 border-sky-500/70",
      ownedHover: "hover:bg-sky-950/20",
      takeBtn: "bg-secondary hover:bg-sky-700 text-parchment",
      cardHover: "hover:border-sky-700/70",
      hoverGlow: "hover:shadow-[0_0_15px_rgba(56,189,248,0.10)]",
      hoverTitle: "group-hover:text-sky-100",
    },
  },
  {
    key: "whisper", name: "Whisper", tagline: "silver, secrets, sleight", icon: <Coins className="w-3.5 h-3.5" />,
    accent: {
      heading: "text-amber-300/90",
      headerRule: "border-amber-800/40",
      ownedBar: "border-amber-800/50 bg-amber-950/30 text-amber-300",
      ownedBorder: "border-l-2 border-amber-500/70",
      ownedHover: "hover:bg-amber-950/20",
      takeBtn: "bg-secondary hover:bg-amber-700 text-parchment",
      cardHover: "hover:border-amber-700/70",
      hoverGlow: "hover:shadow-[0_0_15px_rgba(251,191,36,0.10)]",
      hoverTitle: "group-hover:text-amber-100",
    },
  },
  {
    key: "sigil", name: "Sigil", tagline: "runes, kanji, the grain", icon: <Sparkles className="w-3.5 h-3.5" />,
    accent: {
      heading: "text-rose-300/90",
      headerRule: "border-rose-800/40",
      ownedBar: "border-rose-800/50 bg-rose-950/30 text-rose-300",
      ownedBorder: "border-l-2 border-rose-500/70",
      ownedHover: "hover:bg-rose-950/20",
      takeBtn: "bg-secondary hover:bg-rose-700 text-parchment",
      cardHover: "hover:border-rose-700/70",
      hoverGlow: "hover:shadow-[0_0_15px_rgba(251,113,133,0.10)]",
      hoverTitle: "group-hover:text-rose-100",
    },
  },
];

const CLASS_ACCENT: Accent = {
  heading: "text-emerald-300/90",
  headerRule: "border-emerald-800/40",
  ownedBar: "border-emerald-800/50 bg-emerald-950/30 text-emerald-300",
  ownedBorder: "border-l-2 border-emerald-500/70",
  ownedHover: "hover:bg-emerald-950/20",
  takeBtn: "bg-secondary hover:bg-emerald-700 text-parchment",
  cardHover: "hover:border-emerald-700/70",
  hoverGlow: "hover:shadow-[0_0_15px_rgba(52,211,153,0.10)]",
  hoverTitle: "group-hover:text-emerald-100",
};

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
    gate: string | null, canAfford: boolean, accent: Accent,
  ) => {
    const canTake = !isOwned && !gate && canAfford;
    return (
      <li
        key={key}
        className={`group relative p-4 transition-all duration-300 ${
          isOwned
            ? `bg-black/20 border border-border ${accent.ownedBorder} ${accent.ownedHover}`
            : gate
              ? "bg-black/40 border border-border/50 opacity-40 grayscale select-none"
              : `bg-card/60 border border-border ${accent.cardHover} ${accent.hoverGlow}`
        }`}
      >
        <div className="flex justify-between items-start gap-2 mb-2">
          <h4
            className={`font-display font-bold tracking-wide uppercase text-xs leading-snug ${
              isOwned ? "text-parchment" : gate ? "text-ash/60" : `text-parchment/80 ${accent.hoverTitle}`
            }`}
          >
            {nodeName}
          </h4>
          <span className="text-[9px] uppercase tracking-[0.2em] text-ash/50 shrink-0 font-mono mt-0.5">T{tier}</span>
        </div>
        <p className={`text-[11px] leading-relaxed mb-3 font-body ${gate ? "text-ash/50" : "text-ash/80"}`}>
          {description}
        </p>
        {isOwned ? (
          <div className={`h-7 flex items-center justify-center border text-[10px] uppercase tracking-[0.2em] font-mono ${accent.ownedBar}`}>
            Owned
          </div>
        ) : gate ? (
          <>
            <div className="h-7 w-full border border-border/50 bg-black/40 flex items-center justify-center text-ash/50 text-[10px] uppercase tracking-[0.2em] font-mono cursor-not-allowed">
              <Lock className="w-3 h-3 mr-1.5" /> Locked
            </div>
            <p className="text-[10px] text-ash/60 italic mt-1.5 font-body">{gate}</p>
          </>
        ) : (
          <button
            disabled={!canTake || busy === key}
            onClick={() => take(key, nodeName)}
            className={`w-full h-7 text-[10px] uppercase tracking-[0.2em] font-mono transition-colors duration-300 disabled:opacity-40 disabled:cursor-not-allowed ${accent.takeBtn} border border-border`}
          >
            {busy === key ? "…" : canAfford ? "Take" : "No points"}
          </button>
        )}
      </li>
    );
  };

  const renderBranch = (
    name: string, tagline: string, icon: JSX.Element,
    branchNodes: { key: string; tier: number; name: string; description: string }[],
    ownedSet: Set<string>, accent: Accent,
  ) => {
    const ownedCount = branchNodes.filter((n) => ownedSet.has(n.key)).length;
    return (
      <section className="space-y-3">
        <header className={`border-b ${accent.headerRule} pb-2`}>
          <div className="flex items-center justify-between">
            <h2 className={`font-display text-sm font-bold uppercase tracking-[0.2em] flex items-center gap-1.5 ${accent.heading}`}>
              {icon}{name}
            </h2>
            <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-ash/60">
              {ownedCount}/{branchNodes.length}
            </span>
          </div>
          <p className="text-[10px] text-ash/60 italic font-body mt-0.5">{tagline}</p>
        </header>
        <ol className="space-y-3">
          {branchNodes.map((node) => {
            const isOwned = ownedSet.has(node.key);
            const ownedThisTree = branchNodes.filter((n) => ownedSet.has(n.key));
            const inLower = ownedThisTree.filter((n) => n.tier < node.tier).length;
            const gate = !isOwned ? gateMessage(node.tier, ownedThisTree.length, inLower) : null;
            return renderNode(node.key, node.tier, node.name, node.description, isOwned, gate, talentPoints > 0, accent);
          })}
        </ol>
      </section>
    );
  };

  return (
    <div className="border-x border-border bg-black/20 pb-2">
      {/* Header */}
      <div className="text-center pt-6 pb-5 border-b border-border/60 mb-5 px-6">
        <h3 className="font-display text-2xl tracking-[0.2em] text-parchment/85 uppercase font-bold">The Long Path</h3>
        <div className="h-px w-24 mx-auto mt-3 bg-gradient-to-r from-transparent via-ember/70 to-transparent" />
        <p className="text-[11px] text-ash/70 italic font-body mt-3">Small choices, made over many roads. Each one is permanent.</p>
        <div className="mt-3">
          <Badge variant="outline" className="border-amber-400/60 text-amber-200 bg-amber-950/30 font-mono tracking-[0.15em]">
            {talentPoints} unspent talent point{talentPoints === 1 ? "" : "s"}
          </Badge>
        </div>
      </div>

      {/* Tree */}
      <div className={`grid grid-cols-1 ${classKey && sortedClassNodes.length > 0 ? "md:grid-cols-2 lg:grid-cols-4" : "md:grid-cols-3"} gap-6 px-6`}>
        {BRANCHES.map((br) => renderBranch(br.name, br.tagline, br.icon, byBranch[br.key], owned, br.accent))}

        {classKey && sortedClassNodes.length > 0 && (
          <>{renderBranch(className ?? "Class", "your bloodline of practice", <Flame className="w-3.5 h-3.5" />, sortedClassNodes, ownedClass, CLASS_ACCENT)}</>
        )}
      </div>

      {/* Footer stats */}
      <div className="mt-6 mx-6 pt-4 border-t border-border/60 flex flex-wrap justify-between items-center gap-2 text-[10px] uppercase tracking-[0.25em] font-mono text-ash/50">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          {BRANCHES.map((br) => {
            const total = byBranch[br.key].length;
            const ownedCount = byBranch[br.key].filter((n) => owned.has(n.key)).length;
            const pct = total ? Math.round((ownedCount / total) * 100) : 0;
            return (
              <span key={br.key}>
                {br.name} <span className="text-parchment/70">{pct}%</span>
              </span>
            );
          })}
        </div>
        <span className={talentPoints > 0 ? "text-amber-300/80 font-bold" : ""}>
          {talentPoints} point{talentPoints === 1 ? "" : "s"} unspent
        </span>
      </div>
    </div>
  );
}
