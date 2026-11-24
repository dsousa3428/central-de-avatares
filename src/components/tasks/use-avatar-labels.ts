"use client";

import { useMemo } from "react";
import { useStore } from "@/lib/store";

/** "🇮🇹 Fra' Salvio" para cada avatar (vazio para as tarefas gerais). */
export function useAvatarLabels(): (id: string | null) => string {
  const db = useStore();
  return useMemo(() => {
    const names = new Map(
      db.avatars.map((avatar) => {
        const flag = db.countries.find((country) => country.id === avatar.country_id)?.flag;
        return [avatar.id, `${flag ? `${flag} ` : ""}${avatar.name}`];
      }),
    );
    return (id: string | null) => (id ? (names.get(id) ?? "") : "");
  }, [db.avatars, db.countries]);
}
