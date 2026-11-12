"use client";

import { useSyncExternalStore } from "react";
import { THEME_COLORS, THEME_STORAGE_KEY } from "./theme-script";

export type ThemeChoice = "system" | "light" | "dark";

const CHANGE_EVENT = "cda-theme-change";

function readChoice(): ThemeChoice {
  try {
    const value = localStorage.getItem(THEME_STORAGE_KEY);
    return value === "light" || value === "dark" ? value : "system";
  } catch {
    return "system";
  }
}

function systemPrefersDark(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/** Aplica o tema escolhido no <html> e na cor da barra do navegador. */
export function applyTheme(choice: ThemeChoice = readChoice()): void {
  const dark = choice === "dark" || (choice === "system" && systemPrefersDark());
  document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
  document.querySelectorAll('meta[name="theme-color"]').forEach((meta) => {
    meta.removeAttribute("media");
    meta.setAttribute("content", dark ? THEME_COLORS.dark : THEME_COLORS.light);
  });
}

export function setThemeChoice(choice: ThemeChoice): void {
  try {
    if (choice === "system") localStorage.removeItem(THEME_STORAGE_KEY);
    else localStorage.setItem(THEME_STORAGE_KEY, choice);
  } catch {
    // sem armazenamento local: vale só para esta visita
  }
  applyTheme(choice);
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function subscribe(callback: () => void) {
  window.addEventListener(CHANGE_EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(CHANGE_EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

export function useThemeChoice(): ThemeChoice {
  return useSyncExternalStore(subscribe, readChoice, () => "system" as ThemeChoice);
}
