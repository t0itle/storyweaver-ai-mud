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
  const [tab, setTab] = useState<"active" | "offered" | "vows" | "done">("active");
  const [vow, setVow] = useState<{ kind: "aether" | "chaos"; data: any } | null>(null);
  const [vowBusy, setVowBusy] = useState(false);
  const [targetAether, setTargetAether] = useState<string>("");
  const [onboardingStep, setOnboardingStep] = useState<number>(5);
  const [onboardingHint, setOnboardingHint] = useState<string>("");

  const reload = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("quests")
      .select("id,user_id,giver_npc_id,giver_npc_name,title,description,objective,status,severity,kind,target_kind,target_ref,reward_gold,reward_xp,reward_amity,reward_item_key,reward_rune_key,reward_kanji_key,offered_room,accepted_at,completed_at,expires_at,created_at,updated_at,escort_npc_id,source_guild,source_guild_town,is_initiation,attempts")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(100);
    setQuests((data ?? []) as Quest[]);

    // Onboarding progress (First Walker chain)
    const { data: onb } = await supabase.functions.invoke("onboarding-tick", { body: { action: "list" } });
    if (onb && !onb.error) {
      setOnboardingStep(onb.step ?? 5);
      setOnboardingHint(onb.hint ?? "");
    }

    // Pull active vow chain (Aether → Light, otherwise check chaos).
    const { data: profile } = await supabase.from("profiles").select("faction, aether").eq("id", userId).maybeSingle();
    if (profile?.faction === "aether" && profile.aether) {
      const { data } = await supabase.functions.invoke("aether-loyalty-action", { body: { action: "list" } });
      if (data && !data.error) setVow({ kind: "aether", data });
    } else if (profile?.faction === "chaos") {
      const { data } = await supabase.functions.invoke("chaos-path-action", { body: { action: "list" } });
      if (data && !data.error) setVow({ kind: "chaos", data });
    } else {
      setVow(null);
    }
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
          {(["active","offered","vows","done"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`flex-1 px-3 py-2 uppercase tracking-widest ${tab === t ? "text-ember border-b border-ember" : "text-ash hover:text-parchment"}`}>
              {t === "vows"
                ? `vows${vow ? " ●" : ""}`
                : `${t} (${quests.filter(q =>
                    t === "active" ? q.status === "active"
                    : t === "offered" ? q.status === "offered"
                    : ["complete","failed","abandoned","declined"].includes(q.status)).length})`}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-thin px-5 py-4 space-y-3">
          {loading && <div className="text-ash italic text-sm">Gathering your debts…</div>}

          {!loading && tab === "vows" && (
            <>
              {onboardingStep < 5 && (
                <div className="border border-moss/40 p-3 bg-moss/5 mb-2">
                  <div className="font-mono text-[10px] uppercase tracking-widest text-ash">First Steps — the shore rune</div>
                  <div className="font-display text-base text-parchment mt-1">
                    Step {onboardingStep} of 4
                  </div>
                  <p className="text-sm text-whisper italic mt-1">{onboardingHint}</p>
                </div>
              )}
              <VowsView
                vow={vow}
                busy={vowBusy}
                targetAether={targetAether}
                setTargetAether={setTargetAether}
                onAdvance={async () => {
                  if (!vow) return;
                  setVowBusy(true);
                  try {
                    const fn = vow.kind === "aether" ? "aether-loyalty-action" : "chaos-path-action";
                    const body: Record<string, unknown> = { action: "advance" };
                    if (vow.kind === "chaos" && vow.data?.current_step === 6 && targetAether) body.target_aether_key = targetAether;
                    const { data, error } = await supabase.functions.invoke(fn, { body });
                    if (error || data?.error) throw new Error(data?.error ?? error?.message);
                    toast.success(data?.isFinal ? "The vow is sealed." : "A step is fulfilled.");
                    await reload();
                    onChanged?.();
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : "no");
                  } finally { setVowBusy(false); }
                }}
              />
            </>
          )}

          {!loading && tab !== "vows" && filtered.length === 0 && (
            <div className="text-ash italic text-sm">Nothing here. {tab === "active" ? "No one has set you a task." : tab === "offered" ? "No standing offers." : "Your ledger is clean."}</div>
          )}
          {tab !== "vows" && (<>

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
          </>)}
        </div>
      </div>
    </div>
  );
}

const AETHER_KEYS = ["solastin","khalvaris","nyxara","thalvora","lazareth","velithria","morvayne"];

