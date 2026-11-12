// Funções de leitura: respondem perguntas sobre os dados já carregados.

import { daysBetween, todayISO } from "./dates";
import type { Db } from "./store";
import type { Account, AntidetectProfile, Avatar, Country, Phone, Warmup } from "./types";
import { warmupInfo, type WarmupInfo } from "./warmup";

/** Conta "viva" = qualquer status que não seja caída. */
export function isLive(account: Account): boolean {
  return account.status !== "caida";
}

/** Contas de um avatar, da geração mais nova para a mais antiga. */
export function accountsOf(db: Pick<Db, "accounts">, avatarId: string): Account[] {
  return db.accounts.filter((a) => a.avatar_id === avatarId).sort((a, b) => b.generation - a.generation);
}

/** Conta atual do avatar: a geração mais nova que ainda não caiu. */
export function currentAccount(accounts: Account[]): Account | null {
  let best: Account | null = null;
  for (const account of accounts) {
    if (!isLive(account)) continue;
    if (!best || account.generation > best.generation) best = account;
  }
  return best;
}

/** Geração mais nova, viva ou não. */
export function latestAccount(accounts: Account[]): Account | null {
  let best: Account | null = null;
  for (const account of accounts) {
    if (!best || account.generation > best.generation) best = account;
  }
  return best;
}

/**
 * A conta que uma conta nova viria substituir: a geração mais nova, quando ela
 * caiu e o avatar ficou sem nenhuma conta viva. (Com conta viva, uma conta nova
 * não é reposição.)
 */
export function accountToReplace(accounts: Account[]): Account | null {
  if (currentAccount(accounts)) return null;
  const last = latestAccount(accounts);
  return last && last.status === "caida" ? last : null;
}

export function nextGeneration(accounts: Account[]): number {
  return accounts.reduce((max, a) => Math.max(max, a.generation), 0) + 1;
}

/** Dias de vida: da criação até a queda (ou até hoje, se ainda está viva). */
export function lifetimeDays(account: Account, today = todayISO()): number | null {
  const end = account.status === "caida" ? account.fell_on : today;
  if (!end || !account.created_on) return null;
  const days = daysBetween(account.created_on, end);
  return days >= 0 ? days : null;
}

export function generationLabel(generation: number): string {
  return `${generation}ª geração`;
}

export function phoneLabel(phone: Phone | null | undefined): string {
  if (!phone) return "—";
  return phone.model ? `${phone.nickname} (${phone.model})` : phone.nickname;
}

export function profileLabel(profile: AntidetectProfile | null | undefined): string {
  if (!profile) return "—";
  return profile.name ? `Perfil ${profile.number} — ${profile.name}` : `Perfil ${profile.number}`;
}

export function profileShortLabel(profile: AntidetectProfile | null | undefined): string {
  return profile ? `Perfil ${profile.number}` : "—";
}

/** "Fra' Salvio · @fra.salvio (2ª geração)" */
export function describeAccount(db: Pick<Db, "avatars">, account: Account): string {
  const avatar = db.avatars.find((a) => a.id === account.avatar_id);
  const who = avatar ? `${avatar.name} · ` : "";
  return `${who}@${account.handle} (${generationLabel(account.generation)})`;
}

export interface Usage {
  /** Contas vivas que usam o recurso agora. */
  live: Account[];
  /** Contas caídas que já usaram o recurso. */
  fallen: Account[];
}

function collectUsage(accounts: Account[], keyOf: (a: Account) => string | null): Map<string, Usage> {
  const map = new Map<string, Usage>();
  for (const account of accounts) {
    const key = keyOf(account);
    if (!key) continue;
    let usage = map.get(key);
    if (!usage) {
      usage = { live: [], fallen: [] };
      map.set(key, usage);
    }
    (isLive(account) ? usage.live : usage.fallen).push(account);
  }
  return map;
}

export function usageByPhone(db: Pick<Db, "accounts">): Map<string, Usage> {
  return collectUsage(db.accounts, (a) => a.phone_id);
}

export function usageByProfile(db: Pick<Db, "accounts">): Map<string, Usage> {
  return collectUsage(db.accounts, (a) => a.profile_id);
}

/** Deixa proxies comparáveis: sem espaços, sem "http://", minúsculas. */
export function normalizeProxy(value: string | null | undefined): string | null {
  const v = (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/^[a-z0-9]+:\/\//, "")
    .replace(/\/+$/, "");
  return v === "" ? null : v;
}

export function usageByProxy(db: Pick<Db, "accounts">): Map<string, Usage> {
  return collectUsage(db.accounts, (a) => normalizeProxy(a.proxy));
}

/** Avatares ativos que estão sem nenhuma conta viva. */
export function avatarsWithoutLiveAccount(db: Pick<Db, "avatars" | "accounts">): Avatar[] {
  const withLive = new Set(db.accounts.filter(isLive).map((a) => a.avatar_id));
  return db.avatars.filter((avatar) => avatar.status === "ativo" && !withLive.has(avatar.id));
}

/** Calendário de aquecimento de uma conta, se existir. */
export function warmupOf(db: Pick<Db, "warmups">, accountId: string): Warmup | undefined {
  return db.warmups.find((w) => w.account_id === accountId);
}

/** Aquecimento em andamento: a conta está "aquecendo" e o calendário ainda não foi encerrado. */
export function isWarmupRunning(account: Account, warmup: Warmup | undefined): boolean {
  return Boolean(warmup) && account.status === "aquecendo" && !warmup?.finished_at;
}

/** Tudo que as telas precisam saber sobre um aquecimento em andamento. */
export interface RunningWarmup {
  warmup: Warmup;
  account: Account;
  avatar: Avatar;
  country: Country | undefined;
  phone: Phone | undefined;
  profile: AntidetectProfile | undefined;
  info: WarmupInfo;
}

/** Todos os aquecimentos em andamento, com a situação de cada um na data de hoje. */
export function runningWarmups(db: Db, today = todayISO()): RunningWarmup[] {
  const list: RunningWarmup[] = [];
  for (const warmup of db.warmups) {
    const account = db.accounts.find((a) => a.id === warmup.account_id);
    if (!account || !isWarmupRunning(account, warmup)) continue;
    const avatar = db.avatars.find((a) => a.id === account.avatar_id);
    if (!avatar) continue;
    list.push({
      warmup,
      account,
      avatar,
      country: db.countries.find((c) => c.id === avatar.country_id),
      phone: db.phones.find((p) => p.id === account.phone_id),
      profile: db.profiles.find((p) => p.id === account.profile_id),
      info: warmupInfo(warmup, today),
    });
  }
  return list.sort((a, b) => a.avatar.name.localeCompare(b.avatar.name, "pt-BR"));
}

/**
 * Contas "aquecendo" sem calendário em andamento: ou nunca tiveram um, ou o
 * calendário foi encerrado (ex.: a conta saiu de "aquecendo" e depois voltou).
 */
export function warmingWithoutPlan(db: Db): Account[] {
  const running = new Set(db.warmups.filter((w) => !w.finished_at).map((w) => w.account_id));
  return db.accounts.filter((a) => a.status === "aquecendo" && !running.has(a.id));
}
