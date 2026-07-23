import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export type SkillNode = {
  key: string;
  branch: "steel" | "whisper" | "sigil";
  tier: number;
  sort_order: number;
  name: string;
  description: string;
  effect: Record<string, unknown>;
};

export type ClassSkillNode = {
  key: string;
  class_key: string;
  tier: number;
  sort_order: number;
  name: string;
  description: string;
  effect: Record<string, unknown>;
};

export function usePlayerSkills(userId: string | undefined, classKey?: string | null) {
  const [nodes, setNodes] = useState<SkillNode[]>([]);
  const [classNodes, setClassNodes] = useState<ClassSkillNode[]>([]);
  const [owned, setOwned] = useState<Set<string>>(new Set());
  const [ownedClass, setOwnedClass] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!userId) return;
    const results = await Promise.all([
      supabase.from("skill_nodes").select("*").order("branch").order("tier").order("sort_order"),
      supabase.from("player_skills").select("node_key").eq("user_id", userId),
      classKey
        ? supabase.from("class_skill_nodes").select("*").eq("class_key", classKey).order("tier").order("sort_order")
        : Promise.resolve({ data: [] as ClassSkillNode[] }),
      supabase.from("player_class_skills").select("node_key").eq("user_id", userId),
    ]);
    const [nd, ps, cn, pcs] = results as any[];
    if (nd?.data) setNodes(nd.data as SkillNode[]);
    if (ps?.data) setOwned(new Set(ps.data.map((r: any) => r.node_key)));
    setClassNodes((cn?.data ?? []) as ClassSkillNode[]);
    if (pcs?.data) setOwnedClass(new Set(pcs.data.map((r: any) => r.node_key)));
    setLoading(false);
  }, [userId, classKey]);

  useEffect(() => { refresh(); }, [refresh]);

  return { nodes, classNodes, owned, ownedClass, loading, refresh };
}
