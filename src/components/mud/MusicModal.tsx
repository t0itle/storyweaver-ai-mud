import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Coins, Music as MusicIcon, Mic, Lock } from "lucide-react";

type Repertoire = {
  key: string; title: string; description: string;
  vocal_part: "male" | "female" | "instrumental";
  instrument_key: string | null; rarity: string; duration_seconds: number;
  can_perform: boolean; missing_instrument: string | null; audio_url: string | null;
};
type WaresSong = { key: string; title: string; vocal_part: string; instrument_key: string | null; rarity: string; price: number };
type WaresInst = { key: string; name: string; price: number; owned: boolean };
type Scroll = { id: string; item_key: string };
type ListResp = {
  ok: true; gold: number; voice: "male" | "female";
  repertoire: Repertoire[]; scrolls: Scroll[]; owned_instruments: string[];
  bard: { id: string; name: string; title: string | null } | null;
  bard_wares_songs: WaresSong[]; bard_wares_instruments: WaresInst[];
};

interface Props { open: boolean; onClose: () => void; bardId: string | null; alwaysOpen?: boolean; onChanged: () => void; }

const INST_NAMES: Record<string,string> = { lute: "lute", fiddle: "fiddle", "hand-drum": "hand drum", "reed-flute": "reed flute", "small-harp": "small harp" };

