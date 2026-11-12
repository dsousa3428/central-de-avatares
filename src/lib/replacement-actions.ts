"use client";

// Gravações do checklist de reposição (as regras ficam em ./replacement).

import { checklistProgress, readChecklist, setItemDone, syncChecklist, type ChecklistFacts } from "./replacement";
import { getStore, logActivity, updateRow } from "./store";
import type { Account } from "./types";

/**
 * Marca os itens que os dados da conta já cumprem (ex.: o calendário de
 * aquecimento acabou de ser criado). Não faz nada em conta sem checklist.
 */
export function syncAccountChecklist(accountId: string, facts: ChecklistFacts): Promise<void> {
  if (!getStore().accounts.some((account) => account.id === accountId && account.checklist)) return Promise.resolve();
  return updateRow("accounts", accountId, (row) => {
    const list = readChecklist(row.checklist);
    if (!list) return null;
    const next = syncChecklist(list, facts);
    return next === list ? null : { checklist: next };
  });
}

// contas cuja "reposição concluída" já foi registrada nesta sessão (dois toques quase juntos não registram duas vezes)
const completionLogged = new Set<string>();

/** Marca ou desmarca um item do checklist (a tela responde na hora). */
export async function setChecklistItem(account: Account, key: string, done: boolean): Promise<void> {
  const wasComplete = checklistProgress(readChecklist(account.checklist)).complete;
  await updateRow(
    "accounts",
    account.id,
    (row) => {
      const list = readChecklist(row.checklist);
      if (!list) return null;
      const next = setItemDone(list, key, done);
      return next === list ? null : { checklist: next };
    },
    { optimistic: true },
  );
  const store = getStore();
  const now = store.accounts.find((row) => row.id === account.id);
  const alreadyLogged =
    completionLogged.has(account.id) ||
    store.activity.some((entry) => entry.account_id === account.id && entry.kind === "reposicao_concluida");
  if (!wasComplete && !alreadyLogged && now && checklistProgress(readChecklist(now.checklist)).complete) {
    completionLogged.add(account.id);
    await logActivity({
      avatar_id: account.avatar_id,
      account_id: account.id,
      kind: "reposicao_concluida",
      message: "Reposição concluída (checklist completo)",
      is_example: account.is_example,
    });
  }
}

/** Tira o checklist da conta (reposição concluída, ou dispensado pelo dono). */
export function removeChecklist(account: Account): Promise<void> {
  return updateRow("accounts", account.id, (row) => (row.checklist === null ? null : { checklist: null }));
}
