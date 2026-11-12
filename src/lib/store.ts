"use client";

// "Memória" do painel: carrega todos os dados do usuário uma vez e mantém uma
// cópia local sempre atualizada. Toda gravação vai para o Supabase e, dando
// certo, reflete aqui. As regras de segurança (RLS) ficam no banco.

import { useSyncExternalStore } from "react";
import { getSupabase } from "./supabase";
import { AppError, toAppError } from "./errors";
import { EXAMPLES_VERSION, seedExamples } from "./examples";
import { naturalCompare } from "./format";
import type {
  Account,
  ActivityEntry,
  AntidetectProfile,
  Avatar,
  Country,
  NewRow,
  Phone,
  RowPatch,
  Settings,
  TableName,
  Tables,
  Warmup,
  WeeklySale,
} from "./types";

export interface Db {
  countries: Country[];
  avatars: Avatar[];
  accounts: Account[];
  phones: Phone[];
  profiles: AntidetectProfile[];
  warmups: Warmup[];
  sales: WeeklySale[];
  activity: ActivityEntry[];
  settings: Settings | null;
}

export type LoadStatus = "idle" | "loading" | "ready" | "error";

export interface StoreState extends Db {
  status: LoadStatus;
  error: AppError | null;
  userId: string | null;
  /** Texto mostrado enquanto carrega (ex.: "Preparando exemplos…"). */
  loadingMessage: string | null;
  loadedAt: number;
}

const EMPTY: StoreState = {
  status: "idle",
  error: null,
  userId: null,
  loadingMessage: null,
  loadedAt: 0,
  countries: [],
  avatars: [],
  accounts: [],
  phones: [],
  profiles: [],
  warmups: [],
  sales: [],
  activity: [],
  settings: null,
};

/** Nome da tabela no banco -> nome da lista na memória. */
const KEY_OF = {
  countries: "countries",
  phones: "phones",
  antidetect_profiles: "profiles",
  avatars: "avatars",
  accounts: "accounts",
  warmups: "warmups",
  weekly_sales: "sales",
  activity_log: "activity",
} as const satisfies Record<TableName, keyof Db>;

const SORTERS: { [T in TableName]: (a: Tables[T], b: Tables[T]) => number } = {
  countries: (a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at),
  phones: (a, b) => naturalCompare(a.nickname, b.nickname),
  antidetect_profiles: (a, b) => naturalCompare(a.number, b.number),
  avatars: (a, b) => a.position - b.position || naturalCompare(a.name, b.name),
  accounts: (a, b) => a.generation - b.generation,
  warmups: (a, b) => a.created_at.localeCompare(b.created_at),
  weekly_sales: (a, b) => b.week_start.localeCompare(a.week_start),
  activity_log: (a, b) => b.occurred_at.localeCompare(a.occurred_at),
};

// ---------------------------------------------------------------------------
// Estado + assinatura (useSyncExternalStore)
// ---------------------------------------------------------------------------

let state: StoreState = EMPTY;
const listeners = new Set<() => void>();

