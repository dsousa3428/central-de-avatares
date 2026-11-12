// Regras de vendas (sem tela e sem banco): semanas, somas e conversão para reais.
//
// - A semana vai de segunda a domingo; cada lançamento vale para uma semana
//   inteira de um avatar (`week_start` = a segunda-feira).
// - Cada lançamento tem a sua moeda. Para somar moedas diferentes, o painel
//   converte para reais com a cotação que o dono digita (`settings.brl_rates`:
//   quantos reais vale 1 unidade da moeda). A cotação em vigor fica guardada no
//   próprio lançamento (`brl_rate`), para o total de uma semana antiga não mudar
//   quando a cotação é atualizada; lançamento sem cotação guardada usa a atual.

import { addDays, daysBetween, parseISODate } from "./dates";
import { formatMoney } from "./format";
import type { Account, WeeklySale } from "./types";

// ---------------------------------------------------------------------------
// Semanas e meses
// ---------------------------------------------------------------------------

const MONTHS_SHORT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const MONTHS_LONG = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

/** A segunda-feira da semana em que cai a data. */
export function weekStart(iso: string): string {
  const day = parseISODate(iso).getDay(); // 0 = domingo … 6 = sábado
  return addDays(iso.slice(0, 10), day === 0 ? -6 : 1 - day);
}

/** O domingo que fecha a semana. */
export function weekEnd(week: string): string {
  return addDays(week, 6);
}

export function addWeeks(week: string, count: number): string {
  return addDays(week, 7 * count);
}

/** Quantas semanas de `from` até `to` (as duas são segundas-feiras). */
export function weeksBetween(from: string, to: string): number {
  return Math.round(daysBetween(from, to) / 7);
}

/** "9 a 15 de nov" · "27 de out a 2 de nov" · com o ano quando não é o de `today`. */
export function weekLabel(week: string, today?: string): string {
  const start = parseISODate(week);
  const end = parseISODate(weekEnd(week));
  const year = today && end.getFullYear() !== parseISODate(today).getFullYear() ? ` de ${end.getFullYear()}` : "";
  if (start.getMonth() === end.getMonth()) {
    return `${start.getDate()} a ${end.getDate()} de ${MONTHS_SHORT[end.getMonth()]}${year}`;
  }
  return `${start.getDate()} de ${MONTHS_SHORT[start.getMonth()]} a ${end.getDate()} de ${MONTHS_SHORT[end.getMonth()]}${year}`;
}

/** "Esta semana", "Semana passada" ou "Semana de 9 a 15 de nov". */
export function weekTitle(week: string, today: string): string {
  const diff = weeksBetween(week, weekStart(today));
  if (diff === 0) return "Esta semana";
  if (diff === 1) return "Semana passada";
  return `Semana de ${weekLabel(week, today)}`;
}

/** "Esta semana", "Semana passada", "Há 3 semanas" (sem as datas). */
export function weekAgo(week: string, today: string): string {
  const diff = weeksBetween(week, weekStart(today));
  if (diff === 0) return "Esta semana";
  if (diff === 1) return "Semana passada";
  if (diff > 1) return `Há ${diff} semanas`;
  return diff === -1 ? "Semana que vem" : `Daqui a ${-diff} semanas`;
}

/** Rótulo curto para o eixo do gráfico: o dia e o mês da segunda-feira ("9/11"). */
export function weekTick(week: string): string {
  const start = parseISODate(week);
  return `${start.getDate()}/${start.getMonth() + 1}`;
}

/** "2026-11" — o mês de uma semana é o mês da sua segunda-feira. */
export function monthKey(iso: string): string {
  return iso.slice(0, 7);
}

/** "novembro" (ou "novembro de 2025" quando não é o ano de `today`). */
export function monthName(key: string, today?: string): string {
  const [year, month] = key.split("-").map(Number);
  const name = MONTHS_LONG[(month || 1) - 1] ?? key;
  return today && year !== parseISODate(today).getFullYear() ? `${name} de ${year}` : name;
}

// ---------------------------------------------------------------------------
// Cotações e somas
// ---------------------------------------------------------------------------

/** Quantos reais vale 1 unidade de cada moeda: { EUR: 6.1, USD: 5.4 }. */
export type Rates = Record<string, number>;

/** Lê as cotações salvas: só códigos de moeda com número positivo. */
export function cleanRates(value: unknown): Rates {
  const rates: Rates = {};
  if (!value || typeof value !== "object") return rates;
  for (const [code, raw] of Object.entries(value as Record<string, unknown>)) {
    const rate = Number(raw);
    const key = code.trim().toUpperCase();
    if (/^[A-Z]{3}$/.test(key) && key !== "BRL" && Number.isFinite(rate) && rate > 0) rates[key] = rate;
  }
  return rates;
}

type SaleMoney = Pick<WeeklySale, "amount" | "currency" | "brl_rate">;

/**
 * Cotação de um lançamento para reais: a que ficou guardada nele ou, se não
 * houver, a atual. Real vale 1. Sem cotação nenhuma → null.
 */
