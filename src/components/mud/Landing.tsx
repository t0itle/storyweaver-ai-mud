import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import logo from "@/assets/everbloom-logo.png";

// Username-only accounts get a stable synthetic email so Supabase auth still works.
const USERNAME_DOMAIN = "wanderer.everbloom.local";
const usernameToEmail = (u: string) =>
  `${u.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")}@${USERNAME_DOMAIN}`;

export default function Landing() {
  const [mode, setMode] = useState<"signin" | "signup">("signup");
  const [identifier, setIdentifier] = useState(""); // email OR username for signin
  const [email, setEmail] = useState(""); // optional on signup
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(false);
  const [oauthBusy, setOauthBusy] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        const uname = username.trim();
        if (uname.length < 2) throw new Error("Choose a name (min 2 characters).");
        const useEmail = email.trim().length > 0 ? email.trim() : usernameToEmail(uname);
        const { error } = await supabase.auth.signUp({
          email: useEmail,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/`,
            data: { username: uname },
          },
        });
        if (error) throw error;
        // Auto-confirm is on, so try immediate sign-in for username-only flow.
        if (!email.trim()) {
          await supabase.auth.signInWithPassword({ email: useEmail, password });
        }
        toast.success("The desert has heard a new walker.");
      } else {
        const id = identifier.trim();
        const loginEmail = id.includes("@") ? id : usernameToEmail(id);
        const { error } = await supabase.auth.signInWithPassword({ email: loginEmail, password });
        if (error) throw error;
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const oauth = async (provider: "google" | "apple") => {
    setOauthBusy(provider);
    try {
      const result = await lovable.auth.signInWithOAuth(provider, {
        redirect_uri: window.location.origin,
      });
      if (result.error) throw result.error;
      // result.redirected → browser navigates away; otherwise session is set.
    } catch (err) {
      toast.error(err instanceof Error ? err.message : `${provider} sign-in failed`);
      setOauthBusy(null);
    }
  };

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6 py-12 relative overflow-hidden">
      <div className="absolute inset-0 bg-ember-glow pointer-events-none" />

      <header className="relative text-center mb-10 max-w-2xl">
        <div className="flex justify-center mb-5">
          <img
            src={logo}
            alt="EverBloom sigil — a six-petalled bone-stone bloom around a still pool and an ember"
            width={120}
            height={120}
            className="w-24 h-24 md:w-28 md:h-28 drop-shadow-[0_0_30px_hsl(var(--ember)/0.45)]"
          />
        </div>
        <h1 className="font-display text-5xl md:text-7xl text-parchment mb-3 tracking-[0.18em]">
          Ever<span className="text-ember">Bloom</span>
        </h1>
        <p className="font-mono text-[10px] md:text-xs text-ash uppercase tracking-[0.5em] mb-5">
          a living text world of silent gods
        </p>
        <p className="font-body italic text-lg md:text-xl text-ash leading-relaxed">
          First there was the Light. Then the <span className="text-parchment">Speaker</span> opened its mouth,
          and the <span className="text-parchment">Aethers</span> poured forth — every spoken thing.
          <br /><br />
          But some things are <span className="text-ember">not</span> spoken into being.
          For every light there is a <span className="text-ember">Shadow</span>, and the Shadow was already waiting.
          <br /><br />
          Now the Speaker is silenced. The maps are eaten, the cities forget their names —
          <span className="text-parchment"> yet a single pool still blooms in the deep desert,</span>
          <span className="text-ember"> and it is asking who you mean to be.</span>
        </p>
      </header>

      <section className="relative w-full max-w-md scroll-edge rounded-sm p-8 shadow-deep">
        <div className="flex gap-2 mb-6 font-mono text-xs">
          <button
            onClick={() => setMode("signup")}
            className={`flex-1 py-2 border-b transition-colors ${mode === "signup" ? "border-ember text-ember" : "border-border text-ash hover:text-parchment"}`}
          >
            BLOOM A NAME
          </button>
          <button
            onClick={() => setMode("signin")}
            className={`flex-1 py-2 border-b transition-colors ${mode === "signin" ? "border-ember text-ember" : "border-border text-ash hover:text-parchment"}`}
          >
            RETURN TO THE SAND
          </button>
        </div>

        <div className="space-y-2 mb-5">
          <Button
            type="button"
            onClick={() => oauth("google")}
            disabled={!!oauthBusy}
            variant="outline"
            className="w-full font-mono text-xs tracking-widest"
          >
            {oauthBusy === "google" ? "..." : "CONTINUE WITH GOOGLE"}
          </Button>
          <Button
            type="button"
            onClick={() => oauth("apple")}
            disabled={!!oauthBusy}
            variant="outline"
            className="w-full font-mono text-xs tracking-widest"
          >
            {oauthBusy === "apple" ? "..." : "CONTINUE WITH APPLE"}
          </Button>
        </div>

        <div className="flex items-center gap-3 mb-5">
          <div className="h-px flex-1 bg-border" />
          <span className="font-mono text-[10px] text-ash/60 tracking-widest">OR</span>
          <div className="h-px flex-1 bg-border" />
        </div>

        <form onSubmit={submit} className="space-y-4">
          {mode === "signup" ? (
            <>
              <div>
                <Label className="font-mono text-xs text-ash">YOUR NAME IN THIS WORLD</Label>
                <Input
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="e.g. Caelin Ash-walker"
                  maxLength={32}
                  className="font-body bg-input"
                />
              </div>
              <div>
                <Label className="font-mono text-xs text-ash">EMAIL <span className="text-ash/50 normal-case">(optional)</span></Label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="leave blank for a name-only walker"
                  className="font-body bg-input"
                />
              </div>
            </>
          ) : (
            <div>
              <Label className="font-mono text-xs text-ash">NAME OR EMAIL</Label>
              <Input
                required
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                className="font-body bg-input"
              />
            </div>
          )}
          <div>
            <Label className="font-mono text-xs text-ash">PASSWORD</Label>
            <Input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} className="font-body bg-input" />
          </div>
          <Button type="submit" disabled={loading} className="w-full bg-primary text-primary-foreground hover:bg-primary/90 font-display tracking-widest">
            {loading ? "..." : mode === "signup" ? "WALK INTO THE DESERT" : "RETURN"}
          </Button>
        </form>

        <p className="mt-6 text-xs font-mono text-ash/70 text-center">
          Multiplayer · AI souls · Rune-weaving · Turn-based combat · Persistent world
        </p>
      </section>

      <footer className="relative mt-10 font-mono text-[10px] text-ash/50 uppercase tracking-[0.4em]">
        EverBloom · the bloom remembers what the gods forgot
      </footer>
    </main>
  );
}