function setState(patch: Partial<StoreState>) {
  state = { ...state, ...patch };
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot() {
  return state;
}

function getServerSnapshot() {
  return EMPTY;
}

/** Todos os dados do painel + situação do carregamento. */
export function useStore(): StoreState {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** Leitura direta (fora de componentes). */
export function getStore(): StoreState {
  return state;
}

function listOf<T extends TableName>(table: T): Tables[T][] {
  return state[KEY_OF[table]] as unknown as Tables[T][];
}

function setList<T extends TableName>(table: T, rows: Tables[T][]) {
  const sorted = [...rows].sort(SORTERS[table]);
  setState({ [KEY_OF[table]]: sorted } as unknown as Partial<StoreState>);
}

// ---------------------------------------------------------------------------
// Carregamento
// ---------------------------------------------------------------------------

async function fetchAll<T extends TableName>(table: T): Promise<Tables[T][]> {
  const supabase = getSupabase();
  const rows: Tables[T][] = [];
  let total = Infinity;
  // Lê em páginas: o Supabase devolve no máximo 1000 linhas por vez.
  while (rows.length < total) {
    const { data, error, count } = await supabase
      .from(table)
      .select("*", { count: "exact" })
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(rows.length, rows.length + 999);
    if (error) throw toAppError(error);
    const page = (data ?? []) as Tables[T][];
    rows.push(...page);
    total = count ?? rows.length;
    if (page.length === 0) break;
  }
  return rows;
}

async function fetchSettings(): Promise<Settings | null> {
  const { data, error } = await getSupabase().from("settings").select("*").maybeSingle();
  if (error) throw toAppError(error);
  return (data as Settings | null) ?? null;
}

async function fetchEverything(): Promise<Db> {
  const [countries, phones, profiles, avatars, accounts, warmups, sales, activity, settings] =
    await Promise.all([
      fetchAll("countries"),
      fetchAll("phones"),
      fetchAll("antidetect_profiles"),
      fetchAll("avatars"),
      fetchAll("accounts"),
      fetchAll("warmups"),
      fetchAll("weekly_sales"),
      fetchAll("activity_log"),
      fetchSettings(),
    ]);
  return {
    countries: countries.sort(SORTERS.countries),
    phones: phones.sort(SORTERS.phones),
    profiles: profiles.sort(SORTERS.antidetect_profiles),
    avatars: avatars.sort(SORTERS.avatars),
    accounts: accounts.sort(SORTERS.accounts),
    warmups: warmups.sort(SORTERS.warmups),
    sales: sales.sort(SORTERS.weekly_sales),
    activity: activity.sort(SORTERS.activity_log),
    settings,
  };
}

let inFlight: Promise<void> | null = null;
let pendingWrites = 0;
/** Conta as gravações concluídas, para descartar leituras que ficaram velhas. */
let writeSeq = 0;

async function runLoad(userId: string, background: boolean): Promise<void> {
  if (!background) {
    setState({ ...EMPTY, status: "loading", userId });
  }
  const seqAtStart = writeSeq;
  try {
    let db = await fetchEverything();

    // Primeira vez que este usuário abre o painel: cria os exemplos.
    if (!db.settings) {
      const isEmpty =
        db.countries.length === 0 &&
        db.avatars.length === 0 &&
        db.phones.length === 0 &&
        db.profiles.length === 0;
      if (isEmpty) {
        setState({ loadingMessage: "Preparando os dados de exemplo…" });
        await seedExamples();
      }
      const { error } = await getSupabase()
        .from("settings")
        .upsert({ user_id: userId, prefs: { examples_version: isEmpty ? EXAMPLES_VERSION : 0 } });
      if (error) throw toAppError(error);
      db = await fetchEverything();
    }

    if (state.userId !== userId) return; // saiu ou trocou de usuário no meio
    // não atropela uma gravação feita enquanto esta leitura estava a caminho
    if (background && (pendingWrites > 0 || writeSeq !== seqAtStart)) return;
    setState({ ...db, status: "ready", error: null, loadingMessage: null, loadedAt: Date.now() });
  } catch (err) {
    if (state.userId !== userId) return;
    if (background) return; // atualização silenciosa: mantém o que já está na tela
    setState({ status: "error", error: toAppError(err), loadingMessage: null });
  }
}

/** Carrega tudo do zero (mostra a tela de carregamento). */
export function loadAll(userId: string): Promise<void> {
  if (inFlight && state.userId === userId) return inFlight;
  const run = runLoad(userId, false).finally(() => {
    if (inFlight === run) inFlight = null;
  });
  inFlight = run;
  return run;
}

/** Recarrega em segundo plano, sem piscar a tela. Sempre busca dados novos. */
export async function refresh(): Promise<void> {
  const userId = state.userId;
  if (!userId || state.status !== "ready") return;
  // se já há uma leitura a caminho, espera ela terminar e faz outra em seguida
  if (inFlight) await inFlight.catch(() => undefined);
  if (state.userId !== userId || state.status !== "ready") return;
  const run = runLoad(userId, true).finally(() => {
    if (inFlight === run) inFlight = null;
  });
  inFlight = run;
  return run;
}

/** Recarrega em segundo plano se os dados estiverem "velhos" (ex.: ao voltar para a aba). */
export function refreshIfStale(maxAgeMs = 60_000): void {
  if (state.status !== "ready" || pendingWrites > 0 || inFlight) return;
  if (Date.now() - state.loadedAt < maxAgeMs) return;
  void refresh();
}

/** Limpa a memória (ao sair da conta). */
export function resetStore(): void {
  inFlight = null;
  setState({ ...EMPTY });
}

// ---------------------------------------------------------------------------
// Gravações
// ---------------------------------------------------------------------------

async function tracked<T>(work: () => Promise<T>): Promise<T> {
  pendingWrites += 1;
  try {
    return await work();
  } catch (err) {
    throw toAppError(err);
  } finally {
    pendingWrites -= 1;
    writeSeq += 1;
  }
}

export function insertRow<T extends TableName>(table: T, values: NewRow<T>): Promise<Tables[T]> {
  return tracked(async () => {
    const { data, error } = await getSupabase().from(table).insert(values).select().single();
    if (error) throw error;
    const row = data as Tables[T];
    setList(table, [...listOf(table), row]);
    return row;
  });
}

export function insertRows<T extends TableName>(table: T, values: NewRow<T>[]): Promise<Tables[T][]> {
  if (values.length === 0) return Promise.resolve([]);
  return tracked(async () => {
    const { data, error } = await getSupabase().from(table).insert(values).select();
    if (error) throw error;
    const rows = (data ?? []) as Tables[T][];
    setList(table, [...listOf(table), ...rows]);
    return rows;
  });
}

function patchLocal<T extends TableName>(table: T, id: string, patch: Partial<Tables[T]>) {
  setList(
    table,
    listOf(table).map((row) => (row.id === id ? { ...row, ...patch } : row)),
  );
}

/**
 * Atualiza um registro. A tela muda na hora (otimista); se o servidor recusar,
 * o valor antigo volta e o erro é devolvido para quem chamou.
 */
export function updateRow<T extends TableName>(table: T, id: string, patch: RowPatch<T>): Promise<void> {
  const before = listOf(table).find((row) => row.id === id);
  if (!before) {
    return Promise.reject(
      new AppError("unknown", "Este registro não foi encontrado. Atualize a página e tente de novo."),
    );
  }
  const previous: Record<string, unknown> = {};
  for (const key of Object.keys(patch)) {
    previous[key] = (before as unknown as Record<string, unknown>)[key];
  }
  patchLocal(table, id, patch as Partial<Tables[T]>);

  return tracked(async () => {
    try {
      const { data, error } = await getSupabase()
        .from(table)
        .update(patch as Record<string, unknown>)
        .eq("id", id)
        .select("updated_at")
        .maybeSingle();
      if (error) throw error;
      if (!data) {
        throw new AppError("unknown", "Este registro não existe mais. Atualize a página.");
      }
      const updatedAt = (data as { updated_at?: string }).updated_at;
      if (updatedAt) patchLocal(table, id, { updated_at: updatedAt } as unknown as Partial<Tables[T]>);
    } catch (err) {
      patchLocal(table, id, previous as Partial<Tables[T]>);
      throw err;
    }
  });
}

/** Remove da memória um registro e tudo que o banco apaga junto (cascata). */
function removeLocal(table: TableName, id: string) {
  const next: Partial<Db> = {};
  const dropAccounts = (accountIds: Set<string>) => {
    next.accounts = (next.accounts ?? state.accounts).filter((a) => !accountIds.has(a.id));
    next.warmups = (next.warmups ?? state.warmups).filter((w) => !accountIds.has(w.account_id));
    next.activity = (next.activity ?? state.activity).filter(
      (e) => !e.account_id || !accountIds.has(e.account_id),
    );
    next.sales = (next.sales ?? state.sales).map((s) =>
      s.account_id && accountIds.has(s.account_id) ? { ...s, account_id: null } : s,
    );
  };

  switch (table) {
    case "countries":
      next.countries = state.countries.filter((r) => r.id !== id);
      break;
    case "avatars": {
      next.avatars = state.avatars.filter((r) => r.id !== id);
      dropAccounts(new Set(state.accounts.filter((a) => a.avatar_id === id).map((a) => a.id)));
      next.sales = (next.sales ?? state.sales).filter((s) => s.avatar_id !== id);
      next.activity = (next.activity ?? state.activity).filter((e) => e.avatar_id !== id);
      break;
    }
    case "accounts":
      dropAccounts(new Set([id]));
      break;
    case "phones":
      next.phones = state.phones.filter((r) => r.id !== id);
      next.accounts = state.accounts.map((a) => (a.phone_id === id ? { ...a, phone_id: null } : a));
      break;
    case "antidetect_profiles":
      next.profiles = state.profiles.filter((r) => r.id !== id);
      next.accounts = state.accounts.map((a) => (a.profile_id === id ? { ...a, profile_id: null } : a));
      break;
    case "warmups":
      next.warmups = state.warmups.filter((r) => r.id !== id);
      break;
    case "weekly_sales":
      next.sales = state.sales.filter((r) => r.id !== id);
      break;
    case "activity_log":
      next.activity = state.activity.filter((r) => r.id !== id);
      break;
  }
  setState(next);
}

export function deleteRow(table: TableName, id: string): Promise<void> {
  return tracked(async () => {
    const { error } = await getSupabase().from(table).delete().eq("id", id);
    if (error) throw error;
    removeLocal(table, id);
  });
}

type SettingsPatch = Partial<Pick<Settings, "vault" | "warmup_defaults" | "brl_rates" | "prefs">>;

export function saveSettings(patch: SettingsPatch): Promise<void> {
  const userId = state.userId;
  if (!userId) return Promise.reject(new AppError("auth", "Sua sessão expirou. Entre novamente."));
  return tracked(async () => {
    const { data, error } = await getSupabase()
      .from("settings")
      .upsert({ user_id: userId, ...patch })
      .select()
      .single();
    if (error) throw error;
    setState({ settings: data as Settings });
  });
}

interface ActivityInput {
  avatar_id: string;
  account_id?: string | null;
  kind: ActivityEntry["kind"];
  message: string;
  data?: Record<string, unknown> | null;
  is_example?: boolean;
}

/** Registra um evento na linha do tempo. Nunca atrapalha a ação principal. */
export async function logActivity(entry: ActivityInput): Promise<void> {
  try {
    await insertRow("activity_log", {
      avatar_id: entry.avatar_id,
      account_id: entry.account_id ?? null,
      kind: entry.kind,
      message: entry.message,
      data: entry.data ?? null,
      is_example: entry.is_example ?? false,
    });
  } catch (err) {
    console.warn("Não foi possível registrar a atividade:", err);
  }
}
