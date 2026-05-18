import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Session as SbSession, User } from "@supabase/supabase-js";

export interface AuthState {
  loading: boolean;
  session: SbSession | null;
  user: User | null;
}

/** Hook único de sessão Supabase para o frontend. */
export function useAuth(): AuthState {
  const [state, setState] = useState<AuthState>({
    loading: true,
    session: null,
    user: null,
  });

  useEffect(() => {
    let mounted = true;

    // Listener PRIMEIRO para não perder eventos
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      setState({ loading: false, session, user: session?.user ?? null });
    });

    // Hidrata sessão atual
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return;
      setState({ loading: false, session, user: session?.user ?? null });
    });

    return () => {
      mounted = false;
      data.subscription.unsubscribe();
    };
  }, []);

  return state;
}

export async function signOut() {
  await supabase.auth.signOut();
}

// Mantido para compat com o api/client antigo enquanto migramos as outras telas.
export function getAuthToken(): string | null {
  return null;
}
