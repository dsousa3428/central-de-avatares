"use client";

// "Memória" do painel: carrega todos os dados do usuário uma vez e mantém uma
// cópia local sempre atualizada. Toda gravação vai para o Supabase e, dando
// certo, reflete aqui. As regras de segurança (RLS) ficam no banco.

import { useSyncExternalStore } from "react";
import { getSupabase } from "./supabase";
import { AppError, toAppError } from "./errors";
import { EXAMPLES_VERSION, seedExamples, upgradeExamples } from "./examples";
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

let inFlight: Promise<boolean> | null = null;
let pendingWrites = 0;
/** Conta as gravações concluídas, para descartar leituras que ficaram velhas. */
let writeSeq = 0;

/** Lê tudo do servidor. Devolve true se os dados lidos foram para a tela. */
async function runLoad(userId: string, background: boolean): Promise<boolean> {
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

    // O painel ganhou dados de exemplo novos desde a última visita: completa os exemplos existentes.
    const examplesVersion = db.settings?.prefs?.examples_version ?? 0;
    if (!background && db.settings && examplesVersion < EXAMPLES_VERSION) {
      const changed = await upgradeExamples(db, examplesVersion);
      const { error } = await getSupabase()
        .from("settings")
        .update({ prefs: { ...db.settings.prefs, examples_version: EXAMPLES_VERSION } })
        .eq("user_id", userId);
      if (error) throw toAppError(error);
      db = changed
        ? await fetchEverything()
        : { ...db, settings: { ...db.settings, prefs: { ...db.settings.prefs, examples_version: EXAMPLES_VERSION } } };
    }

    if (state.userId !== userId) return false; // saiu ou trocou de usuário no meio
    // não atropela uma gravação feita enquanto esta leitura estava a caminho
    if (background && (pendingWrites > 0 || writeSeq !== seqAtStart)) return false;
    setState({ ...db, status: "ready", error: null, loadingMessage: null, loadedAt: Date.now() });
    return true;
  } catch (err) {
    if (state.userId !== userId) return false;
    if (background) return false; // atualização silenciosa: mantém o que já está na tela
    setState({ status: "error", error: toAppError(err), loadingMessage: null });
    return false;
  }
}

/** Carrega tudo do zero (mostra a tela de carregamento). */
export async function loadAll(userId: string): Promise<void> {
  if (inFlight && state.userId === userId) {
    await inFlight;
    return;
  }
  const run = runLoad(userId, false).finally(() => {
    if (inFlight === run) inFlight = null;
  });
  inFlight = run;
  await run;
}

/**
 * Recarrega em segundo plano, sem piscar a tela. Sempre busca dados novos; se
 * uma gravação acontecer no meio da leitura, tenta mais algumas vezes.
 */
export async function refresh(): Promise<void> {
  const userId = state.userId;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (!userId || state.userId !== userId || state.status !== "ready") return;
    // se já há uma leitura a caminho, espera ela terminar e faz outra em seguida
    if (inFlight) await inFlight.catch(() => false);
    if (state.userId !== userId || state.status !== "ready") return;
    const run = runLoad(userId, true).finally(() => {
      if (inFlight === run) inFlight = null;
    });
    inFlight = run;
    if (await run) return;
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
}

/** Recarrega em segundo plano se os dados estiverem "velhos" (ex.: ao voltar para a aba). */
export function refreshIfStale(maxAgeMs = 15_000): void {
  if (state.status !== "ready" || pendingWrites > 0 || inFlight) return;
  if (Date.now() - state.loadedAt < maxAgeMs) return;
  void refresh();
}

