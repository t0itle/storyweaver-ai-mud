import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Footprints, X } from "lucide-react";
import { combatFx } from "./combatFx";

// First Steps — a compact sidebar checklist that walks new players through the
// systems that keep them alive. Server-validated; auto-refreshes as the player
// does things (moves rooms, wins fights, learns runes).

interface StepInfo { index: number; title: string; objective: string; hint: string; }
interface OnboardingState {
  steps: StepInfo[];
  current: StepInfo | null;
  current_step: number | null;
  canAdvance: boolean;
  status: string;
}

export function FirstSteps({ refreshKey }: { refreshKey: string }) {
  const [state, setState] = useState<OnboardingState | null>(null);
  const [busy, setBusy] = useState(false);
  const [gone, setGone] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data, error } = await supabase.functions.invoke("onboarding-action", { body: { action: "list" } });
      if (error || !data || data.error) return;
      const status = data.progress?.status ?? "active";
      if (status !== "active") { setGone(true); return; }
      setState({
        steps: data.steps ?? [],
        current: data.current ?? null,
        current_step: data.current_step ?? null,
        canAdvance: !!data.canAdvance,
        status,
      });
    } catch { /* the widget is optional — never block the game on it */ }
  }, []);

  // Re-check whenever something relevant changes (room, combat, runes).
  useEffect(() => { if (!gone) load(); }, [load, refreshKey, gone]);

  const advance = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("onboarding-action", { body: { action: "advance" } });
      if (error || data?.error) throw new Error(data?.error ?? error?.message);
      combatFx.success();
      if (data?.isFinal) {
        toast.success(`✦ First steps complete — +${data.reward?.gold ?? 0}g, +${data.reward?.xp ?? 0}xp`);
        setGone(true);
      } else {
        toast.success("A step taken.");
        await load();
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Not yet.");
    } finally { setBusy(false); }
  };

  const dismiss = async () => {
    setGone(true);
    supabase.functions.invoke("onboarding-action", { body: { action: "dismiss" } }).catch(() => null);
  };

  if (gone || !state?.current) return null;

  return (
    <div className="border border-moss/40 bg-moss/5 p-3">
      <div className="flex items-center justify-between mb-1.5">
        <h3 className="font-mono text-[10px] uppercase tracking-widest text-moss flex items-center gap-1.5">
          <Footprints className="w-3 h-3" /> First Steps · {state.current_step}/{state.steps.length}
        </h3>
        <button onClick={dismiss} className="text-ash/60 hover:text-parchment" title="I know these sands — hide this">
          <X className="w-3 h-3" />
        </button>
      </div>
      <div className="font-display text-sm text-parchment">{state.current.title}</div>
      <p className="text-xs text-whisper mt-0.5">{state.current.objective}</p>
      <p className="text-[10px] text-ash italic mt-1">{state.current.hint}</p>
      <div className="flex items-center justify-between mt-2">
        <div className="flex gap-1">
          {state.steps.map((s) => (
            <span key={s.index}
              className={`w-1.5 h-1.5 rounded-full ${s.index < (state.current_step ?? 0) ? "bg-moss" : s.index === state.current_step ? "bg-ember animate-pulse" : "bg-border"}`} />
          ))}
        </div>
        <button
          disabled={busy}
          onClick={advance}
          className={`text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 border transition-colors disabled:opacity-30 ${
            state.canAdvance
              ? "border-ember text-ember hover:bg-ember/10 animate-pulse"
              : "border-moss/40 text-moss/70 hover:bg-moss/10"
          }`}
          title={state.canAdvance ? "The step is done — claim it" : "Try anyway — the world will tell you what's missing"}
        >
          step forward
        </button>
      </div>
    </div>
  );
}
