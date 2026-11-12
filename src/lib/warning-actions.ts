"use client";

// Dispensar avisos e trazê-los de volta (as regras ficam em ./warnings).
// Os ids dispensados ficam em `settings.prefs.ignored_warnings`.

import { todayISO } from "./dates";
import { getStore, saveSettings } from "./store";
import { buildWarnings, ignoredIds, nextIgnored } from "./warnings";

async function changeIgnored(change: { add?: readonly string[]; remove?: readonly string[] }): Promise<void> {
  const db = getStore();
  const prefs = db.settings?.prefs ?? {};
  const current = ignoredIds(prefs);
  const next = nextIgnored(current, buildWarnings(db, todayISO()), change);
  const same = next.length === current.length && [...current].sort().every((id, index) => id === next[index]);
  if (same) return;
  await saveSettings({ prefs: { ...prefs, ignored_warnings: next } });
}

/** Dispensa avisos: eles saem da lista (e do número na navegação) até a situação mudar. */
export function dismissWarnings(ids: readonly string[]): Promise<void> {
  return changeIgnored({ add: ids });
}

/** Volta a mostrar avisos que tinham sido dispensados. */
export function restoreWarnings(ids: readonly string[]): Promise<void> {
  return changeIgnored({ remove: ids });
}

/**
 * O dono confirmou, ao salvar a conta, que quer reutilizar celular, perfil ou
 * proxy de uma conta que caiu: os avisos dessa conta sobre isso já nascem
 * dispensados (ele acabou de dizer que sabe). Continuam na lista de dispensados.
 */
export async function acknowledgeReuse(accountId: string): Promise<void> {
  const ids = buildWarnings(getStore(), todayISO())
    .filter((warning) => warning.kind === "recurso_de_caida" && warning.accountIds.includes(accountId))
    .map((warning) => warning.id);
  if (ids.length > 0) await dismissWarnings(ids);
}