export function MusicModal({ open, onClose, bardId, onChanged }: Props) {
  const [data, setData] = useState<ListResp | null>(null);
  const [busy, setBusy] = useState(false);
  const [performing, setPerforming] = useState<string | null>(null);

  async function load() {
    setBusy(true);
    const { data: res, error } = await supabase.functions.invoke("music-action", {
      body: { action: "list", bard_id: bardId },
    });
    setBusy(false);
    if (error || !(res as any)?.ok) { toast.error((res as any)?.error ?? error?.message ?? "failed"); return; }
    setData(res as ListResp);
  }
  useEffect(() => { if (open) load(); /* eslint-disable-next-line */ }, [open, bardId]);

  async function call(action: string, extra: Record<string, unknown> = {}, onOk?: (r: any) => void) {
    setBusy(true);
    const { data: res, error } = await supabase.functions.invoke("music-action", { body: { action, bard_id: bardId, ...extra } });
    setBusy(false);
    const r = res as any;
    if (error || !r?.ok) { toast.error(r?.error ?? error?.message ?? "failed"); return; }
    onOk?.(r);
    await load();
    onChanged();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl bg-card border-border">
        <DialogHeader>
          <DialogTitle className="font-display text-ember flex items-center gap-2">
            <MusicIcon className="w-5 h-5" />
            {data?.bard ? `${data.bard.name}${data.bard.title ? ` — ${data.bard.title}` : ""}` : "Songs & Performance"}
          </DialogTitle>
          <DialogDescription className="text-ash text-xs italic">
            {data?.bard
              ? "Coin or coin-worth, friend, and a tune is yours."
              : "Sing or play what you know. The room listens — and tips."}
          </DialogDescription>
        </DialogHeader>

        {!data ? <div className="text-ash text-sm">tuning…</div> : (
          <Tabs defaultValue={data.bard ? "wares" : "play"} className="w-full">
            <TabsList className="w-full justify-start">
              <TabsTrigger value="play">Repertoire ({data.repertoire.length})</TabsTrigger>
              {data.scrolls.length > 0 && <TabsTrigger value="scrolls">Scrolls ({data.scrolls.length})</TabsTrigger>}
              {data.bard && <TabsTrigger value="wares">Bard's Wares</TabsTrigger>}
              <TabsTrigger value="voice">Voice</TabsTrigger>
            </TabsList>

            {/* Repertoire */}
            <TabsContent value="play" className="space-y-2 max-h-[55vh] overflow-y-auto">
              {data.repertoire.length === 0 && (
                <div className="text-ash text-sm italic">You know no songs yet. Find a scroll, or visit a bard.</div>
              )}
              {data.repertoire.map(s => (
                <div key={s.key} className="border border-border p-3 rounded space-y-1 bg-background/40">
                  <div className="flex items-baseline justify-between gap-2">
                    <div className="font-display text-parchment">{s.title}
                      <Badge variant="outline" className="ml-2 text-[10px]">{s.rarity}</Badge>
                      <Badge variant="outline" className="ml-1 text-[10px]">{s.vocal_part}</Badge>
                      {s.instrument_key && <Badge variant="outline" className="ml-1 text-[10px]">{INST_NAMES[s.instrument_key]}</Badge>}
                    </div>
                    <Button
                      size="sm" disabled={busy || !s.can_perform || performing === s.key}
                      onClick={async () => {
                        setPerforming(s.key);
                        await call("perform", { song_key: s.key }, (r) => {
                          toast.success(`+${r.tip}g${r.merit_gain ? ` · +${r.merit_gain} merit` : ""}`);
                        });
                        setPerforming(null);
                      }}>
                      {performing === s.key ? "performing…" : s.can_perform ? <><Mic className="w-3 h-3 mr-1" />Perform</> : <><Lock className="w-3 h-3 mr-1" />Need {INST_NAMES[s.missing_instrument ?? ""]}</>}
                    </Button>
                  </div>
                  <div className="text-xs text-ash italic">{s.description}</div>
                </div>
              ))}
            </TabsContent>

            {/* Scrolls */}
            <TabsContent value="scrolls" className="space-y-2">
              {data.scrolls.map(sc => (
                <div key={sc.id} className="border border-border p-2 rounded flex items-center justify-between">
                  <span className="font-body text-parchment text-sm">{sc.item_key.replace(/^scroll-/,"").replace(/-/g," ")}</span>
                  <Button size="sm" disabled={busy} onClick={() => call("learn_scroll", { player_item_id: sc.id }, r => toast.success(`Learned: ${r.learned}`))}>
                    Read & Learn
                  </Button>
                </div>
              ))}
            </TabsContent>

            {/* Bard wares */}
            {data.bard && (
              <TabsContent value="wares" className="space-y-3 max-h-[55vh] overflow-y-auto">
                <div className="text-[10px] uppercase tracking-widest text-ash flex items-center gap-1">
                  <Coins className="w-3 h-3" /> Your purse: {data.gold}g
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-ember mb-1">Songs</div>
                  {data.bard_wares_songs.length === 0 && <div className="text-ash text-xs italic">You already know everything Vellam can teach.</div>}
                  {data.bard_wares_songs.map(w => (
                    <div key={w.key} className="border border-border p-2 rounded mb-1 flex items-center justify-between">
                      <div>
                        <span className="font-body text-parchment">{w.title}</span>
                        <Badge variant="outline" className="ml-2 text-[10px]">{w.rarity}</Badge>
                        <Badge variant="outline" className="ml-1 text-[10px]">{w.vocal_part}</Badge>
                        {w.instrument_key && <Badge variant="outline" className="ml-1 text-[10px]">{INST_NAMES[w.instrument_key]}</Badge>}
                      </div>
                      <Button size="sm" disabled={busy || data.gold < w.price}
                        onClick={() => call("buy_song", { song_key: w.key }, r => toast.success(`Learned: ${r.learned}`))}>
                        {w.price}g
                      </Button>
                    </div>
                  ))}
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-ember mb-1">Instruments</div>
                  {data.bard_wares_instruments.map(w => (
                    <div key={w.key} className="border border-border p-2 rounded mb-1 flex items-center justify-between">
                      <span className="font-body text-parchment">{w.name}</span>
                      {w.owned ? <Badge variant="secondary" className="text-[10px]">owned</Badge> :
                        <Button size="sm" disabled={busy || data.gold < w.price}
                          onClick={() => call("buy_instrument", { item_key: w.key }, () => toast.success(`Bought ${w.name}`))}>
                          {w.price}g
                        </Button>}
                    </div>
                  ))}
                </div>
              </TabsContent>
            )}

            {/* Voice */}
            <TabsContent value="voice" className="space-y-2">
              <div className="text-xs text-ash">Your singing voice colors how the world hears you. Songs marked male/female sound best when matched.</div>
              <div className="flex gap-2">
                {(["female","male"] as const).map(v => (
                  <Button key={v} size="sm" variant={data.voice === v ? "default" : "outline"}
                    onClick={() => call("set_voice", { voice: v }, () => toast.success(`Voice: ${v}`))}>
                    {v}
                  </Button>
                ))}
              </div>
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}
