import { useEffect, useState } from "react";
import { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ChevronRight, Flame, Loader2, Sparkles } from "lucide-react";

interface Race {
  key: string; name: string; flavor: string;
  gain: string; cost: string; hp_mod: number; sort_order: number;
}

const INTRO_BEATS: { text: string; cta: string }[] = [
  {
    text: "First there was the Light.\n\nThen came the Speaker, and the Speaker opened its mouth, and from that mouth poured everything that is — sky, stone, sea, breath, name. The spoken things were called the Aethers, and they were good, and they were many.\n\nBut not all things are spoken. For every light there is a shadow. And the Shadow was already there, waiting, older than any word.",
    cta: "And then —",
  },
  {
    text: "Somewhere, the Speaker was silenced. Some say its own children stitched its mouth shut, terrified of what it might unspeak. Some say it bit down on a Shadow and could not let go.\n\nNow the Aethers fade like a story half-remembered. The cities forget their names. The desert eats the maps. Only one walled town still burns against the dark — and its priests cover their own mouths, so they will not finish what the Speaker began.\n\nAnd in the deep desert, where no map remembers, a single pool blooms with flowers that exist nowhere else. The world calls it the EverBloom. The world is mostly wrong about it.",
    cta: "Go on —",
  },
  {
    text: "You are not from there.\n\nYou are not from anywhere you can remember.\n\nYou are walking. You have been walking for a long time. The sand is in your teeth. Something has been calling, very softly, and you have been answering with your feet.",
    cta: "Open your eyes →",
  },
];

const PROLOGUE = `You crest a dune and the world opens — flat sand to every horizon, a single thread of cracked road unrolling east. Behind you, your footprints have already begun to vanish.

There is no guide. No snake. No oasis waiting to name you. Only the wind, and the silence the Speaker left behind, and the choice of which way to put one foot in front of the other.

But first — before the road, before the city, before the Shadow learns the shape of you — the heat shimmer above the sand catches your reflection. It is asking who you mean to be.`;

type Direction = "north" | "south";

type Gender = "woman" | "man" | "neither" | "other";

