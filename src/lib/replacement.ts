// Checklist de reposição: o que falta fazer para a conta nova de um avatar ficar
// no ar depois que a anterior caiu. Regras puras (sem tela e sem banco).
//
// O checklist fica guardado na própria conta nova (`accounts.checklist`, JSONB:
// [{key, label, done}]). Alguns itens o painel marca sozinho, porque os dados da
// conta já respondem (tem e-mail, tem perfil, tem proxy, tem celular, tem
// calendário de aquecimento); os outros são marcados à mão.

import type { Account, ChecklistItem } from "./types";

export type ChecklistKey =
  | "email"
  | "perfil"
  | "proxy"
  | "celular"
  | "bio"
  | "link"
  | "destaques"
  | "provas"
  | "aquecimento";

/** Os passos da reposição, na ordem em que costumam ser feitos. */
export const CHECKLIST: ReadonlyArray<{ key: ChecklistKey; label: string }> = [
  { key: "email", label: "Criar o e-mail" },
  { key: "perfil", label: "Novo perfil no anti-detect" },
  { key: "proxy", label: "Novo proxy" },
  { key: "celular", label: "Celular" },
  { key: "bio", label: "Bio" },
  { key: "link", label: "Link da bio" },
  { key: "destaques", label: "Destaques" },
  { key: "provas", label: "Provas sociais" },
  { key: "aquecimento", label: "Iniciar o aquecimento" },
];

/** Um checklist novo, com nada feito. */
export function newChecklist(): ChecklistItem[] {
  return CHECKLIST.map(({ key, label }) => ({ key, label, done: false }));
}

/** Lê o checklist guardado na conta: só itens bem formados; vazio ou inválido → null. */
export function readChecklist(value: unknown): ChecklistItem[] | null {
  if (!Array.isArray(value)) return null;
  const items: ChecklistItem[] = [];
  const seen = new Set<string>();
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const { key, label, done } = raw as Record<string, unknown>;
    if (typeof key !== "string" || !key || seen.has(key)) continue;
    seen.add(key);
    items.push({ key, label: typeof label === "string" && label ? label : key, done: done === true });
  }
  return items.length > 0 ? items : null;
}

/** O que os dados da conta já respondem sozinhos (os outros itens são marcados à mão). */
export type ChecklistFacts = Partial<Record<ChecklistKey, boolean>>;

export function factsOf(
  account: Pick<Account, "email" | "profile_id" | "proxy" | "phone_id">,
  hasWarmup: boolean,
): ChecklistFacts {
  return {
    email: Boolean(account.email?.trim()),
    perfil: Boolean(account.profile_id),
    proxy: Boolean(account.proxy?.trim()),
    celular: Boolean(account.phone_id),
    aquecimento: hasWarmup,
  };
}

/**
 * Marca como feitos os itens que os dados da conta já cumprem. Nunca desmarca
 * (o que foi marcado à mão continua marcado). Devolve a mesma lista, sem copiar,
 * quando nada muda — quem chama usa isso para não gravar à toa.
 */
export function syncChecklist(list: ChecklistItem[], facts: ChecklistFacts): ChecklistItem[] {
  let changed = false;
  const next = list.map((item) => {
    if (item.done || facts[item.key as ChecklistKey] !== true) return item;
    changed = true;
    return { ...item, done: true };
  });
  return changed ? next : list;
}

/** Marca ou desmarca um item. Devolve a mesma lista se ele já estava assim (ou não existe). */
export function setItemDone(list: ChecklistItem[], key: string, done: boolean): ChecklistItem[] {
  if (!list.some((item) => item.key === key && item.done !== done)) return list;
  return list.map((item) => (item.key === key ? { ...item, done } : item));
}

export interface ChecklistProgress {
  done: number;
  total: number;
  /** Os itens que ainda faltam, na ordem do checklist. */
  pending: ChecklistItem[];
  complete: boolean;
}

export function checklistProgress(list: ChecklistItem[] | null | undefined): ChecklistProgress {
  const items = list ?? [];
  const pending = items.filter((item) => !item.done);
  return { done: items.length - pending.length, total: items.length, pending, complete: items.length > 0 && pending.length === 0 };
}
