"use client";

import { createContext, useContext, useEffect, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { useStore } from "@/lib/store";
import {
  getLockedSnapshot,
  getVaultSnapshot,
  hideAllSecrets,
  lockIfIdle,
  lockMinutesOf,
  onVaultChangedElsewhere,
  subscribeVault,
  syncVaultWithSettings,
  touchVault,
  vaultStateOf,
  type VaultSnapshot,
  type VaultState,
} from "@/lib/vault";
import { useToast } from "@/components/ui/toast";

const VaultContext = createContext<VaultSnapshot>(getLockedSnapshot());

/**
 * Leva o retrato do cofre para todas as telas e cuida de trancá-lo sozinho.
 *
 * Fica acima das telas de propósito: as telas visitadas continuam montadas
 * (só escondidas) e, recebendo o cofre por aqui, elas também são redesenhadas
 * quando ele tranca — nenhuma senha fica "guardada" numa tela escondida.
 */
export function VaultProvider({ children }: { children: React.ReactNode }) {
  const snapshot = useSyncExternalStore(subscribeVault, getVaultSnapshot, getLockedSnapshot);
  const db = useStore();
  const toast = useToast();
  const pathname = usePathname();
  const minutes = lockMinutesOf(db.settings);
  const unlocked = snapshot.unlocked;

  // O cofre mudou em outro aparelho (senha-mestra trocada, cofre apagado): a abertura daqui deixa
  // de valer. O aviso é um só, não importa quem percebeu a mudança primeiro.
  const settings = db.settings;
  useEffect(() => {
    onVaultChangedElsewhere(() =>
      toast.info("O cofre mudou em outro aparelho. Destranque de novo com a senha-mestra atual."),
    );
    return () => onVaultChangedElsewhere(null);
  }, [toast]);
  useEffect(() => {
    syncVaultWithSettings(settings);
  }, [settings]);

  // Trocar de tela esconde o que estava à mostra.
  useEffect(() => {
    hideAllSecrets();
  }, [pathname]);

  useEffect(() => {
    if (!unlocked) return;
    const check = () => {
      if (lockIfIdle(minutes)) toast.info("Cofre trancado por falta de uso");
    };
    // Qualquer uso do painel adia o trancamento — a não ser que o prazo já tenha vencido
    // (ex.: o aparelho dormiu com o painel aberto): aí o primeiro toque tranca.
    const onActivity = () => {
      if (!lockIfIdle(minutes)) touchVault();
      else toast.info("Cofre trancado por falta de uso");
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") check();
      else hideAllSecrets(); // saiu do app: nada fica à mostra
    };
    const options = { capture: true, passive: true } as const;
    window.addEventListener("pointerdown", onActivity, options);
    window.addEventListener("keydown", onActivity, options);
    window.addEventListener("wheel", onActivity, options);
    window.addEventListener("touchmove", onActivity, options);
    window.addEventListener("pageshow", check);
    document.addEventListener("visibilitychange", onVisibility);
    const timer = window.setInterval(check, 5000);
    return () => {
      window.removeEventListener("pointerdown", onActivity, options);
      window.removeEventListener("keydown", onActivity, options);
      window.removeEventListener("wheel", onActivity, options);
      window.removeEventListener("touchmove", onActivity, options);
      window.removeEventListener("pageshow", check);
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearInterval(timer);
    };
  }, [unlocked, minutes, toast]);

  return <VaultContext.Provider value={snapshot}>{children}</VaultContext.Provider>;
}

/** Retrato do cofre: aberto ou trancado, senhas decifradas e o que está à mostra. */
export function useVault(): VaultSnapshot {
  return useContext(VaultContext);
}

/** Situação do cofre: não criado, trancado, aberto ou em formato desconhecido. */
export function useVaultState(): VaultState {
  const db = useStore();
  const vault = useVault();
  return vaultStateOf(db.settings, vault.unlocked);
}
