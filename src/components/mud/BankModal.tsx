// Physical bank modal — opens only when the player is standing inside a town's
// bank room (rooms.kind = 'bank'). Reuses the town-board edge function.
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Loader2, Landmark } from "lucide-react";

interface BankData {
  ok: true;
  town: { key: string; name: string };
  town_rep: number;
  merit: number;
  gold: number;
  bank: { balance: number; opened_at: string } | null;
  bank_unlocked: boolean;
  merit_bar: number;
  rep_bar: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onProfileChange?: () => void;
}

export function BankModal({ open, onClose, onProfileChange }: Props) {
  const [data, setData] = useState<BankData | null>(null);
  const [busy, setBusy] = useState(false);
  const [amt, setAmt] = useState(10);

  const reload = async () => {
    setBusy(true);
    try {
      const { data: d, error } = await supabase.functions.invoke("town-board", { body: { action: "list" } });
      if (error || d?.error) throw new Error(d?.error ?? error?.message);
      setData(d as BankData);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "The teller turns away.");
      onClose();
    } finally { setBusy(false); }
  };

  useEffect(() => { if (open) reload(); }, [open]);

  const call = async (body: Record<string, unknown>, ok?: string) => {
    setBusy(true);
    try {
      const { data: d, error } = await supabase.functions.invoke("town-board", { body });
      if (error || d?.error) throw new Error(d?.error ?? error?.message);
      if (ok) toast.success(ok);
      onProfileChange?.();
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Refused");
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md bg-bone border-ash">
        <DialogHeader>
          <DialogTitle className="font-display text-ink flex items-center gap-2">
            <Landmark className="w-4 h-4" /> {data?.town.name ? `${data.town.name} — Bank` : "Bank"}
          </DialogTitle>
          <DialogDescription className="text-ash text-xs">
            {data ? <>Town rep: <span className="text-ink">{data.town_rep}</span> · Merit: <span className="text-ink">{data.merit}</span> · Purse: <span className="text-ink">{data.gold}g</span></> : "The teller looks up…"}
          </DialogDescription>
        </DialogHeader>
        {!data ? (
          <div className="flex items-center justify-center py-10 text-ash"><Loader2 className="animate-spin mr-2" /> opening the ledger…</div>
        ) : !data.bank_unlocked && !data.bank ? (
          <div className="text-ash text-sm space-y-2 p-2">
            <p>The teller looks you up and down and says nothing.</p>
            <p className="text-xs">Need <span className="text-ink">Merit ≥ {data.merit_bar}</span> (you have {data.merit}) <span className="italic">or</span> <span className="text-ink">town rep ≥ {data.rep_bar}</span> (you have {data.town_rep}) to open an account here.</p>
          </div>
        ) : !data.bank ? (
          <div className="space-y-2 p-2">
            <p className="text-sm text-ink">The teller nods. You qualify for an account in {data.town.name}.</p>
            <Button size="sm" disabled={busy} onClick={() => call({ action: "bank_open" }, "Account opened.")}>
              Open account
            </Button>
          </div>
        ) : (
          <div className="space-y-3 p-2">
            <div className="text-ink">
              Vault balance: <span className="font-display">{data.bank.balance}g</span>
            </div>
            <div className="text-xs text-ash">On you: {data.gold}g</div>
            <div className="flex items-center gap-2">
              <Input type="number" className="w-28" value={amt} min={1} onChange={(e) => setAmt(parseInt(e.target.value) || 1)} />
              <Button size="sm" disabled={busy} onClick={() => call({ action: "bank_deposit", amount: amt }, "Deposited.")}>Deposit</Button>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => call({ action: "bank_withdraw", amount: amt }, "Withdrawn.")}>Withdraw</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
