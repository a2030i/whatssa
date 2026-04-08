import { useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

const delay = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

export const waitForAuthSession = async (retries = 20, delayMs = 150) => {
  let currentSession = (await supabase.auth.getSession()).data.session;

  for (let attempt = 0; !currentSession && attempt < retries; attempt += 1) {
    await delay(delayMs);
    currentSession = (await supabase.auth.getSession()).data.session;
  }

  return currentSession;
};

export const useAuthReady = () => {
  const [isReady, setIsReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    let isMounted = true;

    const applySession = (nextSession: Session | null) => {
      if (!isMounted) return;
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
    };

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      applySession(nextSession);
      if (isMounted) setIsReady(true);
    });

    supabase.auth
      .getSession()
      .then(({ data: { session: initialSession } }) => {
        applySession(initialSession);
        if (isMounted) setIsReady(true);
      })
      .catch(() => {
        if (isMounted) setIsReady(true);
      });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  return { isReady, session, user };
};