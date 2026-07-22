import { useEffect, useState } from "react";
import { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Loader2, Sparkles } from "lucide-react";
import desertBackdrop from "@/assets/desert-distant-city.jpg";

interface Race {
  key: string; name: string; flavor: string;
  gain: string; cost: string; hp_mod: number; sort_order: number;
}

type Direction = "north" | "south";

type Gender = "woman" | "man";

const GENDER_OPTIONS: { key: Gender; label: string; pronoun: string }[] = [
  { key: "woman", label: "Woman", pronoun: "she/her" },
  { key: "man", label: "Man", pronoun: "he/him" },
];

interface AdLibField {
  key: string;
  label: string;
  prompt: string;
  placeholder: string;
  template: (v: string) => string;
}

const AD_LIB_FIELDS: AdLibField[] = [
  { key: "build", label: "build", prompt: "Your build is", placeholder: "e.g. lean and rope-thin",
    template: (v) => `${v.trim()} of build` },
  { key: "hair", label: "hair", prompt: "Your hair is", placeholder: "e.g. sun-bleached and braided",
    template: (v) => `with ${v.trim()} hair` },
  { key: "eyes", label: "eyes", prompt: "Your eyes are", placeholder: "e.g. the colour of cold tea",
    template: (v) => `eyes ${v.trim()}` },
  { key: "mark", label: "a mark", prompt: "You bear", placeholder: "e.g. a crescent scar across one cheek",
    template: (v) => `bearing ${v.trim()}` },
  { key: "carries", label: "carry", prompt: "You carry", placeholder: "e.g. a bone flute and a half-empty waterskin",
    template: (v) => `carrying ${v.trim()}` },
  { key: "hides", label: "hide", prompt: "You hide", placeholder: "e.g. a name you will not say aloud",
    template: (v) => `hiding ${v.trim()}` },
];