const GENDER_OPTIONS: { key: Gender; label: string; pronoun: string }[] = [
  { key: "woman", label: "Woman", pronoun: "she/her" },
  { key: "man", label: "Man", pronoun: "he/him" },
  { key: "neither", label: "Neither", pronoun: "they/them" },
  { key: "other", label: "Something else", pronoun: "your own" },
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
  const [customGender, setCustomGender] = useState("");
  const [adlib, setAdlib] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<"intro" | "prologue" | "direction" | "choose">("intro");
  const [beat, setBeat] = useState(0);
  const [direction, setDirection] = useState<Direction | null>(null);

  const buildDescription = (): string => {
    if (!chosen || !gender) return "";
    const genderWord = gender === "other"
      ? (customGender.trim() || "person")
      : gender === "neither" ? "person" : gender;
    const parts = AD_LIB_FIELDS
      .map((f) => (adlib[f.key]?.trim() ? f.template(adlib[f.key]) : null))
      .filter(Boolean) as string[];
    return `A ${genderWord} of ${chosen.name} blood, ${parts.join(", ")}.`;
  };

  useEffect(() => {
    supabase.from("races").select("*").order("sort_order")
      .then(({ data }) => setRaces((data ?? []) as Race[]));
  }, []);

  const submit = async () => {
    if (!chosen) { toast.error("Choose a race first."); return; }
    if (!direction) { toast.error("Choose a direction first."); return; }
    if (!gender) { toast.error("Choose a gender first."); return; }
    const filled = AD_LIB_FIELDS.filter((f) => (adlib[f.key]?.trim().length ?? 0) >= 2).length;
    if (filled < 3) { toast.error("Fill in at least three details — the pool needs a face."); return; }
    const description = buildDescription();
    setBusy(true);
    try {
      const { error } = await supabase.functions.invoke("create-character", {
        body: { race_key: chosen.key, description, direction },
      });
      if (error) throw error;
      toast.success(direction === "north" ? "You set your face toward the city." : "You walk into the silence.");
      onCreated();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "The reflection wavers and fades.");
    } finally { setBusy(false); }
  };

  if (step === "intro") {
    const b = INTRO_BEATS[beat];
    const last = beat === INTRO_BEATS.length - 1;
    const advance = () => (last ? setStep("prologue") : setBeat(beat + 1));
    return (
      <div className="min-h-screen flex items-center justify-center px-5 py-12 bg-background">
        <div className="max-w-2xl w-full space-y-8 animate-fade-in" key={beat}>
          <div className="flex items-center gap-3 animate-fade-in" style={{ animationDelay: "100ms", animationFillMode: "backwards" }}>
            <Flame className="w-6 h-6 text-ember ember-flicker" />
            <h1 className="font-display text-3xl text-parchment">
              {beat === 0 ? "When the Gods Stopped Speaking" : beat === 1 ? "The Last Burning City" : "A Walker on the Sand"}
            </h1>
          </div>
          <p
            className="font-body text-parchment text-lg leading-relaxed whitespace-pre-line animate-fade-in"
            style={{ animationDelay: "350ms", animationDuration: "900ms", animationFillMode: "backwards" }}
          >
            {b.text}
          </p>
          <div
            className="flex items-center gap-4 animate-fade-in"
            style={{ animationDelay: "1100ms", animationFillMode: "backwards" }}
          >
            <Button
              onClick={advance}
              className="bg-ember hover:bg-ember/90 text-background font-display group hover-scale"
            >
              <span>{b.cta}</span>
              <ChevronRight className="w-4 h-4 ml-1 transition-transform group-hover:translate-x-1 animate-pulse" />
            </Button>
            <div className="flex items-center gap-1.5">
              {INTRO_BEATS.map((_, i) => (
                <span
                  key={i}
                  className={`h-1 rounded-full transition-all duration-500 ${
                    i === beat ? "w-6 bg-ember" : i < beat ? "w-3 bg-ember/40" : "w-3 bg-ash/20"
                  }`}
                />
              ))}
            </div>
            {!last && (
              <button
                onClick={() => setStep("prologue")}
                className="font-mono text-[10px] text-whisper hover:text-ash underline underline-offset-4 ml-auto transition-colors"
              >
                skip the telling
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (step === "prologue") {
    return (
     <div className="min-h-screen flex items-start md:items-center justify-center px-5 py-10 bg-background overflow-y-auto">
        <div className="max-w-2xl w-full space-y-6 pb-32">
          <div className="flex items-center gap-3 animate-fade-in" style={{ animationDelay: "100ms", animationFillMode: "backwards" }}>
            <Flame className="w-6 h-6 text-ember ember-flicker" />
            <h1 className="font-display text-3xl text-parchment">Before You Were Anyone</h1>
          </div>
          <p
            className="font-body text-parchment text-lg leading-relaxed whitespace-pre-line animate-fade-in"
            style={{ animationDelay: "350ms", animationDuration: "1000ms", animationFillMode: "backwards" }}
          >
            {PROLOGUE}
          </p>
          <div
            className="animate-fade-in flex items-center justify-between gap-4 border-t border-border/70 pt-4"
            style={{ animationDelay: "1100ms", animationFillMode: "backwards" }}
          >
            <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-whisper">
              The road waits ahead
            </p>
            <Button
              onClick={() => setStep("direction")}
              className="bg-ember hover:bg-ember/90 text-background font-display group hover-scale shrink-0"
            >
              <span>Next</span>
              <ChevronRight className="w-4 h-4 ml-1 transition-transform group-hover:translate-x-1 animate-pulse" />
            </Button>
          </div>

          <div className="sticky bottom-4 z-10 animate-fade-in" style={{ animationDelay: "1300ms", animationFillMode: "backwards" }}>
            <div className="flex items-center justify-between gap-3 border border-border/80 bg-card/90 px-4 py-3 shadow-[0_12px_40px_-24px_hsl(var(--foreground)/0.75)] backdrop-blur-sm">
              <div className="min-w-0">
                <p className="font-display text-sm text-parchment">Ready to choose your path?</p>
                <p className="font-body text-xs text-ash">Head for the shining city or disappear into the dunes.</p>
              </div>
              <Button
                onClick={() => setStep("direction")}
                className="bg-ember hover:bg-ember/90 text-background font-display group hover-scale shrink-0"
              >
                <span>Choose your road</span>
                <ChevronRight className="w-4 h-4 ml-1 transition-transform group-hover:translate-x-1 animate-pulse" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (step === "direction") {
    return (
      <div className="min-h-screen flex items-start md:items-center justify-center px-5 py-10 bg-background overflow-y-auto">
        <div className="max-w-3xl w-full space-y-6 animate-in fade-in duration-1000 pb-24">
          <div className="flex items-center gap-3">
            <Flame className="w-6 h-6 text-ember ember-flicker" />
            <h1 className="font-display text-3xl text-parchment">Which Way Do You Walk?</h1>
          </div>
          <p className="font-body text-ash italic">No guide. No snake. Only the wind, and a road that runs north.</p>

          <div className="grid sm:grid-cols-2 gap-4">
            <button
              onClick={() => setDirection("north")}
              className={`text-left p-5 border-l-2 transition-all ${
                direction === "north"
                  ? "border-ember bg-ember/5 shadow-[0_0_20px_-8px_hsl(var(--ember))]"
                  : "border-border bg-card/30 hover:border-ember/60"
              }`}
            >
              <div className="font-display text-xl text-parchment mb-2">North — toward the shining city</div>
              <p className="text-sm text-ash leading-relaxed">
                Watch-fires burn on high walls across the heat-shimmer. A cracked road runs to its gates.
                There will be people there. Some of them may even be kind.
              </p>
            </button>
            <button
              onClick={() => setDirection("south")}
              className={`text-left p-5 border-l-2 transition-all ${
                direction === "south"
                  ? "border-ember bg-ember/5 shadow-[0_0_20px_-8px_hsl(var(--ember))]"
                  : "border-border bg-card/30 hover:border-ember/60"
              }`}
            >
              <div className="font-display text-xl text-parchment mb-2">South — deeper into the dunes</div>
              <p className="text-sm text-ash leading-relaxed">
                No road. No bells. Only sand that goes on and on, and a wind that has begun to say
                something just under hearing. The Shadow knows that road.
              </p>
            </button>
          </div>

          <div className="flex justify-end">
            <Button
              onClick={() => setStep("choose")}
              disabled={!direction}
              className="bg-ember hover:bg-ember/90 text-background font-display disabled:opacity-40"
            >
              {direction ? "Now — who are you? →" : "Choose a direction"}
            </Button>
          </div>
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
