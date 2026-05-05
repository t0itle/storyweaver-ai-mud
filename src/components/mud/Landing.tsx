import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Flame } from "lucide-react";

export default function Landing() {
  const [mode, setMode] = useState<"signin" | "signup">("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email, password,
          options: {
            emailRedirectTo: `${window.location.origin}/`,
            data: { username: username.trim() || email.split("@")[0] },
          },
        });
        if (error) throw error;
        toast.success("Welcome to Ember-Hold, pilgrim.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6 py-12">
      <div className="absolute inset-0 bg-ember-glow pointer-events-none" />

      <header className="relative text-center mb-12 max-w-2xl">
        <div className="flex justify-center mb-4">
          <Flame className="w-12 h-12 text-ember ember-flicker" strokeWidth={1.5} />
        </div>
        <h1 className="font-display text-5xl md:text-7xl text-parchment mb-4 tracking-wide">
          Ember-Hold
        </h1>
        <p className="font-body italic text-lg md:text-xl text-ash leading-relaxed">
          A frontier village hewn from a dead volcano.<br />
          A black tower leans on the southern horizon, closer each day.<br />
          <span className="text-ember">You are not the first to come. You may be the last.</span>
        </p>
      </header>

      <section className="relative w-full max-w-md scroll-edge rounded-sm p-8 shadow-deep">
        <div className="flex gap-2 mb-6 font-mono text-xs">
          <button
            onClick={() => setMode("signup")}
            className={`flex-1 py-2 border-b transition-colors ${mode === "signup" ? "border-ember text-ember" : "border-border text-ash hover:text-parchment"}`}
          >
            FORGE A NAME
          </button>
          <button
            onClick={() => setMode("signin")}
            className={`flex-1 py-2 border-b transition-colors ${mode === "signin" ? "border-ember text-ember" : "border-border text-ash hover:text-parchment"}`}
          >
            RETURN
          </button>
        </div>

        <form onSubmit={submit} className="space-y-4">
          {mode === "signup" && (
            <div>
              <Label className="font-mono text-xs text-ash">YOUR NAME IN THIS WORLD</Label>
              <Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="e.g. Caelin Ash-walker" maxLength={32} className="font-body bg-input" />
            </div>
          )}
          <div>
            <Label className="font-mono text-xs text-ash">EMAIL</Label>
            <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="font-body bg-input" />
          </div>
          <div>
            <Label className="font-mono text-xs text-ash">PASSWORD</Label>
            <Input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} className="font-body bg-input" />
          </div>
          <Button type="submit" disabled={loading} className="w-full bg-primary text-primary-foreground hover:bg-primary/90 font-display tracking-widest">
            {loading ? "..." : mode === "signup" ? "ENTER THE GATE" : "STEP BACK INSIDE"}
          </Button>
        </form>

        <p className="mt-6 text-xs font-mono text-ash/70 text-center">
          Multiplayer · AI-driven NPCs · Persistent world
        </p>
      </section>
    </main>
  );
}
