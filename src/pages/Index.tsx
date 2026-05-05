import { useEffect, useState } from "react";
import { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import Landing from "@/components/mud/Landing";
import GameClient from "@/components/mud/GameClient";
import CharacterCreation from "@/components/mud/CharacterCreation";

const Index = () => {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [created, setCreated] = useState<boolean | null>(null);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true); });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) { setCreated(null); return; }
    supabase.from("profiles").select("created").eq("id", session.user.id).maybeSingle()
      .then(({ data }) => setCreated(!!data?.created));
  }, [session?.user.id]);

  if (!ready) return <div className="min-h-screen flex items-center justify-center text-ash">Kindling the brazier…</div>;
  if (!session) return <Landing />;
  if (created === null) return <div className="min-h-screen flex items-center justify-center text-ash">Walking the road…</div>;
  if (!created) return <CharacterCreation session={session} onCreated={() => setCreated(true)} />;
  return <GameClient session={session} />;
};

export default Index;