export default function CharacterCreation({ session, onCreated }: { session: Session; onCreated: () => void }) {
  const [races, setRaces] = useState<Race[]>([]);
  const [chosen, setChosen] = useState<Race | null>(null);
  const [gender, setGender] = useState<Gender | null>(null);
  const [adlib, setAdlib] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<"direction" | "choose">("direction");
  const [direction, setDirection] = useState<Direction | null>(null);
  const [name, setName] = useState("");

  const buildDescription = (): string => {
    if (!chosen || !gender) return "";
    const parts = AD_LIB_FIELDS
      .map((f) => (adlib[f.key]?.trim() ? f.template(adlib[f.key]) : null))
      .filter(Boolean) as string[];
    return `A ${gender} of ${chosen.name} blood, ${parts.join(", ")}.`;
  };

  useEffect(() => {
    supabase.from("races").select("*").order("sort_order")
      .then(({ data }) => setRaces((data ?? []) as Race[]));
    supabase.from("profiles").select("username").eq("id", session.user.id).maybeSingle()
      .then(({ data }) => {
        const u = (data?.username ?? "").trim();
        // Pre-fill only if it doesn't look like an auto-generated email-prefix name
        if (u && !/^[a-z0-9.+_-]+$/.test(u)) setName(u);
      });
  }, [session.user.id]);

  const submit = async () => {
    if (!chosen) { toast.error("Choose a race first."); return; }
    if (!gender) { toast.error("Choose a gender first."); return; }
    if (name.trim().length < 2) { toast.error("Speak a name — at least two letters."); return; }
    const filled = AD_LIB_FIELDS.filter((f) => (adlib[f.key]?.trim().length ?? 0) >= 2).length;
    if (filled < 3) { toast.error("Fill in at least three details — the pool needs a face."); return; }
    const description = buildDescription();
    setBusy(true);
    try {
      const { error } = await supabase.functions.invoke("create-character", {
        body: { race_key: chosen.key, description, direction, name: name.trim() },
      });
      if (error) throw error;

      let createdReady = false;
      for (let attempt = 0; attempt < 8; attempt += 1) {
        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("id, created")
          .eq("id", session.user.id)
          .maybeSingle();

        if (profileError) throw profileError;
        if (profile?.created) {
          createdReady = true;
          break;
        }

        await new Promise((resolve) => setTimeout(resolve, 400));
      }

      if (!createdReady) {
        throw new Error("Your reflection formed, but the road did not open. Try once more.");
      }

      toast.success(direction === "south"
        ? "You stand up. The dunes wait."
        : "You stand up. The road waits.");
      onCreated();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "The reflection wavers and fades.");
    } finally { setBusy(false); }
  };

  if (step === "direction") {
    return (
      <div className="min-h-screen relative overflow-hidden bg-background">
        {/* Mysterious backdrop: desert, distant unnamed city on the horizon */}
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${desertBackdrop})` }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-background/40 via-background/20 to-background/95" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_30%,hsl(var(--background))_95%)]" />

        <div className="relative min-h-screen flex flex-col justify-end px-5 py-10 sm:py-14">
          <div className="max-w-2xl mx-auto w-full space-y-6 animate-fade-in">
            <div className="space-y-3">
              <p className="font-mono text-[10px] uppercase tracking-[0.5em] text-ember/80">— A wind crosses your back —</p>
              <h1 className="font-display text-3xl sm:text-4xl text-parchment leading-tight drop-shadow-[0_2px_18px_hsl(var(--background))]">
                There is sand in your teeth and you cannot remember the road behind you.
              </h1>
              <p className="font-body text-parchment/90 text-base sm:text-lg leading-relaxed drop-shadow-[0_2px_12px_hsl(var(--background))]">
                Far ahead, something is burning on the horizon — towers, watch-fires, you cannot say.
                Behind you the dunes have already closed over your tracks.
                Whichever way you go, you will go without a name.
              </p>
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              <button
                onClick={() => { setDirection("north"); setStep("choose"); }}
                className="group text-left p-4 border-l-2 border-ember/40 bg-background/60 backdrop-blur-sm hover:border-ember active:scale-[0.98] transition-all touch-manipulation"
              >
                <div className="font-display text-lg text-parchment group-hover:text-ember mb-1">Walk toward the fires →</div>
                <p className="text-sm text-ash italic">Whatever burns out there has not gone out yet. It might be a city. It might be a warning.</p>
              </button>
              <button
                onClick={() => { setDirection("south"); setStep("choose"); }}
                className="group text-left p-4 border-l-2 border-ember/40 bg-background/60 backdrop-blur-sm hover:border-ember active:scale-[0.98] transition-all touch-manipulation"
              >
                <div className="font-display text-lg text-parchment group-hover:text-ember mb-1">Turn from them →</div>
                <p className="text-sm text-ash italic">The deeper desert is silent and unmapped. No one out here will know your face. Maybe that is what you need.</p>
              </button>
            </div>

            <p className="font-mono text-[10px] text-whisper text-center tracking-widest">choose, then the pool will draw your face</p>
          </div>
        </div>
      </div>
    );
  }

  const isNorth = direction === "north";
  const headline = isNorth ? "At the Roadside Well" : "At the Crescent Verge";
  const leadIn = isNorth
    ? "You step off the cracked road. A shallow well at the verge has caught a hand's-breadth of clear water — the first you have seen since the dunes. The watch-fires of the First City flicker in the heat-shimmer to the north. The Veiled will ask your name at the gate. Better to know it before they do."
    : "The last cairn of the Ash Road leans crooked behind you. South of here the maps go blank — only the caravan road and, beyond it, dunes that fold over themselves until even the sun gets the directions wrong. Travellers who stray off-road have been known to walk for days without crossing a single footprint but their own. Out here there is no one to name you. Better to know your own face before the desert rearranges it.";
  const submitLabel = isNorth ? "Walk to the Gate →" : "Step into the Dunes →";
  const submitWaiting = isNorth ? "the gate-bells are ringing…" : "the wind takes your shape…";

  return (
    <div className="min-h-screen bg-background px-4 sm:px-5 py-8 sm:py-10">
      <div className="max-w-5xl mx-auto space-y-6 sm:space-y-8">
        <div className="flex items-center gap-3">
          <Sparkles className="w-5 h-5 text-ember ember-flicker shrink-0" />
          <h1 className="font-display text-2xl sm:text-3xl text-parchment leading-tight">{headline}</h1>
        </div>
        <div className="border-l-2 border-ember/60 pl-4 py-1">
          <p className="font-body text-parchment text-sm sm:text-base leading-relaxed">{leadIn}</p>
          <p className="font-body text-ash italic text-sm sm:text-base mt-3">
            {isNorth
              ? "Kneel. Look into the water. Choose your blood, then fit the missing words — the well will paint the rest."
              : "Kneel. Look into the rain-pool. Choose your blood, then fit the missing words — the stone will paint the rest."}
          </p>
        </div>

        <div className="space-y-2">
          <label className="font-mono text-[11px] uppercase tracking-widest text-ash">
            Speak your name {name.trim().length >= 2 && <span className="text-ember normal-case tracking-normal">— {name.trim()} ✓</span>}
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value.slice(0, 32))}
            disabled={busy}
            placeholder="e.g. Caelin Ash-walker"
            maxLength={32}
            className="w-full bg-card/40 border border-border focus:border-ember outline-none p-2 font-body text-parchment placeholder:text-ash/40 text-sm"
          />
          <p className="font-body text-[11px] text-ash/70 italic">
            {isNorth ? "The Veiled will write this above the gate." : "The desert will whisper this back to you on still nights."}
          </p>
        </div>

        <div>
          <div className="font-mono text-[11px] uppercase tracking-widest text-ash mb-2">
            Choose your blood {chosen && <span className="text-ember normal-case tracking-normal">— {chosen.name} chosen ✓</span>}
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {races.map((r) => {
              const active = chosen?.key === r.key;
              return (
                <button key={r.key} onClick={() => setChosen(r)} disabled={busy}
                  aria-pressed={active}
                  className={`relative text-left p-4 border-l-4 active:scale-[0.98] transition-all touch-manipulation ${
                    active
                      ? "border-ember bg-ember/15 ring-2 ring-ember/70 shadow-[0_0_28px_-6px_hsl(var(--ember))]"
                      : "border-border bg-card/30 hover:border-ember/60 opacity-80 hover:opacity-100"
                  }`}>
                  {active && (
                    <span className="absolute top-2 right-2 font-mono text-[10px] uppercase tracking-widest text-ember bg-background/80 px-1.5 py-0.5 border border-ember/60">
                      ✓ chosen
                    </span>
                  )}
                  <div className={`font-display text-xl mb-1 ${active ? "text-ember" : "text-parchment"}`}>{r.name}</div>
                  <p className="text-sm text-ash italic mb-3">{r.flavor}</p>
                  <p className="text-xs text-moss"><span className="text-ash uppercase tracking-wider mr-1">gain</span> {r.gain}</p>
                  <p className="text-xs text-ember mt-1"><span className="text-ash uppercase tracking-wider mr-1">cost</span> {r.cost}</p>
                </button>
              );
            })}
          </div>
        </div>

        {chosen && (
          <div className="space-y-6 border-t border-border pt-6 animate-fade-in">
            <div className="space-y-3">
              <label className="font-mono text-[11px] uppercase tracking-widest text-ash">
                The reflection asks — what are you?
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {GENDER_OPTIONS.map((g) => {
                  const active = gender === g.key;
                  return (
                    <button
                      key={g.key}
                      type="button"
                      onClick={() => setGender(g.key)}
                      disabled={busy}
                      className={`p-3 border-l-4 text-left active:scale-[0.97] transition-all touch-manipulation ${
                        active
                          ? "border-ember bg-ember/15 ring-2 ring-ember/70"
                          : "border-border bg-card/30 hover:border-ember/60 opacity-80 hover:opacity-100"
                      }`}
                    >
                      <div className={`font-display text-sm ${active ? "text-ember" : "text-parchment"}`}>{g.label} {active && "✓"}</div>
                      <div className="font-mono text-[10px] text-ash">{g.pronoun}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            {gender && (
              <div className="space-y-4 animate-fade-in">
                <label className="font-mono text-[11px] uppercase tracking-widest text-ash block">
                  Fit the words into the gaps
                </label>
                <div className="grid sm:grid-cols-2 gap-3">
                  {AD_LIB_FIELDS.map((f) => (
                    <label key={f.key} className="block space-y-1">
                      <span className="font-body text-sm text-ash">
                        {f.prompt} <span className="text-ember">___</span>
                      </span>
                      <input
                        type="text"
                        value={adlib[f.key] ?? ""}
                        onChange={(e) => setAdlib({ ...adlib, [f.key]: e.target.value.slice(0, 90) })}
                        disabled={busy}
                        placeholder={f.placeholder}
                        className="w-full bg-card/40 border border-border focus:border-ember outline-none p-2 font-body text-parchment placeholder:text-ash/40 text-sm"
                      />
                    </label>
                  ))}
                </div>

                <div className="border border-dashed border-border/70 bg-card/20 p-3">
                  <div className="font-mono text-[10px] uppercase tracking-widest text-whisper mb-1">
                    {isNorth ? "The well reflects" : "The rain reflects"}
                  </div>
                  <p className="font-body text-parchment italic text-sm leading-relaxed">
                    {buildDescription() || "…the surface is still empty."}
                  </p>
                </div>

                <div className="sticky bottom-4 z-10">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border border-ember/60 bg-card/95 px-4 py-3 shadow-[0_12px_40px_-24px_hsl(var(--ember)/0.9)] backdrop-blur-sm">
                    <div className="min-w-0">
                      <p className="font-display text-sm text-parchment">
                        {isNorth ? "Ready to face the Veiled?" : "Ready to walk into the Shadow?"}
                      </p>
                      <p className="font-body text-xs text-ash">
                        {buildDescription() ? "This face is who they will meet." : "Fill in at least three details first."}
                      </p>
                    </div>
                    <Button
                      onClick={submit}
                      disabled={busy}
                      className="bg-ember hover:bg-ember/90 active:scale-95 text-background font-display group transition-transform touch-manipulation w-full sm:w-auto shrink-0"
                    >
                      {busy ? (<><Loader2 className="w-4 h-4 mr-2 animate-spin" />{submitWaiting}</>) : submitLabel}
                    </Button>
                  </div>
                </div>
                {busy && <p className="text-xs text-whisper italic">The water draws your face. This may take half a minute.</p>}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
