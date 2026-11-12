"use client";

// Mudanças de status de conta e tudo que precisa acontecer junto com elas.

import { logActivity, updateRow, type UpdateOptions } from "./store";
import type { Account, AccountStatus } from "./types";
import { closeWarmupOf, resumeWarmupOf } from "./warmup-actions";

const LABELS: Record<AccountStatus, string> = {
  aquecendo: "Aquecendo",
  ativa: "Ativa",
  restrita: "Restrita",
  caida: "Caída",
};

/**
 * Depois que o status de uma conta mudou: registra na linha do tempo e, se ela
 * saiu de "aquecendo", encerra o calendário de aquecimento.
 * Nunca atrapalha a ação principal (as falhas daqui só vão para o console).
 */
export async function afterStatusChange(
  account: Account,
  previous: AccountStatus,
  next: AccountStatus,
  fallReason?: string | null,
): Promise<void> {
  if (previous === next) return;
  await logActivity({
    avatar_id: account.avatar_id,
    account_id: account.id,
    kind: next === "caida" ? "caiu" : "status_alterado",
    message:
      next === "caida"
        ? `Conta caiu${fallReason ? ` — ${fallReason}` : ""}`
        : `Status: ${LABELS[previous]} → ${LABELS[next]}`,
    is_example: account.is_example,
  });
  // Aquecimento acompanha o status: fora de "aquecendo" o calendário é encerrado;
  // de volta a "aquecendo", o calendário que não tinha terminado é retomado.
  // (As duas ações não fazem nada quando não há o que encerrar ou retomar.)
  try {
    if (next === "aquecendo") await resumeWarmupOf(account);
    else await closeWarmupOf(account);
  } catch (err) {
    console.warn("Não foi possível atualizar o aquecimento:", err);
  }
}

/**
 * Troca de status sem formulário. Por padrão a tela responde na hora; botões
 * que somem da tela ao dar certo devem usar `{ optimistic: false }`.
 * Não serve para "caída", que precisa de data e motivo — use o formulário da conta.
 */
export async function changeAccountStatus(
  account: Account,
  next: Exclude<AccountStatus, "caida">,
  options: UpdateOptions = { optimistic: true },
): Promise<void> {
  if (next === account.status) return;
  await updateRow(
    "accounts",
    account.id,
    // conta que tinha caído e voltou: a data e o motivo da queda deixam de valer
    (row) => (row.status === "caida" ? { status: next, fell_on: null, fall_reason: null } : { status: next }),
    options,
  );
  await afterStatusChange(account, account.status, next);
}

/**
 * "Conta caiu": marca a conta como caída, com a data e o motivo provável.
 * Registra na linha do tempo e encerra o calendário de aquecimento dela.
 */
export async function markAccountFallen(account: Account, fellOn: string, reason: string | null): Promise<void> {
  await updateRow("accounts", account.id, (row) =>
    row.status === "caida" && row.fell_on === fellOn && row.fall_reason === reason
      ? null
      : { status: "caida" as const, fell_on: fellOn, fall_reason: reason },
  );
  await afterStatusChange(account, account.status, "caida", reason);
}
