import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { X, Loader2 } from "lucide-react";

interface Aether {
  key: string; name: string; domain: string;
  gift: string; vow: string; glyph: string; sort_order: number;
}

export default function HallOfChoice({
  currentAether, onClose, onAligned,
}: {
  currentAether: string | null;
  onClose: () => void;
  onAligned: () => void;
}) {
  const [aethers, setAethers] = useState<Aether[]>([]);
  const [picked, setPicked] = useState<Aether | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.from("aethers").select("*").order("sort_order")
      .then(({ data }) => setAethers((data ?? []) as Aether[]));
  }, []);

  // If the player walks out without choosing, that refusal is itself a choice.
  // Chaos notices.
  const handleClose = () => {
    if (!currentAether) {
      supabase.functions.invoke("refuse-aethers").catch(() => {});
    }
    onClose();
  };

  const align = async () => {
    if (!picked) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("align-aether", {
        body: { aether_key: picked.key },
      });
      if (error || data?.error) throw new Error(data?.error ?? error?.message);
      toast.success(`The basin trembles. You belong to ${picked.name}.`);
      onAligned();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "The basin is silent.");
    } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-background/90 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card border border-border max-w-4xl w-full max-h-[88vh] flex flex-col shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <h2 className="font-display text-2xl text-ember">The Hall of Choice</h2>
          <button onClick={onClose} className="text-ash hover:text-parchment"><X className="w-5 h-5" /></button>
        </div>

        <div className="overflow-y-auto px-6 py-5 space-y-5">
          {currentAether ? (
            <p className="text-whisper italic">
              You are already sworn to <span className="text-ember">{currentAether}</span>. The Speaker keeps oaths.
              You may walk among the alcoves and remember.
            </p>
          ) : (
            <p className="text-parchment italic">
              Six alcoves. Six aspects of the Speaker. Choose one — they will choose you back.
              <span className="text-whisper"> An oath, once sworn, cannot be unsworn.</span>
            </p>
          )}

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {aethers.map((a) => {
              const sworn = currentAether === a.key;
              const active = picked?.key === a.key;
              return (
                <button
                  key={a.key}
                  disabled={!!currentAether}
                  onClick={() => setPicked(a)}
                  className={`text-left p-4 border-l-2 transition-all ${
                    sworn ? "border-ember bg-ember/10"
                    : active ? "border-ember bg-ember/5 shadow-[0_0_20px_-8px_hsl(var(--ember))]"
                    : "border-border bg-card/30 hover:border-ember/60"
                  } ${currentAether && !sworn ? "opacity-50" : ""}`}
                >
                  <div className="flex items-baseline justify-between mb-1">
                    <div className="font-display text-xl text-parchment">{a.name}</div>
                    <div className="text-2xl text-ember">{a.glyph}</div>
                  </div>
                  <p className="text-xs text-ash italic mb-3">{a.domain}</p>
                  <p className="text-xs text-moss"><span className="text-ash uppercase tracking-wider mr-1">gift</span> {a.gift}</p>
                  <p className="text-xs text-ember mt-1"><span className="text-ash uppercase tracking-wider mr-1">vow</span> {a.vow}</p>
                  {sworn && <p className="text-[10px] font-mono text-ember mt-2 uppercase tracking-widest">— you are sworn —</p>}
                </button>
              );
            })}
          </div>

          {picked && !currentAether && (
            <div className="border-t border-border pt-4 flex items-center justify-between">
              <p className="text-parchment italic">
                Kneel to <span className="text-ember">{picked.name}</span>?
              </p>
              <Button onClick={align} disabled={busy} className="bg-ember text-background hover:bg-ember/90 font-display">
                {busy ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />the basin stirs…</> : "Kneel and be named →"}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
