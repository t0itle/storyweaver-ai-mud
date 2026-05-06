import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { LesserRuneTracer } from "./LesserRuneTracer";
import { KanjiTracer } from "./KanjiTracer";

interface Props { open: boolean; onClose: () => void; onCast?: (r: any) => void; }

export function RuneHub({ open, onClose, onCast }: Props) {
  const [tab, setTab] = useState("lesser");
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Runeweaving</DialogTitle>
          <DialogDescription className="text-xs">
            Choose your craft — single Lesser sigils or compound Greater kanji.
          </DialogDescription>
        </DialogHeader>
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="grid grid-cols-2">
            <TabsTrigger value="lesser">Lesser ✶</TabsTrigger>
            <TabsTrigger value="greater">Greater 字</TabsTrigger>
          </TabsList>
          <TabsContent value="lesser" className="mt-3">
            <LesserRuneTracer open={open && tab === "lesser"} onClose={onClose} onCast={onCast} inline />
          </TabsContent>
          <TabsContent value="greater" className="mt-3">
            <KanjiTracer open={open && tab === "greater"} onClose={onClose} onCast={onCast} inline />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