function VowsView({
  vow, busy, targetAether, setTargetAether, onAdvance,
}: {
  vow: { kind: "aether" | "chaos"; data: any } | null;
  busy: boolean;
  targetAether: string;
  setTargetAether: (v: string) => void;
  onAdvance: () => void;
}) {
  if (!vow) {
    return (
      <div className="text-ash italic text-sm">
        You walk under no vow. Kneel at the Hall of the Seven to swear to an Aether — or cry *Non Serviam* in the open world to bind yourself to Chaos.
      </div>
    );
  }

  if (vow.kind === "aether") {
    const { aether, steps, current, current_step, loyalty, canAdvance } = vow.data;
    if (!current) {
      return (
        <div className="border border-moss/40 p-4 bg-moss/5 space-y-2">
          <div className="font-display text-lg text-moss">Devout of {aether?.name}</div>
          <p className="text-sm text-whisper italic">You have walked the full chain. The Aether knows your name.</p>
        </div>
      );
    }
    return (
      <div className="space-y-3">
        <div className="border border-ember/40 p-4 bg-ember/5">
          <div className="font-mono text-[10px] uppercase tracking-widest text-ash">Vow of {aether?.name} — Step {current_step} of {steps?.length}</div>
          <div className="font-display text-lg text-parchment mt-1">{current.title}</div>
          <p className="text-sm text-parchment mt-1"><span className="text-ash">›</span> {current.objective}</p>
          {current.flavor && <p className="text-xs text-whisper italic mt-2">{current.flavor}</p>}
          <div className="flex items-center justify-between mt-3">
            <div className="text-[10px] font-mono text-ash">
              {current.reward_gold > 0 && <>⚜ {current.reward_gold}g · </>}
              {current.reward_xp > 0 && <>✦ {current.reward_xp}xp · </>}
              {current.reward_merit > 0 && <>❖ {current.reward_merit} merit</>}
            </div>
            <button disabled={busy || !canAdvance} onClick={onAdvance}
              className="text-xs font-mono px-3 py-1 border border-ember text-ember hover:bg-ember/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
              {canAdvance ? "fulfill" : "not yet"}
            </button>
          </div>
        </div>
        <div className="text-[10px] font-mono text-ash uppercase tracking-widest">The chain</div>
        <ol className="space-y-1">
          {(steps as any[])?.map((s) => (
            <li key={s.step_index} className={`text-xs font-mono ${s.step_index < current_step ? "text-moss" : s.step_index === current_step ? "text-parchment" : "text-ash"}`}>
              {s.step_index < current_step ? "✓" : s.step_index === current_step ? "›" : "·"} {s.title}
            </li>
          ))}
        </ol>
      </div>
    );
  }

  // CHAOS
  const { steps, current, current_step, path, canAdvance } = vow.data;
  if (!current) {
    return (
      <div className="border border-ember/40 p-4 bg-ember/5 space-y-2">
        <div className="font-display text-lg text-ember">Crown of Refusal</div>
        <p className="text-sm text-whisper italic">The chain is finished. You wear no name the Aethers can call.</p>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <div className="border border-ember/40 p-4 bg-ember/5">
        <div className="font-mono text-[10px] uppercase tracking-widest text-ash">Chain of Refusal — Step {current_step} of {steps?.length}</div>
        <div className="font-display text-lg text-parchment mt-1">{current.title}</div>
        <p className="text-sm text-parchment mt-1"><span className="text-ash">›</span> {current.objective}</p>
        {current.flavor && <p className="text-xs text-whisper italic mt-2">{current.flavor}</p>}
        {current_step === 6 && !path?.target_aether_key && (
          <div className="mt-3">
            <div className="text-[10px] font-mono text-ash uppercase mb-1">Choose an Aether to topple</div>
            <select value={targetAether} onChange={(e) => setTargetAether(e.target.value)}
              className="bg-background border border-border text-parchment text-xs font-mono px-2 py-1">
              <option value="">— pick one —</option>
              {AETHER_KEYS.map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
          </div>
        )}
        <div className="flex items-center justify-between mt-3">
          <div className="text-[10px] font-mono text-ash">
            {current.reward_gold > 0 && <>⚜ {current.reward_gold}g · </>}
            {current.reward_xp > 0 && <>✦ {current.reward_xp}xp · </>}
            {current.reward_merit > 0 && <>❖ {current.reward_merit} merit</>}
          </div>
          <button disabled={busy || !canAdvance || (current_step === 6 && !path?.target_aether_key && !targetAether)} onClick={onAdvance}
            className="text-xs font-mono px-3 py-1 border border-ember text-ember hover:bg-ember/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
            {canAdvance ? "fulfill" : "not yet"}
          </button>
        </div>
      </div>
      <div className="text-[10px] font-mono text-ash uppercase tracking-widest">The chain</div>
      <ol className="space-y-1">
        {(steps as any[])?.map((s) => (
          <li key={s.index} className={`text-xs font-mono ${s.index < current_step ? "text-moss" : s.index === current_step ? "text-parchment" : "text-ash"}`}>
            {s.index < current_step ? "✓" : s.index === current_step ? "›" : "·"} {s.title}
          </li>
        ))}
      </ol>
    </div>
  );
}

