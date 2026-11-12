"use client";

// Ações do aquecimento que gravam no banco (as regras ficam em ./warmup).

import { daysBetween, formatDate, todayISO } from "./dates";
import { getStore, insertRow, logActivity, updateRow, type UpdateOptions } from "./store";
import type { Account, Warmup, WarmupDay } from "./types";
import {
  buildDays,
  moveStart,
  patchDay,
  resizeDays,
  setDayDone,
  shiftFrom,
  sortedDays,
  warmupInfo,
  type WarmupPlan,
} from "./warmup";

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

function endOf(days: WarmupDay[]): string {
  return days[days.length - 1]?.date ?? todayISO();
}

/** Cria o calendário de aquecimento de uma conta, a partir do molde. */
export async function startWarmup(account: Account, startDate: string, plan: WarmupPlan): Promise<Warmup> {
  const days = buildDays(startDate, plan);
  const row = await insertRow("warmups", {
    account_id: account.id,
    start_date: startDate,
    total_days: days.length,
    days,
    is_example: account.is_example,
  });
  await logActivity({
    avatar_id: account.avatar_id,
    account_id: account.id,
    kind: "aquecimento_iniciado",
    message: `Aquecimento iniciado (${plural(days.length, "dia", "dias")}, fim previsto em ${formatDate(endOf(days))})`,
    is_example: account.is_example,
  });
  return row;
}

/** Recomeça o aquecimento do zero (apaga as marcações de "feito"). */
export async function restartWarmup(
  warmup: Warmup,
  account: Account,
  startDate: string,
  plan: WarmupPlan,
): Promise<void> {
  const days = buildDays(startDate, plan);
  await updateRow("warmups", warmup.id, {
    start_date: startDate,
    total_days: days.length,
    days,
    finished_at: null,
  });
  await logActivity({
    avatar_id: account.avatar_id,
    account_id: account.id,
    kind: "aquecimento_iniciado",
    message: `Aquecimento reiniciado (${plural(days.length, "dia", "dias")}, fim previsto em ${formatDate(endOf(days))})`,
    is_example: account.is_example,
  });
}

/**
 * Marca ou desmarca o "feito" de um dia. Por padrão a tela responde na hora;
 * botões que somem da tela ao dar certo devem usar `{ optimistic: false }`.
 */
export function markDay(
  warmup: Warmup,
  n: number,
  done: boolean,
  options: UpdateOptions = { optimistic: true },
): Promise<void> {
  return updateRow("warmups", warmup.id, (row) => ({ days: setDayDone(sortedDays(row.days), n, done) }), options);
}

/**
 * Empurra o calendário: o dia `n` passa para a data `toDate` e todos os dias
 * seguintes andam junto. A data de fim prevista é recalculada.
 * Devolve false se não havia o que empurrar (ex.: o dia já foi marcado como
 * feito em outro aparelho enquanto esta tela estava aberta).
 */
export async function pushCalendar(warmup: Warmup, account: Account, n: number, toDate: string): Promise<boolean> {
  let pushed: { delta: number; end: string } | null = null;
  await updateRow("warmups", warmup.id, (row) => {
    pushed = null; // a função pode rodar mais de uma vez: vale o resultado do último cálculo
    const days = sortedDays(row.days);
    const day = days.find((d) => d.n === n);
    if (!day || day.done) return null;
    const delta = daysBetween(day.date, toDate);
    if (delta <= 0) return null;
    const next = shiftFrom(days, n, delta);
    pushed = { delta, end: endOf(next) };
    return { days: next, start_date: next[0].date };
  });
  const result = pushed as { delta: number; end: string } | null;
  if (!result) return false;
  await logActivity({
    avatar_id: account.avatar_id,
    account_id: account.id,
    kind: "aquecimento_empurrado",
    message: `Calendário empurrado ${plural(result.delta, "dia", "dias")}: o dia ${n} passou para ${formatDate(toDate)} e o fim previsto para ${formatDate(result.end)}`,
    is_example: account.is_example,
  });
  return true;
}

/** Altera um dia do calendário: uso ou descanso, minutos e o que fazer. */
export function editDay(
  warmup: Warmup,
  n: number,
  patch: Partial<Pick<WarmupDay, "use" | "minutes" | "task">>,
): Promise<void> {
  return updateRow("warmups", warmup.id, (row) => ({ days: patchDay(sortedDays(row.days), n, patch) }));
}

/** Altera a data de início e/ou a duração do calendário. */
export function editPlan(warmup: Warmup, startDate: string, totalDays: number): Promise<void> {
  return updateRow("warmups", warmup.id, (row) => {
    const days = resizeDays(moveStart(sortedDays(row.days), startDate), totalDays);
    return { days, start_date: days[0].date, total_days: days.length };
  });
}

/**
 * Encerra o aquecimento de uma conta (se houver um em andamento). Chamado
 * quando a conta deixa de estar "aquecendo".
 */
export async function closeWarmupOf(account: Account): Promise<void> {
  const warmup = getStore().warmups.find((w) => w.account_id === account.id);
  if (!warmup || warmup.finished_at) return;
  const info = warmupInfo(warmup);
  await updateRow("warmups", warmup.id, { finished_at: new Date().toISOString() });
  await logActivity({
    avatar_id: account.avatar_id,
    account_id: account.id,
    kind: "aquecimento_concluido",
    message:
      info.phase === "concluido"
        ? "Aquecimento concluído"
        : `Aquecimento encerrado antes do fim (${info.doneUseDays} de ${plural(info.useDays, "uso feito", "usos feitos")})`,
    is_example: account.is_example,
  });
}

/**
 * A conta voltou para "aquecendo": retoma o calendário que tinha sido encerrado
 * antes do fim, com tudo que já estava marcado. (Se o calendário já tinha sido
 * concluído, fica encerrado: para um novo ciclo, use "reiniciar".)
 */
export async function resumeWarmupOf(account: Account): Promise<void> {
  const warmup = getStore().warmups.find((w) => w.account_id === account.id);
  if (!warmup || !warmup.finished_at) return;
  if (warmupInfo(warmup).phase === "concluido") return;
  await updateRow("warmups", warmup.id, { finished_at: null });
  await logActivity({
    avatar_id: account.avatar_id,
    account_id: account.id,
    kind: "aquecimento_iniciado",
    message: "Aquecimento retomado de onde tinha parado",
    is_example: account.is_example,
  });
}
