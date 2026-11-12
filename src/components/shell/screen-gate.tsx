"use client";

import { loadAll, useStore } from "@/lib/store";
import { supabaseConfigProblem } from "@/lib/supabase";
import { FullScreenLoading } from "@/components/ui/spinner";
import { usePanelPhase } from "./panel-phase";
import { EnvMissingScreen, LoadErrorScreen, SchemaMissingScreen } from "./setup-screens";

/**
 * Porteiro de cada tela interna: só mostra o conteúdo quando o login foi
 * conferido e os dados estão carregados. Antes disso, mostra "carregando"
 * (ou a tela de ajuda certa, se faltar configurar algo).
 */
export function ScreenGate({ children }: { children: React.ReactNode }) {
  const { phase, userId } = usePanelPhase();
  const store = useStore();

  if (phase === "ready") return <>{children}</>;
  if (phase === "config") return <EnvMissingScreen problem={supabaseConfigProblem} />;
  if (phase === "error" && store.error && userId) {
    const retry = () => void loadAll(userId);
    return store.error.kind === "schema" ? (
      <SchemaMissingScreen error={store.error} onRetry={retry} />
    ) : (
      <LoadErrorScreen error={store.error} onRetry={retry} />
    );
  }
  return <FullScreenLoading message={phase === "loading" ? store.loadingMessage : null} />;
}
