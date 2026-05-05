import { useEffect, useState } from "react";
import { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Flame, Loader2, Sparkles } from "lucide-react";

interface Race {
  key: string; name: string; flavor: string;
  gain: string; cost: string; hp_mod: number; sort_order: number;
}

const PROLOGUE = `You wake walking. You have been walking for a long time.

Behind you the dunes have eaten the road. Ahead, a fork: walls of red stone in the north, where torches burn against the falling dark — and to the south, a fat black snake on a sun-warmed rock, watching you, as if it has been waiting.

It tilts its head toward the deep desert and slides away. You follow without knowing why, and the dunes part, and there is water — a still pool, ringed in pale flowers that do not exist anywhere else in the world.

You kneel. The pool reflects you. The reflection waits. It is asking who you mean to be.`;

export default function CharacterCreation({ session, onCreated }: { session: Session; onCreated: () => void }) {
  const [races, setRaces] = useState<Race[]>([]);
  const [chosen, setChosen] = useState<Race | null>(null);
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<"prologue" | "choose">("prologue");

  useEffect(() => {
    supabase.from("races").select("*").order("sort_order")
      .then(({ data }) => setRaces((data ?? []) as Race[]));
  }, []);

  const submit = async () => {
    if (!chosen) { toast.error("Choose a race first."); return; }
    if (description.trim().length < 8) { toast.error("Describe yourself in a sentence or two."); return; }
    setBusy(true);
    try {
      const { error } = await supabase.functions.invoke("create-character", {
        body: { race_key: chosen.key, description },
      });
      if (error) throw error;
      toast.success("The pool stills. You have a face.");
      onCreated();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "The reflection wavers and fades.");
    } finally { setBusy(false); }
  };

  if (step === "prologue") {
    return (
      <div className="min-h-screen flex items-center justify-center px-5 py-12 bg-background">
        <div className="max-w-2xl w-full space-y-8">
          <div className="flex items-center gap-3">
            <Flame className="w-6 h-6 text-ember ember-flicker" />
            <h1 className="font-display text-3xl text-parchment">Before You Were Anyone</h1>
          </div>
          <p className="font-body text-parchment text-lg leading-relaxed whitespace-pre-line">{PROLOGUE}</p>
          <Button onClick={() => setStep("choose")} className="bg-ember hover:bg-ember/90 text-background font-display">
            Look into the water →
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background px-5 py-10">
      <div className="max-w-5xl mx-auto space-y-8">
        <div className="flex items-center gap-3">
          <Sparkles className="w-5 h-5 text-ember ember-flicker" />
          <h1 className="font-display text-3xl text-parchment">The Reflection Waits</h1>
        </div>
        <p className="font-body text-ash italic">Choose your blood. Then describe the face you wish to wear.</p>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {races.map((r) => {
            const active = chosen?.key === r.key;
            return (
              <button key={r.key} onClick={() => setChosen(r)} disabled={busy}
                className={`text-left p-4 border-l-2 transition-all ${
                  active ? "border-ember bg-ember/5 shadow-[0_0_20px_-8px_hsl(var(--ember))]"
                         : "border-border bg-card/30 hover:border-ember/60"
                }`}>
                <div className="font-display text-xl text-parchment mb-1">{r.name}</div>
                <p className="text-sm text-ash italic mb-3">{r.flavor}</p>
                <p className="text-xs text-moss"><span className="text-ash uppercase tracking-wider mr-1">gain</span> {r.gain}</p>
                <p className="text-xs text-ember mt-1"><span className="text-ash uppercase tracking-wider mr-1">cost</span> {r.cost}</p>
              </button>
            );
          })}
        </div>

        {chosen && (
          <div className="space-y-3 border-t border-border pt-6">
            <label className="font-mono text-[11px] uppercase tracking-widest text-ash">
              Describe yourself — face, scars, posture, what you carry, what you hide. The pool listens.
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={600}
              rows={4}
              disabled={busy}
              placeholder={`A ${chosen.name.toLowerCase()} with…`}
              className="w-full bg-card/40 border border-border focus:border-ember outline-none p-3 font-body text-parchment placeholder:text-ash/50 resize-none"
            />
            <div className="flex justify-between items-center">
              <span className="font-mono text-[10px] text-ash">{description.length}/600</span>
              <Button onClick={submit} disabled={busy} className="bg-ember hover:bg-ember/90 text-background font-display">
                {busy ? (<><Loader2 className="w-4 h-4 mr-2 animate-spin" />the pool stirs…</>) : "Become →"}
              </Button>
            </div>
            {busy && <p className="text-xs text-whisper italic">The water draws your face. This may take half a minute.</p>}
          </div>
        )}
      </div>
    </div>
  );
}
