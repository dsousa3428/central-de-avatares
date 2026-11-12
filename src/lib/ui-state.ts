"use client";

// Pequenas preferências de tela que precisam sobreviver à troca de página
// (ex.: qual aba de país estava aberta).

import { useSyncExternalStore } from "react";

const COUNTRY_KEY = "cda-pais-aberto";

let selectedCountryId: string | null | undefined;
const listeners = new Set<() => void>();

function read(): string | null {
  if (selectedCountryId === undefined) {
    try {
      selectedCountryId = localStorage.getItem(COUNTRY_KEY);
    } catch {
      selectedCountryId = null;
    }
  }
  return selectedCountryId;
}

/** Define qual país fica aberto na tela "Países". */
export function setSelectedCountry(id: string | null): void {
  selectedCountryId = id;
  try {
    if (id) localStorage.setItem(COUNTRY_KEY, id);
    else localStorage.removeItem(COUNTRY_KEY);
  } catch {
    // sem armazenamento local: vale só para esta visita
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useSelectedCountry(): string | null {
  return useSyncExternalStore(subscribe, read, () => null);
}

// ---------------------------------------------------------------------------
// Aba aberta na tela "Infraestrutura" (a busca abre direto em Celulares ou Perfis)
// ---------------------------------------------------------------------------

export type InfraTab = "celulares" | "perfis";

let infraTab: InfraTab = "celulares";

export function setInfraTab(tab: InfraTab): void {
  infraTab = tab;
  listeners.forEach((listener) => listener());
}

export function useInfraTab(): InfraTab {
  return useSyncExternalStore(
    subscribe,
    () => infraTab,
    () => "celulares" as InfraTab,
  );
}

// ---------------------------------------------------------------------------
// Janela da busca global (uma só, na moldura; qualquer tela pode abrir)
// ---------------------------------------------------------------------------

let searchOpen = false;

export function setSearchOpen(open: boolean): void {
  if (searchOpen === open) return;
  searchOpen = open;
  listeners.forEach((listener) => listener());
}

export function useSearchOpen(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => searchOpen,
    () => false,
  );
}
