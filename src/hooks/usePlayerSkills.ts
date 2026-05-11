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

export function usePlayerSkills(userId: string | undefined) {
  const [nodes, setNodes] = useState<SkillNode[]>([]);
  const [owned, setOwned] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!userId) return;
    const [{ data: nd }, { data: ps }] = await Promise.all([
      supabase.from("skill_nodes").select("*").order("branch").order("tier").order("sort_order"),
      supabase.from("player_skills").select("node_key").eq("user_id", userId),
    ]);
    if (nd) setNodes(nd as SkillNode[]);
    if (ps) setOwned(new Set(ps.map((r: any) => r.node_key)));
    setLoading(false);
  }, [userId]);

  useEffect(() => { refresh(); }, [refresh]);

  return { nodes, owned, loading, refresh };
}
