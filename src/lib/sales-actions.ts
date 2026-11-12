"use client";

// Gravações de vendas (as regras ficam em ./sales).

import { AppError, toAppError } from "./errors";
import { accountForWeek, cleanRates, type Rates } from "./sales";
import { accountsOf } from "./selectors";
import { deleteRow, getStore, insertRow, refresh, saveSettings, updateRow } from "./store";
import type { Avatar, RowPatch, WeeklySale } from "./types";

export interface SaleInput {
  amount: number;
  currency: string;
  /** Quantidade de vendas (opcional). Sem informar, fica como estava. */
  sales_count?: number | null;
  notes?: string | null;
  /** A conta que estava no ar. Sem informar, o painel escolhe pela data (num lançamento novo). */
  account_id?: string | null;
}

/** O lançamento de um avatar numa semana (só pode existir um). */
export function saleOf(sales: readonly WeeklySale[], avatarId: string, week: string): WeeklySale | undefined {
  return sales.find((sale) => sale.avatar_id === avatarId && sale.week_start === week);
}

/** A cotação que fica guardada num lançamento novo: a atual da moeda (real não precisa). */
function snapshotRate(currency: string, rates: Rates): number | null {
  return currency === "BRL" ? null : (rates[currency] ?? null);
}

/**
 * Lança a venda de um avatar numa semana — ou corrige a que já existe (cada
 * avatar tem um lançamento só por semana).
 */
export async function saveSale(avatar: Avatar, week: string, input: SaleInput): Promise<void> {
  const db = getStore();
  const rates = cleanRates(db.settings?.brl_rates);
  const currency = input.currency.trim().toUpperCase();
  const existing = saleOf(db.sales, avatar.id, week);

  if (existing) {
    await updateRow("weekly_sales", existing.id, (row) => {
      const patch: RowPatch<"weekly_sales"> = {};
      if (Number(row.amount) !== input.amount) patch.amount = input.amount;
      if (row.currency !== currency) {
        patch.currency = currency;
        patch.brl_rate = snapshotRate(currency, rates);
      }
      if (input.sales_count !== undefined && row.sales_count !== input.sales_count) patch.sales_count = input.sales_count;
      if (input.notes !== undefined && row.notes !== input.notes) patch.notes = input.notes;
      if (input.account_id !== undefined && row.account_id !== input.account_id) patch.account_id = input.account_id;
      if (Object.keys(patch).length === 0) return null;
      // um lançamento de exemplo que você corrigiu passa a ser seu: "Apagar exemplos" não o leva embora
      if (row.is_example) patch.is_example = false;
      return patch;
    });
    return;
  }

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
      brl_rate: snapshotRate(currency, rates),
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
}

export function deleteSale(sale: WeeklySale): Promise<void> {
  return deleteRow("weekly_sales", sale.id);
}

/** Salva as cotações digitadas (quantos reais vale 1 unidade de cada moeda). */
export function saveRates(rates: Rates): Promise<void> {
  return saveSettings({ brl_rates: cleanRates(rates) });
}
