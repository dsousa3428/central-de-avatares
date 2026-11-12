"use client";

// Aplicativo instalável: guarda o "convite de instalação" que o Chrome oferece
// e diz se o painel já está aberto como aplicativo.

import { useSyncExternalStore } from "react";

/** O evento que o Chrome dispara quando o site pode ser instalado. */
interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let pending: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Chamado pela moldura do app quando o navegador oferece (ou retira) a instalação. */
export function rememberInstallPrompt(event: Event | null): void {
  pending = event as InstallPromptEvent | null;
  listeners.forEach((listener) => listener());
}

/** Há um convite de instalação guardado (Chrome/Edge)? */
export function useCanInstall(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => pending !== null,
    () => false,
  );
}

/** Mostra a janela de instalação do navegador. Devolve true se a pessoa aceitou. */
export async function promptInstall(): Promise<boolean> {
  const event = pending;
  if (!event) return false;
  await event.prompt();
  const choice = await event.userChoice;
  // o convite só vale uma vez
  rememberInstallPrompt(null);
  return choice.outcome === "accepted";
}

function subscribeStandalone(listener: () => void) {
  const media = window.matchMedia("(display-mode: standalone)");
  media.addEventListener("change", listener);
  return () => media.removeEventListener("change", listener);
}

function isStandalone(): boolean {
  // (iPhone antigo usa navigator.standalone)
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/** O painel está aberto como aplicativo instalado (e não numa aba do navegador)? */
export function useStandalone(): boolean {
  return useSyncExternalStore(subscribeStandalone, isStandalone, () => false);
}