export function rateOf(sale: Pick<WeeklySale, "currency" | "brl_rate">, rates: Rates): number | null {
  const currency = sale.currency.toUpperCase();
  if (currency === "BRL") return 1;
  const stored = sale.brl_rate === null || sale.brl_rate === undefined ? NaN : Number(sale.brl_rate);
  if (Number.isFinite(stored) && stored > 0) return stored;
  const current = rates[currency];
  return typeof current === "number" && current > 0 ? current : null;
}

/** Valor do lançamento em reais, ou null se a moeda dele não tem cotação. */
export function inBRL(sale: SaleMoney, rates: Rates): number | null {
  const rate = rateOf(sale, rates);
  return rate === null ? null : round2(Number(sale.amount) * rate);
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export interface Totals {
  /** Soma na moeda original, por moeda. */
  byCurrency: Record<string, number>;
  /** Soma em reais de tudo que tem cotação. */
  brl: number;
  /** Moedas com valor lançado e sem cotação: o total em reais não as inclui. */
  missing: string[];
  /** Quantos lançamentos entraram na soma. */
  entries: number;
  /** Quantidade de vendas informada (soma do campo "quantidade"). */
  units: number;
}

export const NO_SALES: Totals = { byCurrency: {}, brl: 0, missing: [], entries: 0, units: 0 };

export function sumSales(sales: readonly WeeklySale[], rates: Rates): Totals {
  const byCurrency: Record<string, number> = {};
  const missing = new Set<string>();
  let brl = 0;
  let units = 0;
  for (const sale of sales) {
    const amount = Number(sale.amount) || 0;
    const currency = sale.currency.toUpperCase();
    byCurrency[currency] = round2((byCurrency[currency] ?? 0) + amount);
    const converted = inBRL(sale, rates);
    if (converted === null) {
      if (amount !== 0) missing.add(currency);
    } else {
      brl = round2(brl + converted);
    }
    units += sale.sales_count ?? 0;
  }
  return { byCurrency, brl, missing: [...missing].sort(), entries: sales.length, units };
}

/** As moedas com algum valor na soma, da maior para a menor quantia. */
export function currenciesOf(totals: Totals): string[] {
  return Object.keys(totals.byCurrency)
    .filter((code) => totals.byCurrency[code] !== 0)
    .sort((a, b) => totals.byCurrency[b] - totals.byCurrency[a] || a.localeCompare(b));
}

/**
 * A moeda em que dá para comparar um conjunto de vendas (colunas de um gráfico,
 * posições de um ranking):
 *  - a própria moeda, quando só existe uma (tenha cotação ou não);
 *  - reais, quando há mais de uma moeda;
 *  - reais "parcial" quando há várias moedas e falta cotação de alguma — o que
 *    está sem cotação fica de fora e a tela precisa avisar.
 */
export interface Unit {
  currency: string;
  partial: boolean;
}

export function unitFor(totals: Totals): Unit {
  const currencies = currenciesOf(totals);
  if (currencies.length === 1) return { currency: currencies[0], partial: false };
  return { currency: "BRL", partial: totals.missing.length > 0 };
}

/** O valor de uma soma na moeda de comparação. */
export function amountIn(totals: Totals, unit: Unit): number {
  return unit.currency === "BRL" ? totals.brl : (totals.byCurrency[unit.currency] ?? 0);
}

/**
 * Como escrever uma soma na tela:
 *  - uma moeda só → o valor nela ("€ 1.234,00") e, embaixo, o equivalente em reais
 *    (se houver cotação);
 *  - várias moedas → o total em reais e, embaixo, quanto foi em cada moeda;
 *  - se falta cotação de alguma, o que não pôde ser convertido aparece somado ao lado.
 */
export function describeTotals(totals: Totals): { primary: string; secondary: string | null } {
  const currencies = currenciesOf(totals);
  if (currencies.length === 0) {
    const only = Object.keys(totals.byCurrency)[0];
    return { primary: totals.entries === 0 ? "—" : formatMoney(0, only ?? "BRL"), secondary: null };
  }
  const each = (code: string) => formatMoney(totals.byCurrency[code], code);
  if (currencies.length === 1) {
    const code = currencies[0];
    if (code === "BRL") return { primary: each(code), secondary: null };
    return {
      primary: each(code),
      secondary: totals.missing.includes(code) ? null : `≈ ${formatMoney(totals.brl, "BRL")}`,
    };
  }
  if (totals.missing.length === 0) {
    return { primary: formatMoney(totals.brl, "BRL"), secondary: currencies.map(each).join(" + ") };
  }
  const converted = currencies.some((code) => !totals.missing.includes(code));
  return {
    primary: [converted ? formatMoney(totals.brl, "BRL") : null, ...totals.missing.map(each)].filter(Boolean).join(" + "),
    secondary: `falta a cotação de ${totals.missing.join(", ")}`,
  };
}

/** Um valor na moeda de comparação, por extenso ("R$ 1.234,00"). */
export function formatIn(value: number, unit: Unit): string {
  return formatMoney(value, unit.currency);
}

// ---------------------------------------------------------------------------
// Agrupar, ordenar, séries
// ---------------------------------------------------------------------------

export function salesOfWeek(sales: readonly WeeklySale[], week: string): WeeklySale[] {
  return sales.filter((sale) => sale.week_start === week);
}

export function salesOfMonth(sales: readonly WeeklySale[], key: string): WeeklySale[] {
  return sales.filter((sale) => monthKey(sale.week_start) === key);
}

/** Vendas de `from` (inclusive) em diante; `from` null = todas. */
export function salesSince(sales: readonly WeeklySale[], from: string | null): WeeklySale[] {
  return from ? sales.filter((sale) => sale.week_start >= from) : [...sales];
}

export interface WeekPoint {
  week: string;
  totals: Totals;
  /** O total da semana na moeda de comparação. */
  value: number;
}

/** Uma coluna por semana, da mais antiga para a mais nova, sem pular semanas vazias. */
export function weeklySeries(
  sales: readonly WeeklySale[],
  rates: Rates,
  lastWeek: string,
  count: number,
  unit: Unit,
): WeekPoint[] {
  const byWeek = new Map<string, WeeklySale[]>();
  for (const sale of sales) {
    const list = byWeek.get(sale.week_start);
    if (list) list.push(sale);
    else byWeek.set(sale.week_start, [sale]);
  }
  const points: WeekPoint[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const week = addWeeks(lastWeek, -i);
    const totals = sumSales(byWeek.get(week) ?? [], rates);
    points.push({ week, totals, value: amountIn(totals, unit) });
  }
  return points;
}

export interface Ranked<T> {
  item: T;
  totals: Totals;
  value: number;
}

/** Soma as vendas de cada item e ordena do maior para o menor (empate: ordem recebida). */
export function rank<T>(
  items: readonly T[],
  salesOf: (item: T) => readonly WeeklySale[],
  rates: Rates,
  unit: Unit,
): Array<Ranked<T>> {
  return items
    .map((item, index) => {
      const totals = sumSales(salesOf(item), rates);
      return { item, totals, value: amountIn(totals, unit), index };
    })
    .sort((a, b) => b.value - a.value || a.index - b.index)
    .map(({ item, totals, value }) => ({ item, totals, value }));
}

/** A primeira semana com lançamento (a mais antiga), ou null se não há nenhum. */
export function firstWeek(sales: readonly WeeklySale[]): string | null {
  let first: string | null = null;
  for (const sale of sales) if (first === null || sale.week_start < first) first = sale.week_start;
  return first;
}

// ---------------------------------------------------------------------------
// Moeda de um lançamento novo
// ---------------------------------------------------------------------------

/**
 * A moeda sugerida para lançar as vendas de um avatar: a do último lançamento
 * dele, senão a do produto, senão a do país, senão reais.
 */
export function defaultCurrency(
  avatarSales: readonly WeeklySale[],
  productCurrency: string | null | undefined,
  countryCurrency: string | null | undefined,
): string {
  let last: WeeklySale | undefined;
  for (const sale of avatarSales) if (!last || sale.week_start > last.week_start) last = sale;
  return (last?.currency || productCurrency || countryCurrency || "BRL").toUpperCase();
}

/** O símbolo de uma moeda como o navegador escreve em português: "R$", "€", "US$". */
export function currencySymbol(code: string): string {
  try {
    const parts = new Intl.NumberFormat("pt-BR", { style: "currency", currency: code }).formatToParts(0);
    return parts.find((part) => part.type === "currency")?.value ?? code;
  } catch {
    return code;
  }
}

/** Um valor para mostrar dentro de um campo de digitação: "1.234,50". */
export function formatAmount(value: number): string {
  return new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

// ---------------------------------------------------------------------------
// Qual conta estava no ar
// ---------------------------------------------------------------------------

/**
 * A conta do avatar que estava no ar numa semana: a geração mais nova entre as
 * que já existiam e ainda não tinham caído. Se nenhuma se encaixa, a geração
 * mais nova criada até o fim da semana (ou nenhuma).
 */
export function accountForWeek(accounts: readonly Account[], week: string): Account | undefined {
  const end = weekEnd(week);
  const existing = accounts.filter((account) => account.created_on <= end);
  const live = existing.filter((account) => !account.fell_on || account.fell_on >= week);
  const pool = live.length > 0 ? live : existing;
  return [...pool].sort((a, b) => b.generation - a.generation)[0];
}

// ---------------------------------------------------------------------------
// Eixo do gráfico
// ---------------------------------------------------------------------------

/** Um teto "redondo" para o eixo e as marcas até ele: 0, 500, 1000, 1500, 2000. */
export function niceScale(maxValue: number, steps = 4): { max: number; ticks: number[] } {
  if (!Number.isFinite(maxValue) || maxValue <= 0) return { max: steps, ticks: range(steps, 1) };
  const rough = maxValue / steps;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const candidates = [1, 2, 2.5, 5, 10];
  const step = magnitude * (candidates.find((c) => c * magnitude >= rough) ?? 10);
  const count = Math.ceil(maxValue / step);
  return { max: round2(step * count), ticks: range(count, step) };
}

function range(count: number, step: number): number[] {
  return Array.from({ length: count + 1 }, (_, index) => round2(index * step));
}
