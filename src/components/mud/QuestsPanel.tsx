import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ScrollText, X } from "lucide-react";

interface Quest {
  id: string;
  title: string;
  description: string;
  objective: string;
  status: string;
  severity: string;
  kind: string;
  target_kind: string | null;
  target_ref: string | null;
  giver_npc_name: string;
  reward_gold: number;
  reward_xp: number;
  reward_amity: number;
  reward_item_key: string | null;
  reward_kanji_key: string | null;
  reward_rune_key: string | null;
  offered_room: string | null;
  accepted_at: string | null;
  created_at: string;
}

const SEV_TONE: Record<string, string> = {
  trivial: "text-ash",
  minor: "text-whisper",
  standard: "text-accent",
  major: "text-ember",
  legendary: "text-moss",
};

export function QuestsPanel({ userId, onClose, onChanged }: { userId: string; onClose: () => void; onChanged?: () => void }) {
  const [quests, setQuests] = useState<Quest[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [tab, setTab] = useState<"active" | "offered" | "done">("active");

  const reload = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("quests")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(100);
    setQuests((data ?? []) as Quest[]);
    setLoading(false);
  };

  useEffect(() => { reload(); }, [userId]);

  const act = async (quest_id: string, action: "accept" | "decline" | "abandon") => {
    setBusyId(quest_id);
    try {
      const { data, error } = await supabase.functions.invoke("quest-action", {
        body: { quest_id, action },
      });
      if (error || data?.error) throw new Error(data?.error ?? error?.message);
      toast.success(`Quest ${action}ed.`);
      await reload();
      onChanged?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "no");
    } finally { setBusyId(null); }
  };

  const filtered = quests.filter((q) => {
    if (tab === "active") return q.status === "active";
    if (tab === "offered") return q.status === "offered";
    return ["complete", "failed", "abandoned", "declined"].includes(q.status);
  });

  return (
    <div className="fixed inset-0 z-50 bg-background/85 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card border border-border max-w-2xl w-full max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <ScrollText className="w-4 h-4 text-ember" />
            <h2 className="font-display text-lg text-parchment">Promises &amp; Burdens</h2>
          </div>
          <button onClick={onClose} className="text-ash hover:text-parchment"><X className="w-4 h-4" /></button>
        </div>

        <div className="flex border-b border-border text-xs font-mono">
          {(["active","offered","done"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`flex-1 px-3 py-2 uppercase tracking-widest ${tab === t ? "text-ember border-b border-ember" : "text-ash hover:text-parchment"}`}>
              {t} ({quests.filter(q =>
                t === "active" ? q.status === "active"
                : t === "offered" ? q.status === "offered"
                : ["complete","failed","abandoned","declined"].includes(q.status)).length})
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-thin px-5 py-4 space-y-3">
          {loading && <div className="text-ash italic text-sm">Gathering your debts…</div>}
          {!loading && filtered.length === 0 && (
            <div className="text-ash italic text-sm">Nothing here. {tab === "active" ? "No one has set you a task." : tab === "offered" ? "No standing offers." : "Your ledger is clean."}</div>
          )}
          {filtered.map((q) => (
            <div key={q.id} className="border border-border p-3 bg-background/40">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-display text-base text-parchment leading-tight">{q.title}</div>
                  <div className="font-mono text-[10px] uppercase tracking-widest text-ash mt-0.5">
                    <span className={SEV_TONE[q.severity] ?? ""}>{q.severity}</span> · {q.kind} · from {q.giver_npc_name}
                  </div>
                </div>
                <div className="text-[10px] font-mono text-ash text-right shrink-0">
                  {q.reward_gold > 0 && <div className="text-parchment">⚜ {q.reward_gold}g</div>}
                  {q.reward_xp > 0 && <div className="text-accent">✦ {q.reward_xp}xp</div>}
                  {q.reward_amity > 0 && <div className="text-moss">❖ {q.reward_amity}</div>}
                  {(q.reward_item_key || q.reward_rune_key || q.reward_kanji_key) && <div className="text-ember">+ token</div>}
                </div>
              </div>
              {q.description && <p className="text-sm text-whisper italic mt-2">{q.description}</p>}
              <p className="text-sm text-parchment mt-1"><span className="text-ash">›</span> {q.objective}</p>

              <div className="flex gap-2 mt-3">
                {q.status === "offered" && (
                  <>
                    <button disabled={busyId === q.id} onClick={() => act(q.id, "accept")}
                      className="text-xs font-mono px-3 py-1 border border-ember text-ember hover:bg-ember/10 transition-colors disabled:opacity-50">
                      accept
                    </button>
                    <button disabled={busyId === q.id} onClick={() => act(q.id, "decline")}
                      className="text-xs font-mono px-3 py-1 border border-border text-ash hover:text-parchment hover:border-whisper transition-colors disabled:opacity-50">
                      decline
                    </button>
                  </>
                )}
                {q.status === "active" && (
                  <button disabled={busyId === q.id} onClick={() => act(q.id, "abandon")}
                    className="text-xs font-mono px-3 py-1 border border-border text-ash hover:text-ember hover:border-ember transition-colors disabled:opacity-50">
                    abandon
                  </button>
                )}
                {q.status !== "offered" && q.status !== "active" && (
                  <span className="text-[10px] font-mono uppercase tracking-widest text-ash">{q.status}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
