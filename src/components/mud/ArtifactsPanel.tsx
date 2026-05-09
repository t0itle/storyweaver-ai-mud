import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Artifact {
  key: string; name: string; blurb: string; lore: string; glyph: string;
  holder_kind: "wild" | "veiled" | "aether"; holder_ref: string | null; home_room: string;
  passive_blurb: string; active_name: string; active_blurb: string;
  charges_max: number; merit_required_earn: number; rep_penalty_steal: number;
}
interface Owned { artifact_key: string; source: string; charges_remaining: number; }

export function ArtifactsPanel({ open, onClose, onChanged }: { open: boolean; onClose: () => void; onChanged: () => void; }) {
  const [loading, setLoading] = useState(false);
  const [catalog, setCatalog] = useState<Artifact[]>([]);
  const [owned, setOwned] = useState<Owned[]>([]);
  const [room, setRoom] = useState<string>("");

  async function reload() {
    setLoading(true);
    const { data, error } = await supabase.functions.invoke("artifact-action", { body: { action: "list" } });
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    setCatalog(data.catalog || []); setOwned(data.owned || []); setRoom(data.current_room || "");
  }
  useEffect(() => { if (open) reload(); }, [open]);

  async function act(action: string, key: string) {
    const { data, error } = await supabase.functions.invoke("artifact-action", { body: { action, artifact_key: key } });
    if (error || data?.error) { toast.error(error?.message || data?.error); return; }
    toast.success(action === "use" ? "The word is spoken." : "Done.");
    onChanged(); reload();
  }

  const ownedMap = new Map(owned.map(o => [o.artifact_key, o]));
  const here = catalog.filter(a => a.home_room === room && !ownedMap.has(a.key));
  const yours = catalog.filter(a => ownedMap.has(a.key));
  const elsewhere = catalog.filter(a => a.home_room !== room && !ownedMap.has(a.key));

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Speaker's Artifacts</DialogTitle>
          <DialogDescription>Relics of the Speaker — scattered, hoarded, or held close.</DialogDescription>
        </DialogHeader>

        {loading && <p className="text-xs text-whisper">…</p>}

        {!loading && here.length > 0 && (
          <section className="space-y-2">
            <h3 className="text-xs uppercase tracking-wider text-ember">Here, in this room</h3>
            {here.map(a => <ArtifactCard key={a.key} a={a} owned={null} onAct={act} here />)}
          </section>
        )}

        {!loading && yours.length > 0 && (
          <section className="space-y-2 mt-4">
            <h3 className="text-xs uppercase tracking-wider text-ember">In your keeping</h3>
            {yours.map(a => <ArtifactCard key={a.key} a={a} owned={ownedMap.get(a.key)!} onAct={act} />)}
          </section>
        )}

        {!loading && (
          <section className="space-y-1 mt-4">
            <h3 className="text-xs uppercase tracking-wider text-whisper/70">Whispered of, elsewhere ({elsewhere.length})</h3>
            <ul className="text-[11px] text-whisper/70 space-y-0.5">
              {elsewhere.map(a => (
                <li key={a.key}>
                  <span className="text-accent">{a.glyph}</span> <span className="font-semibold">{a.name}</span>
                  {a.holder_kind === "aether" && <> — held by an Aether at <span className="text-ember">{a.home_room}</span></>}
                  {a.holder_kind === "veiled" && <> — kept by a Veiled at <span className="text-ember">{a.home_room}</span></>}
                  {a.holder_kind === "wild" && <> — lost somewhere near <span className="text-ember">{a.home_room}</span></>}
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="flex justify-end mt-4">
          <Button variant="outline" onClick={onClose}>Close</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ArtifactCard({ a, owned, onAct, here }: { a: Artifact; owned: Owned | null; onAct: (action: string, key: string) => void; here?: boolean; }) {
  return (
    <div className="border border-border rounded p-3 space-y-1">
      <div className="flex items-baseline gap-2">
        <span className="text-accent text-lg">{a.glyph}</span>
        <span className="font-semibold">{a.name}</span>
        {owned && <span className="ml-auto text-[10px] text-whisper/60">{owned.source} · {owned.charges_remaining}/{a.charges_max}</span>}
      </div>
      <p className="text-xs text-whisper/80 italic">{a.blurb}</p>
      <p className="text-[11px] text-whisper/60"><b className="text-ember">Passive:</b> {a.passive_blurb}</p>
      <p className="text-[11px] text-whisper/60"><b className="text-ember">{a.active_name}:</b> {a.active_blurb}</p>
      <div className="flex gap-2 pt-1 flex-wrap">
        {here && a.holder_kind === "wild" && (
          <Button size="sm" onClick={() => onAct("claim", a.key)}>Claim it</Button>
        )}
        {here && a.holder_kind !== "wild" && (
          <>
            <Button size="sm" variant="destructive" onClick={() => onAct("steal", a.key)}>Steal (rep -{a.rep_penalty_steal})</Button>
            <Button size="sm" variant="outline" onClick={() => onAct("earn", a.key)}>Ask for it (Merit ≥ {a.merit_required_earn})</Button>
          </>
        )}
        {owned && (owned.charges_remaining ?? 0) > 0 && (
          <Button size="sm" variant="secondary" onClick={() => onAct("use", a.key)}>Speak the Word</Button>
        )}
      </div>
    </div>
  );
}
