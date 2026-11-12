"use client";

// Gravações de vendas (as regras ficam em ./sales).

import { AppError, toAppError } from "./errors";
import { accountForWeek, cleanRates, type Rates } from "./sales";
import { accountsOf } from "./selectors";
import {
  deleteRow,
  getStore,
  insertRow,
  refresh,
  saveSettings,
  stampSalesRate,
  updateRow,
  type UpdateOptions,
} from "./store";
import type { Avatar, RowPatch, WeeklySale } from "./types";

export interface SaleInput {
  amount: number;
  currency: string;
  /** Quantidade de vendas (opcional). Sem informar, fica como estava. */
  sales_count?: number | null;
  notes?: string | null;
  /** A conta que estava no ar. Sem informar, o painel escolhe pela data (num lançamento novo). */
  account_id?: string | null;
  /**
   * Quantos reais vale 1 unidade da moeda neste lançamento (null = nenhuma cotação
   * guardada). Sem informar: num lançamento novo, ou quando a moeda muda, fica a
   * cotação atual da moeda; nos outros casos, a que já estava.
   */
  brl_rate?: number | null;
}

/** O lançamento de um avatar numa semana (só pode existir um). */
export function saleOf(sales: readonly WeeklySale[], avatarId: string, week: string): WeeklySale | undefined {
  return sales.find((sale) => sale.avatar_id === avatarId && sale.week_start === week);
}

/** A cotação que fica guardada num lançamento novo: a atual da moeda (real não precisa). */
function snapshotRate(currency: string, rates: Rates): number | null {
  return currency === "BRL" ? null : (rates[currency] ?? null);
}

function currentRates(): Rates {
  return cleanRates(getStore().settings?.brl_rates);
}

// Gravações do mesmo avatar na mesma semana acontecem uma de cada vez, na ordem em
// que foram pedidas. Sem isso, dois lançamentos quase juntos (digitar, Enter, corrigir,
// Enter) tentariam criar a mesma linha duas vezes — e o banco só aceita uma por semana.
const queues = new Map<string, Promise<void>>();

function inOrder<T>(avatarId: string, week: string, work: () => Promise<T>): Promise<T> {
  const key = `${avatarId}:${week}`;
  const result = (queues.get(key) ?? Promise.resolve()).then(work);
  const settled = result.then(
    () => undefined,
    () => undefined,
  );
  queues.set(key, settled);
  void settled.then(() => {
    if (queues.get(key) === settled) queues.delete(key);
  });
  return result;
}

/** Corrige um lançamento que já existe; só grava o que mudou de fato. */
function changeSale(id: string, input: Partial<SaleInput>, options?: UpdateOptions): Promise<void> {
  const currency = input.currency?.trim().toUpperCase();
  return updateRow(
    "weekly_sales",
    id,
    (row) => {
      const patch: RowPatch<"weekly_sales"> = {};
      if (input.amount !== undefined && Number(row.amount) !== input.amount) patch.amount = input.amount;
      const code = currency ?? row.currency;
      if (row.currency !== code) patch.currency = code;
      // A cotação guardada: a informada; sem informar, só muda junto com a moeda (a atual da moeda nova).
      const rate =
        code === "BRL"
          ? null
          : input.brl_rate !== undefined
            ? input.brl_rate
            : patch.currency
              ? snapshotRate(code, currentRates())
              : undefined;
      if (rate !== undefined && (row.brl_rate === null ? null : Number(row.brl_rate)) !== rate) patch.brl_rate = rate;
      if (input.sales_count !== undefined && row.sales_count !== input.sales_count) patch.sales_count = input.sales_count;
      if (input.notes !== undefined && row.notes !== input.notes) patch.notes = input.notes;
      if (input.account_id !== undefined && row.account_id !== input.account_id) patch.account_id = input.account_id;
      if (Object.keys(patch).length === 0) return null;
      // um lançamento de exemplo que você corrigiu passa a ser seu: "Apagar exemplos" não o leva embora
      if (row.is_example) patch.is_example = false;
      return patch;
    },
    options,
  );
}

/**
 * Lança a venda de um avatar numa semana — ou corrige a que já existe (cada
 * avatar tem um lançamento só por semana).
 */
export function saveSale(avatar: Avatar, week: string, input: SaleInput): Promise<void> {
  return inOrder(avatar.id, week, async () => {
    // (lido só agora, depois das gravações anteriores desta semana: o lançamento pode ter acabado de nascer)
    const db = getStore();
    const existing = saleOf(db.sales, avatar.id, week);
    if (existing) return changeSale(existing.id, input);

    const currency = input.currency.trim().toUpperCase();
    const account_id =
      input.account_id !== undefined ? input.account_id : (accountForWeek(accountsOf(db, avatar.id), week)?.id ?? null);
    try {
      await insertRow("weekly_sales", {
        avatar_id: avatar.id,
        account_id,
        week_start: week,
        amount: input.amount,
        currency,
        sales_count: input.sales_count ?? null,
        notes: input.notes ?? null,
        brl_rate:
          currency === "BRL" ? null : input.brl_rate !== undefined ? input.brl_rate : snapshotRate(currency, currentRates()),
      });
    } catch (err) {
      const error = toAppError(err);
      if (error.code === "23505") {
        // outro aparelho lançou esta mesma semana enquanto esta tela estava aberta
        void refresh();
        throw new AppError(
          "conflict",
          "Este avatar já tem um lançamento nesta semana (feito em outro aparelho). Atualizei a tela — confira e, se precisar, corrija o valor.",
        );
      }
      throw error;
    }
  });
}

/** Corrige campos de um lançamento que já existe (edição direto na célula da Planilha). */
export function patchSale(sale: WeeklySale, input: Partial<SaleInput>, options?: UpdateOptions): Promise<void> {
  return inOrder(sale.avatar_id, sale.week_start, () => changeSale(sale.id, input, options));
}

export function deleteSale(sale: WeeklySale): Promise<void> {
  return inOrder(sale.avatar_id, sale.week_start, () => deleteRow("weekly_sales", sale.id));
}

/**
 * Salva as cotações digitadas (quantos reais vale 1 unidade de cada moeda).
 *
 * Vendas lançadas antes de a moeda ter cotação não guardaram nenhuma: elas ficam
 * com a primeira que for digitada (senão mudariam de valor em reais a cada
 * atualização da cotação). Com `applyToPast`, as cotações passam a valer também
 * para as vendas que já tinham uma guardada — para consertar uma cotação digitada
 * errada.
 */
export async function saveRates(next: Rates, options: { applyToPast?: boolean } = {}): Promise<void> {
  const rates = cleanRates(next);
  await saveSettings({ brl_rates: rates });
  const all = Boolean(options.applyToPast);
  const sales = getStore().sales;
  let stamped = false;
  for (const [code, rate] of Object.entries(rates)) {
    const waiting = sales.some(
      (sale) => sale.currency.toUpperCase() === code && (sale.brl_rate === null || (all && Number(sale.brl_rate) !== rate)),
    );
    if (!waiting) continue;
    await stampSalesRate(code, rate, all);
    stamped = true;
  }
  if (stamped) await refresh();
}