/** Limpa a memória (ao sair da conta). */
export function resetStore(): void {
  inFlight = null;
  rowTxns.clear();
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

export interface UpdateOptions {
  /**
   * Mostra a mudança na tela antes da resposta do servidor. Use só em toques
   * rápidos (marcar um item, trocar um status). Formulários não precisam: eles
   * já mostram "salvando" e só fecham quando dá certo.
   */
  optimistic?: boolean;
}

const STALE_MESSAGE =
  "Este item foi alterado em outro aparelho. Já atualizei os dados aqui — confira e tente de novo.";

/** Calcula os campos a gravar a partir da linha; null = nada a mudar. */
type ApplyChange = (row: Record<string, unknown>) => Record<string, unknown> | null;

/** Gravações em andamento de uma mesma linha (feitas em fila, uma de cada vez). */
interface RowTxn {
  /** Último estado que sabemos estar gravado no servidor. */
  confirmed: Record<string, unknown>;
  /** Mudanças otimistas ainda sem resposta, na ordem em que foram feitas. */
  optimistic: ApplyChange[];
  /** Quantas gravações desta linha ainda não terminaram. */
  pending: number;
  /** A linha mudou em outro aparelho: as gravações que estavam na fila são canceladas. */
  stale: boolean;
  /** Fila: cada gravação espera a anterior terminar. Nunca rejeita. */
  chain: Promise<void>;
}

const rowTxns = new Map<string, RowTxn>();

/** Tela = último estado confirmado + mudanças otimistas que ainda aguardam resposta, reaplicadas em ordem. */
function showRow<T extends TableName>(table: T, id: string, txn: RowTxn) {
  let row = txn.confirmed;
  for (const apply of txn.optimistic) {
    const patch = apply(row);
    if (patch) row = { ...row, ...patch };
  }
  patchLocal(table, id, row as Partial<Tables[T]>);
}

/**
 * Grava no servidor, mas só se a linha ainda estiver na versão que conhecemos
 * (compara o updated_at). Assim uma aba desatualizada nunca apaga, sem querer,
 * algo que foi salvo em outro aparelho.
 */
async function writeRow(
  table: TableName,
  id: string,
  values: Record<string, unknown>,
  txn: RowTxn,
): Promise<Record<string, unknown>> {
  const supabase = getSupabase();
  let query = supabase.from(table).update(values).eq("id", id);
  const knownVersion = txn.confirmed.updated_at;
  if (typeof knownVersion === "string") query = query.eq("updated_at", knownVersion);

  const { data, error } = await query.select().maybeSingle();
  if (error) throw error;
  if (data) return data as Record<string, unknown>;

  // Nenhuma linha gravada: ou o registro foi apagado, ou mudou em outro aparelho.
  const { data: fresh, error: readError } = await supabase.from(table).select().eq("id", id).maybeSingle();
  if (readError) throw readError;
  if (!fresh) throw new AppError("unknown", "Este registro não existe mais. Atualize a página.");
  txn.confirmed = fresh as Record<string, unknown>;
  txn.stale = true;
  throw new AppError("conflict", STALE_MESSAGE);
}

/**
 * A mudança pode ser um objeto pronto ou uma função que a calcula a partir da
 * linha. Use a função sempre que o valor novo depender do antigo (listas
 * inteiras, calendário): ela recebe a linha como está de fato — nunca a cópia
 * velha de uma tela que ficou aberta — e, se houver outras gravações da mesma
 * linha na fila, é calculada de novo depois que elas terminam. Assim nenhuma
 * regrava por cima da outra.
 * Se a função devolver null, nada é gravado. Ela pode ser chamada mais de uma
 * vez: deve só calcular a mudança, sem outros efeitos.
 */
export type RowChange<T extends TableName> = RowPatch<T> | ((current: Tables[T]) => RowPatch<T> | null);

/**
 * Atualiza um registro. Por padrão a tela só muda quando o servidor confirma.
 * Com `optimistic: true` a tela muda na hora e, se o servidor recusar, volta
 * para o último estado confirmado. Em qualquer caso o erro é devolvido para
 * quem chamou.
 */
export function updateRow<T extends TableName>(
  table: T,
  id: string,
  change: RowChange<T>,
  options: UpdateOptions = {},
): Promise<void> {
  const current = listOf(table).find((row) => row.id === id);
  if (!current) {
    return Promise.reject(
      new AppError("unknown", "Este registro não foi encontrado. Atualize a página e tente de novo."),
    );
  }
  const apply: ApplyChange =
    typeof change === "function"
      ? (row) => change(row as unknown as Tables[T]) as Record<string, unknown> | null
      : () => change as Record<string, unknown>;
  // nada a mudar no que está na tela agora: nem entra na fila
  if (!apply(current as unknown as Record<string, unknown>)) return Promise.resolve();

  const key = `${table}:${id}`;
  let txn = rowTxns.get(key);
  if (!txn) {
    txn = {
      confirmed: { ...(current as unknown as Record<string, unknown>) },
      optimistic: [],
      pending: 0,
      stale: false,
      chain: Promise.resolve(),
    };
    rowTxns.set(key, txn);
  }
  const t = txn;
  const previous = t.chain;

  t.pending += 1;
  if (options.optimistic) {
    t.optimistic.push(apply);
    showRow(table, id, t);
  }

  const result = tracked(async () => {
    await previous; // espera a gravação anterior desta mesma linha
    try {
      if (t.stale) throw new AppError("conflict", STALE_MESSAGE);
      // As gravações anteriores desta linha já terminaram: a mudança é calculada em cima do
      // que está gravado de fato, e não do que a tela mostrava quando o botão foi tocado.
      const values = apply(t.confirmed);
      if (values) t.confirmed = await writeRow(table, id, values, t);
    } finally {
      const index = t.optimistic.indexOf(apply);
      if (index >= 0) t.optimistic.splice(index, 1);
      t.pending -= 1;
      if (t.pending === 0 && rowTxns.get(key) === t) rowTxns.delete(key);
      showRow(table, id, t);
    }
  });

  t.chain = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
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

// (`vault` fica de fora de propósito: o cofre só é gravado por replaceVault / rekeyVault / eraseVault)
type SettingsPatch = Partial<Pick<Settings, "warmup_defaults" | "brl_rates" | "prefs">>;

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

const VAULT_CHANGED_MESSAGE =
  "O cofre foi alterado em outro aparelho. Já atualizei os dados aqui — confira e tente de novo.";

/** Lê de novo só a linha de configurações (ex.: antes de abrir o cofre, para usar a versão mais recente). */
export async function reloadSettings(): Promise<Settings | null> {
  const userId = state.userId;
  if (!userId) throw new AppError("auth", "Sua sessão expirou. Entre novamente.");
  let settings: Settings | null;
  try {
    settings = await fetchSettings();
  } catch (err) {
    throw toAppError(err);
  }
  if (state.userId === userId && settings) setState({ settings });
  return settings;
}

/**
 * Grava `settings.vault`, mas só se o cofre no banco ainda for o que este
 * aparelho conhece: `expectedSalt` é o sal do cofre atual (ou null se o cofre
 * ainda não existe). Evita que dois aparelhos criem cofres diferentes ao mesmo
 * tempo, o que deixaria senhas impossíveis de abrir.
 * É o único caminho para escrever em `settings.vault` (fora `rekeyVault` e `eraseVault`).
 */
export function replaceVault(next: Record<string, unknown> | null, expectedSalt: string | null): Promise<void> {
  const userId = state.userId;
  if (!userId) return Promise.reject(new AppError("auth", "Sua sessão expirou. Entre novamente."));
  return tracked(async () => {
    const base = getSupabase().from("settings").update({ vault: next }).eq("user_id", userId);
    const guarded = expectedSalt === null ? base.is("vault", null) : base.eq("vault->>salt", expectedSalt);
    const { data, error } = await guarded.select().maybeSingle();
    if (error) throw error;
    if (data) {
      setState({ settings: data as Settings });
      return;
    }
    // nada foi gravado: o cofre mudou (ou foi criado) em outro aparelho
    const fresh = await fetchSettings();
    if (fresh && state.userId === userId) setState({ settings: fresh });
    throw new AppError("conflict", VAULT_CHANGED_MESSAGE);
  });
}

/** Os blocos cifrados de todas as contas, lidos direto do servidor (para a troca da senha-mestra). */
export async function fetchSecretBlobs(): Promise<Array<{ id: string; secrets_enc: string }>> {
  const rows: Array<{ id: string; secrets_enc: string }> = [];
  // em páginas: a API devolve no máximo 1000 linhas por vez, e nenhuma conta pode ficar de fora
  for (;;) {
    const { data, error } = await getSupabase()
      .from("accounts")
      .select("id, secrets_enc")
      .not("secrets_enc", "is", null)
      .order("id", { ascending: true })
      .range(rows.length, rows.length + 999);
    if (error) throw toAppError(error);
    const page = (data ?? []) as Array<{ id: string; secrets_enc: string }>;
    rows.push(...page);
    if (page.length < 1000) return rows;
  }
}

/** Número da estrutura do banco (função `cda_schema_version`). 1 = script antigo, sem a função. */
export async function schemaVersion(): Promise<number> {
  const { data, error } = await getSupabase().rpc("cda_schema_version");
  if (error) {
    if (isMissingFunction(error)) return 1;
    throw toAppError(error);
  }
  return typeof data === "number" ? data : 1;
}

function isMissingFunction(error: { code?: string; message?: string }): boolean {
  return error.code === "PGRST202" || error.code === "42883" || /could not find the function/i.test(error.message ?? "");
}

/** O banco ainda não tem a função de trocar a senha-mestra (falta rodar o script SQL atualizado). */
export const REKEY_UNAVAILABLE = "rekey_unavailable";

/**
 * Troca da senha-mestra, de uma vez só (função `cda_vault_rekey` do banco): a
 * nova configuração do cofre e as senhas de todas as contas, já recifradas.
 * Ou grava tudo, ou não grava nada.
 */
export function rekeyVault(
  expectedSalt: string,
  nextVault: Record<string, unknown>,
  blobs: Record<string, { old: string; new: string }>,
): Promise<void> {
  const userId = state.userId;
  if (!userId) return Promise.reject(new AppError("auth", "Sua sessão expirou. Entre novamente."));
  return tracked(async () => {
    const { error } = await getSupabase().rpc("cda_vault_rekey", {
      expected_salt: expectedSalt,
      new_vault: nextVault,
      new_secrets: blobs,
    });
    if (error) {
      const message = error.message ?? "";
      if (isMissingFunction(error)) {
        throw new AppError(
          "schema",
          "Para trocar a senha-mestra é preciso atualizar o banco de dados uma vez (o script SQL mudou).",
          REKEY_UNAVAILABLE,
          message,
        );
      }
      if (message.includes("cda_vault_changed")) throw new AppError("conflict", VAULT_CHANGED_MESSAGE);
      if (message.includes("cda_vault_secrets_changed")) {
        throw new AppError(
          "conflict",
          "As senhas de alguma conta mudaram em outro aparelho enquanto a troca era preparada. Nada foi alterado: tente de novo.",
        );
      }
      throw error;
    }
    // A troca já está gravada: se a leitura logo em seguida falhar, não é a troca que falhou.
    try {
      await reloadVaultData(userId);
    } catch {
      void refresh();
    }
  });
}

/** Depois de uma mudança feita de uma vez no banco: traz de volta as configurações e as contas. */
async function reloadVaultData(userId: string): Promise<void> {
  const [settings, accounts] = await Promise.all([fetchSettings(), fetchAll("accounts")]);
  if (state.userId !== userId) return;
  setState({ accounts: accounts.sort(SORTERS.accounts), ...(settings ? { settings } : {}) });
}

/**
 * Apaga o cofre: remove as senhas cifradas de todas as contas e a configuração
 * do cofre. Usado só quando a senha-mestra foi perdida. Não tem volta.
 * `expectedSalt` é o cofre que a tela estava mostrando: se ele mudou em outro
 * aparelho (ex.: a senha-mestra foi trocada lá), nada é apagado.
 */
export function eraseVault(expectedSalt: string | null): Promise<void> {
  const userId = state.userId;
  if (!userId) return Promise.reject(new AppError("auth", "Sua sessão expirou. Entre novamente."));
  return tracked(async () => {
    const supabase = getSupabase();
    const current = await fetchSettings();
    const salt = (current?.vault as { salt?: unknown } | null)?.salt;
    if ((typeof salt === "string" ? salt : null) !== expectedSalt) {
      if (current && state.userId === userId) setState({ settings: current });
      throw new AppError(
        "conflict",
        "O cofre mudou em outro aparelho (a senha-mestra pode ter sido trocada lá). Nada foi apagado: confira antes de tentar de novo.",
      );
    }
    const cleared = await supabase.from("accounts").update({ secrets_enc: null }).not("secrets_enc", "is", null);
    if (cleared.error) throw cleared.error;
    const { error } = await supabase.from("settings").update({ vault: null }).eq("user_id", userId);
    if (error) throw error;
    try {
      await reloadVaultData(userId);
    } catch {
      void refresh();
    }
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
