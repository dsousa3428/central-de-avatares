"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { getSupabase, isSupabaseConfigured } from "./supabase";
import { resetStore } from "./store";

export type AuthState =
  | { status: "loading" }
  | { status: "signed_out" }
  | { status: "signed_in"; userId: string; email: string | null };

const AuthContext = createContext<AuthState>({ status: "loading" });

function fromSession(session: Session | null): AuthState {
  if (!session) return { status: "signed_out" };
  return { status: "signed_in", userId: session.user.id, email: session.user.email ?? null };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>(
    isSupabaseConfigured ? { status: "loading" } : { status: "signed_out" },
  );

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    const supabase = getSupabase();
    let active = true;

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (active) setState(fromSession(data.session));
      })
      .catch(() => {
        if (active) setState({ status: "signed_out" });
      });

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      // saiu (aqui ou em outra aba): não deixa nenhum dado na memória
      if (!session) resetStore();
      setState(fromSession(session));
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  // Evita re-renderizar o app inteiro quando só o token é renovado.
  const userId = state.status === "signed_in" ? state.userId : null;
  const email = state.status === "signed_in" ? state.email : null;
  const value = useMemo<AuthState>(() => {
    if (state.status !== "signed_in") return { status: state.status };
    return { status: "signed_in", userId: userId as string, email };
  }, [state.status, userId, email]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  return useContext(AuthContext);
}

/** Sai da conta e recarrega a página, limpando tudo que estava na memória. */
export async function signOut(): Promise<void> {
  try {
    await getSupabase().auth.signOut({ scope: "local" });
  } catch {
    // mesmo se a rede falhar, seguimos para a tela de login
  }
  resetStore();
  // Recarga completa de propósito: garante que nada da sessão anterior fique na memória.
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.href = "/login";
}
