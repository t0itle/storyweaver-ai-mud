import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Coins, Weight, Store, ArrowDown, ArrowUp, AlertTriangle } from "lucide-react";

type StockItem = {
  item_key: string; name: string; weight: number; category: string;
  origin_town_key: string; local: boolean; buy_price: number; sell_price: number;
};
type OfferItem = { item_key: string; name: string; quantity: number; weight: number; category: string; sell_price: number; };
type ListResp = {
  ok: true; merchant: { id: string; name: string; town: string };
  gold: number; max_weight: number; town_rep: number;
  notices: string[]; stock: StockItem[]; offers: OfferItem[];
};

interface Props {
  open: boolean;
  onClose: () => void;
  merchantId: string | null;
  onChanged: () => void;
}

export function MarketModal({ open, onClose, merchantId, onChanged }: Props) {
  const [data, setData] = useState<ListResp | null>(null);
  const [busy, setBusy] = useState(false);
  const [qty, setQty] = useState<Record<string, number>>({});

  async function load() {
    if (!merchantId) return;
    setBusy(true);
    const { data: res, error } = await supabase.functions.invoke("market-action", {
      body: { action: "list", merchant_id: merchantId },
    });
    setBusy(false);
    if (error || !(res as any)?.ok) { toast.error((res as any)?.error ?? error?.message ?? "trade failed"); return; }
    setData(res as ListResp);
  }

  useEffect(() => { if (open && merchantId) load(); }, [open, merchantId]);

  async function trade(action: "buy" | "sell", item_key: string) {
    if (!merchantId) return;
    const quantity = Math.max(1, qty[item_key] ?? 1);
    setBusy(true);
    const { data: res, error } = await supabase.functions.invoke("market-action", {
      body: { action, merchant_id: merchantId, item_key, quantity },
    });
    setBusy(false);
    const r = res as any;
    if (error || !r?.ok) { toast.error(r?.error ?? error?.message ?? "trade failed"); return; }
    toast.success(`${action === "buy" ? "Bought" : "Sold"} ${quantity} for ${r.total}g`);
    onChanged();
    load();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Store className="w-4 h-4" /> {data?.merchant.name ?? "Market"}
          </DialogTitle>
          <DialogDescription>
            {data ? <>Trading in <span className="text-ember">{data.merchant.town}</span> · town standing {data.town_rep}</> : "Loading…"}
          </DialogDescription>
        </DialogHeader>

        {data && (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs font-mono text-ash">
              <span className="flex items-center gap-1"><Coins className="w-3 h-3" /> {data.gold}g on hand</span>
              <span className="flex items-center gap-1"><Weight className="w-3 h-3" /> max {data.max_weight}</span>
            </div>

            {data.notices.length > 0 && (
              <div className="rounded border border-ember/40 bg-ember/5 p-2 space-y-1">
                {data.notices.map((n, i) => (
                  <div key={i} className="text-[11px] text-ember flex items-start gap-1">
                    <AlertTriangle className="w-3 h-3 mt-[2px] shrink-0" /> {n}
                  </div>
                ))}
              </div>
            )}

            <Tabs defaultValue="buy">
              <TabsList className="grid grid-cols-2">
                <TabsTrigger value="buy"><ArrowDown className="w-3 h-3 mr-1" /> Buy</TabsTrigger>
                <TabsTrigger value="sell"><ArrowUp className="w-3 h-3 mr-1" /> Sell</TabsTrigger>
              </TabsList>

              <TabsContent value="buy" className="space-y-1.5 mt-3">
                {data.stock.length === 0 && <div className="text-ash italic text-xs">No stock today.</div>}
                {data.stock.map((s) => (
                  <div key={s.item_key} className="flex items-center gap-2 text-xs border-b border-border/40 py-1.5">
                    <div className="flex-1 min-w-0">
                      <div className="font-body text-parchment truncate">{s.name}</div>
                      <div className="text-ash text-[10px]">
                        {s.category} · {s.weight}wt {s.local && <span className="text-moss">· local</span>}
                      </div>
                    </div>
                    <div className="text-ember font-mono whitespace-nowrap">{s.buy_price}g</div>
                    <Input
                      type="number" min={1} value={qty[s.item_key] ?? 1}
                      onChange={(e) => setQty({ ...qty, [s.item_key]: parseInt(e.target.value) || 1 })}
                      className="w-14 h-7 text-xs"
                    />
                    <Button size="sm" disabled={busy} onClick={() => trade("buy", s.item_key)}>Buy</Button>
                  </div>
                ))}
              </TabsContent>

              <TabsContent value="sell" className="space-y-1.5 mt-3">
                {data.offers.length === 0 && <div className="text-ash italic text-xs">You carry nothing this trader wants.</div>}
                {data.offers.map((o) => (
                  <div key={o.item_key} className="flex items-center gap-2 text-xs border-b border-border/40 py-1.5">
                    <div className="flex-1 min-w-0">
                      <div className="font-body text-parchment truncate">{o.name} <span className="text-ash">×{o.quantity}</span></div>
                      <div className="text-ash text-[10px]">{o.category} · {o.weight}wt</div>
                    </div>
                    <div className="text-moss font-mono whitespace-nowrap">{o.sell_price}g ea</div>
                    <Input
                      type="number" min={1} max={o.quantity} value={qty[o.item_key] ?? 1}
                      onChange={(e) => setQty({ ...qty, [o.item_key]: parseInt(e.target.value) || 1 })}
                      className="w-14 h-7 text-xs"
                    />
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => trade("sell", o.item_key)}>Sell</Button>
                  </div>
                ))}
              </TabsContent>
            </Tabs>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
