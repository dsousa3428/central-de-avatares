// Quedas de contas: quanto tempo as contas duraram, por país e por motivo.
// Regras puras (sem tela e sem banco).

import { addDays, daysBetween, isValidISODate } from "./dates";
import type { Db } from "./store";
import type { Account, Avatar, Country } from "./types";

export const NO_REASON = "Sem motivo informado";

export interface FallRow {
  account: Account;
  avatar: Avatar | undefined;
  country: Country | undefined;
  /** Dias de vida: da criação até a queda. null quando falta alguma das datas. */
  days: number | null;
  reason: string;
}

export interface FallGroup {
  key: string;
  label: string;
  /** Quantas contas caíram neste grupo. */
  count: number;
  /** Média de dias de vida das contas do grupo que têm as duas datas (null se nenhuma tem). */
  averageDays: number | null;
}

export interface FallStats {
  /** As contas que caíram, da queda mais recente para a mais antiga. */
  rows: FallRow[];
  /** Média de dias de vida de todas as contas que caíram. */
  averageDays: number | null;
  shortestDays: number | null;
  longestDays: number | null;
  /** Quedas nos últimos 30 dias (contando hoje). */
  recent: number;
  /** Por país e por motivo, do grupo com mais quedas para o com menos. */
  byCountry: FallGroup[];
  byReason: FallGroup[];
}

/** Dias de vida de uma conta que caiu (da criação até a queda), ou null se as datas não servem. */
export function fallenLifetime(account: Pick<Account, "created_on" | "fell_on">): number | null {
  if (!isValidISODate(account.created_on) || !isValidISODate(account.fell_on)) return null;
  const days = daysBetween(account.created_on, account.fell_on);
  return days >= 0 ? days : null;
}

/** "  seguiu   gente DEMAIS " e "Seguiu gente demais" são o mesmo motivo. */
function reasonKey(reason: string): string {
  return reason.trim().replace(/\s+/g, " ").toLocaleLowerCase("pt-BR");
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10;
}

function group(rows: FallRow[], keyOf: (row: FallRow) => { key: string; label: string }): FallGroup[] {
  const groups = new Map<string, { label: string; count: number; days: number[] }>();
  for (const row of rows) {
    const { key, label } = keyOf(row);
    let entry = groups.get(key);
    if (!entry) {
      entry = { label, count: 0, days: [] };
      groups.set(key, entry);
    }
    entry.count += 1;
    if (row.days !== null) entry.days.push(row.days);
  }
  return [...groups.entries()]
    .map(([key, entry]) => ({ key, label: entry.label, count: entry.count, averageDays: average(entry.days) }))
    .sort((a, b) => b.count - a.count || plain(a.label).localeCompare(plain(b.label), "pt-BR"));
}

/** O rótulo sem a bandeira na frente (para o desempate em ordem alfabética não depender dela). */
function plain(label: string): string {
  return label.replace(/^[^\p{L}\p{N}]+/u, "");
}

export function fallStats(db: Pick<Db, "accounts" | "avatars" | "countries">, today: string): FallStats {
  const rows: FallRow[] = db.accounts
    .filter((account) => account.status === "caida")
    .map((account) => {
      const avatar = db.avatars.find((a) => a.id === account.avatar_id);
      return {
        account,
        avatar,
        country: avatar ? db.countries.find((c) => c.id === avatar.country_id) : undefined,
        days: fallenLifetime(account),
        reason: account.fall_reason?.trim().replace(/\s+/g, " ") || NO_REASON,
      };
    })
    .sort(
      (a, b) =>
        (b.account.fell_on ?? "").localeCompare(a.account.fell_on ?? "") ||
        (a.avatar?.name ?? "").localeCompare(b.avatar?.name ?? "", "pt-BR") ||
        b.account.generation - a.account.generation,
    );

  const lifetimes = rows.map((row) => row.days).filter((days): days is number => days !== null);
  const since = addDays(today, -29);
  return {
    rows,
    averageDays: average(lifetimes),
    shortestDays: lifetimes.length > 0 ? Math.min(...lifetimes) : null,
    longestDays: lifetimes.length > 0 ? Math.max(...lifetimes) : null,
    recent: rows.filter((row) => row.account.fell_on && row.account.fell_on >= since && row.account.fell_on <= today).length,
    byCountry: group(rows, (row) => ({
      key: row.country?.id ?? "",
      label: row.country ? `${row.country.flag ? `${row.country.flag} ` : ""}${row.country.name}` : "Sem país",
    })),
    byReason: group(rows, (row) => ({ key: reasonKey(row.reason), label: row.reason })),
  };
}
