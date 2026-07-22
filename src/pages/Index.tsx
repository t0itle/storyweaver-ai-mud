import { lazy, Suspense, useEffect, useState } from "react";
import { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import Landing from "@/components/mud/Landing";

// Code-split the heavy screens: the sign-in page shouldn't pay for the whole
// game client, the intro cinematic, or character creation up front.
const GameClient = lazy(() => import("@/components/mud/GameClient"));
const CharacterCreation = lazy(() => import("@/components/mud/CharacterCreation"));
const Intro = lazy(() => import("@/components/mud/Intro"));

const INTRO_KEY = "everbloom-intro-seen";

const RoadLoader = () => (
  <div className="min-h-screen flex items-center justify-center text-ash">Walking the road…</div>
);

const Index = () => {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [created, setCreated] = useState<boolean | null>(null);
  const [introDone, setIntroDone] = useState<boolean>(() => {
    try { return sessionStorage.getItem(INTRO_KEY) === "1"; } catch { return false; }
  });

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) {
        setSession(null);
        setReady(true);
        return;
      }

      const { data: userData, error } = await supabase.auth.getUser();
      if (error || !userData.user) {
        await supabase.auth.signOut();
        setSession(null);
      } else {
        setSession(data.session);
      }
      setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) { setCreated(null); return; }
    supabase.from("profiles").select("created").eq("id", session.user.id).maybeSingle()
      .then(async ({ data, error }) => {
        if (error) {
          await supabase.auth.signOut();
          setCreated(null);
          return;
        }
        setCreated(!!data?.created);
      });
  }, [session?.user.id]);

  if (!ready) return <div className="min-h-screen flex items-center justify-center text-ash">Kindling the brazier…</div>;
  if (!session) return <Landing />;
  if (created === null) return <RoadLoader />;
  if (!created && !introDone) {
    return (
      <Suspense fallback={<RoadLoader />}>
        <Intro onDone={() => { try { sessionStorage.setItem(INTRO_KEY, "1"); } catch {} setIntroDone(true); }} />
      </Suspense>
    );
  }
  if (!created) return (
    <Suspense fallback={<RoadLoader />}>
      <CharacterCreation session={session} onCreated={() => setCreated(true)} />
    </Suspense>
  );
  return (
    <Suspense fallback={<RoadLoader />}>
      <GameClient session={session} />
    </Suspense>
  );
};

export default Index;
