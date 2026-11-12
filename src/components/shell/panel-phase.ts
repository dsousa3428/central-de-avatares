"use client";

import { useAuth } from "@/lib/auth";
import { useStore } from "@/lib/store";
import { isSupabaseConfigured } from "@/lib/supabase";

/**
 * Em que pé está o painel:
 *  - config  : falta configurar o Supabase
 *  - auth    : conferindo o login (ou redirecionando para /login)
 *  - loading : login ok, carregando os dados
 *  - error   : não conseguiu carregar os dados
 *  - ready   : tudo pronto para mostrar as telas
 */
export type PanelPhase = "config" | "auth" | "loading" | "error" | "ready";

export function usePanelPhase(): { phase: PanelPhase; userId: string | null; email: string | null } {
  const auth = useAuth();
  const store = useStore();
  const userId = auth.status === "signed_in" ? auth.userId : null;
  const email = auth.status === "signed_in" ? auth.email : null;

  let phase: PanelPhase;
  if (!isSupabaseConfigured) phase = "config";
  else if (!userId) phase = "auth";
  else if (store.userId !== userId) phase = "loading";
  else if (store.status === "error" && store.error) phase = "error";
  else if (store.status === "ready") phase = "ready";
  else phase = "loading";

  return { phase, userId, email };
}
