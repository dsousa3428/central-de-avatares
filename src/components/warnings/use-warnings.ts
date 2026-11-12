"use client";

import { useMemo } from "react";
import { todayISO } from "@/lib/dates";
import { useStore } from "@/lib/store";
import { buildWarnings, countAttention, ignoredIds, splitWarnings, type Warning } from "@/lib/warnings";

export interface WarningsView {
  /** Avisos à mostra. */
  active: Warning[];
  /** Avisos que o dono dispensou (e que ainda valem). */
  dismissed: Warning[];
  /** Quantos dos avisos à mostra pedem atenção (o número que aparece na navegação). */
  attention: number;
}

/** Os avisos automáticos do painel, já separados em "à mostra" e "dispensados". */
export function useWarnings(): WarningsView {
  const db = useStore();
  const today = todayISO();
  return useMemo(() => {
    const { active, dismissed } = splitWarnings(buildWarnings(db, today), ignoredIds(db.settings?.prefs));
    return { active, dismissed, attention: countAttention(active) };
  }, [db, today]);
}
