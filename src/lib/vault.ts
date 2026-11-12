"use client";

// Cofre de senhas — o estado que vive só na memória deste aparelho:
// a chave aberta, as senhas já decifradas e o que está "à mostra" na tela.
// Nada daqui é gravado em disco (nem localStorage, nem cookies, nem banco).
// As contas ficam em ./vault-crypto.

import { forgetCopiedSecret } from "./clipboard";
import { AppError, toAppError } from "./errors";
import {
  eraseVault,
  fetchSecretBlobs,
  getStore,
  logActivity,
  refresh,
  rekeyVault,
  reloadSettings,
  replaceVault,
  updateRow,
} from "./store";
import type { Account, Settings } from "./types";
import {
  createVault,
  decryptSecrets,
  encryptSecrets,
  hasSecrets,
  isKnownPayload,
  openVault,
  parseVaultConfig,
  reencryptSecrets,
  WrongPasswordError,
  type AccountSecrets,
  type SecretField,
} from "./vault-crypto";

/** Senhas de uma conta já decifradas (ou o motivo de não ter conseguido). */
export type SecretsEntry =
  | { payload: string; secrets: AccountSecrets; error?: undefined }
  | {
      payload: string;
      secrets?: undefined;
      error: string;
      /** Pode oferecer "guardar de novo"? (não, quando o bloco é de uma versão mais nova do painel) */
      replaceable: boolean;
    };

/** Retrato do cofre para as telas. Um objeto novo a cada mudança. */
export interface VaultSnapshot {
  unlocked: boolean;
  /** Muda a cada vez que o cofre é aberto. */
  session: number;
  /** Senhas decifradas, por id da conta. Vazio quando o cofre está trancado. */
  secrets: ReadonlyMap<string, SecretsEntry>;
  /** Campos que estão à mostra agora: "idDaConta:campo". */
  revealed: ReadonlySet<string>;
}

const LOCKED: VaultSnapshot = { unlocked: false, session: 0, secrets: new Map(), revealed: new Set() };

interface Session {
  id: number;
  key: CryptoKey;
  userId: string;
  /** O sal do cofre (settings.vault.salt) que esta sessão abriu: identifica "qual cofre". */
  salt: string;
}

let session: Session | null = null;
let sessionCounter = 0;
let lastActivity = 0;
const decrypted = new Map<string, SecretsEntry>();
const decrypting = new Set<string>();
const revealed = new Set<string>();
const revealTimers = new Map<string, ReturnType<typeof setTimeout>>();

let snapshot: VaultSnapshot = LOCKED;
const listeners = new Set<() => void>();

function emit() {
  snapshot = session
    ? { unlocked: true, session: session.id, secrets: new Map(decrypted), revealed: new Set(revealed) }
    : LOCKED;
  for (const listener of listeners) listener();
}

export function subscribeVault(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getVaultSnapshot(): VaultSnapshot {
  return snapshot;
}

export function getLockedSnapshot(): VaultSnapshot {
  return LOCKED;
}

/**
 * A chave aberta — só se o cofre estiver destrancado para o usuário que está
 * logado agora e ainda for o mesmo cofre (ver `syncVaultWithSettings`).
 */
function currentSession(): Session | null {
  if (session) {
    const store = getStore();
    if (session.userId !== store.userId) lockVault();
    else syncVaultWithSettings(store.settings);
  }
  return session;
}

/**
 * Se o cofre mudou em outro aparelho (senha-mestra trocada, cofre apagado ou
 * recriado), a sessão aberta aqui deixa de valer: tranca, e a senha-mestra
 * atual passa a ser exigida. Devolve true se trancou.
 */
export function syncVaultWithSettings(settings: Pick<Settings, "vault"> | null | undefined): boolean {
  if (!session || !settings) return false;
  if (parseVaultConfig(settings.vault)?.salt === session.salt) return false;
  lockVault();
  changedElsewhere?.();
  return true;
}

let changedElsewhere: (() => void) | null = null;

/** Quem avisa o usuário quando o cofre tranca por ter mudado em outro aparelho (um aviso só, venha de onde vier). */
export function onVaultChangedElsewhere(listener: (() => void) | null): void {
  changedElsewhere = listener;
}

function requireSession(): Session {
  const current = currentSession();
  if (!current) throw new AppError("invalid", "O cofre está trancado. Destranque com a senha-mestra e tente de novo.");
  return current;
}

// ---------------------------------------------------------------------------
// Situação do cofre
// ---------------------------------------------------------------------------

/**
 * none: ainda não foi criado · locked / unlocked · unsupported: existe, mas num
 * formato que esta versão do painel não entende (nunca criar outro por cima).
 */
export type VaultState = "none" | "locked" | "unlocked" | "unsupported";

export function vaultStateOf(settings: Pick<Settings, "vault"> | null | undefined, unlocked: boolean): VaultState {
  const raw = settings?.vault;
  if (raw === null || raw === undefined) return "none";
  if (!parseVaultConfig(raw)) return "unsupported";
  return unlocked ? "unlocked" : "locked";
}

// ---------------------------------------------------------------------------
// Trancar sozinho
// ---------------------------------------------------------------------------

export const LOCK_OPTIONS = [1, 5, 15, 30] as const;
export const DEFAULT_LOCK_MINUTES = 5;

/** Minutos sem uso até o cofre trancar sozinho (Configurações). */
export function lockMinutesOf(settings: Pick<Settings, "prefs"> | null | undefined): number {
  const value = settings?.prefs?.vault_lock_minutes;
  return typeof value === "number" && (LOCK_OPTIONS as readonly number[]).includes(value) ? value : DEFAULT_LOCK_MINUTES;
}

/** Registra que o painel está sendo usado (adia o trancamento automático). */
export function touchVault(): void {
  if (session) lastActivity = Date.now();
}

/** Tranca se passou o tempo sem uso. Devolve true se trancou agora. */
export function lockIfIdle(minutes: number): boolean {
  if (!session) return false;
  const elapsed = Date.now() - lastActivity;
  // (um relógio que andou para trás também conta como prazo vencido)
  if (elapsed >= 0 && elapsed < minutes * 60_000) return false;
  lockVault();
  return true;
}

// ---------------------------------------------------------------------------
// Abrir, trancar, criar, trocar a senha, apagar
// ---------------------------------------------------------------------------

function startSession(key: CryptoKey, userId: string, salt: string) {
  clearMemory();
  sessionCounter += 1;
  session = { id: sessionCounter, key, userId, salt };
  lastActivity = Date.now();
  emit();
}

function clearMemory() {
  session = null;
  decrypted.clear();
  decrypting.clear();
  revealed.clear();
  for (const timer of revealTimers.values()) clearTimeout(timer);
  revealTimers.clear();
}

// "Trancar" tocado numa aba vale para as outras abas do painel abertas no mesmo navegador.
const channel =
  typeof window !== "undefined" && typeof BroadcastChannel === "function" ? new BroadcastChannel("cda-cofre") : null;
if (channel) {
  channel.onmessage = (event: MessageEvent) => {
    if (event.data === "trancar") lockVault();
  };
}

/**
 * Tranca o cofre: a chave e tudo que estava decifrado saem da memória.
 * `everywhere`: tranca também nas outras abas (usado no botão "Trancar"; o
 * trancamento por falta de uso é de cada aba).
 */
export function lockVault(options: { everywhere?: boolean } = {}): void {
  if (options.everywhere) channel?.postMessage("trancar");
  if (!session && decrypted.size === 0 && revealed.size === 0) return;
  clearMemory();
  forgetCopiedSecret();
  emit();
}

/** A criptografia do navegador só existe em páginas seguras (https, ou localhost nos testes). */
function requireCrypto(): void {
  if (typeof crypto === "undefined" || !crypto.subtle) {
    throw new AppError(
      "unknown",
      "Este navegador não liberou a criptografia nesta página. Abra o painel pelo endereço https:// e tente de novo.",
    );
  }
}

function wrongPassword(err: unknown): never {
  if (err instanceof WrongPasswordError) throw new AppError("invalid", "Senha-mestra incorreta.");
  throw toAppError(err);
}

/**
 * Depois de uma falha de rede numa gravação do cofre: qual cofre ficou no banco?
 * (a resposta pode ter se perdido depois de a gravação ter dado certo)
 * Devolve o sal, null se não há cofre, ou undefined se não deu para conferir.
 */
async function storedSalt(): Promise<string | null | undefined> {
  try {
    return parseVaultConfig((await reloadSettings())?.vault)?.salt ?? null;
  } catch {
    return undefined;
  }
}

/** Cria o cofre com a senha-mestra escolhida e já o deixa aberto. */
export async function createVaultWithPassword(password: string): Promise<void> {
  requireCrypto();
  const userId = getStore().userId;
  if (!userId) throw new AppError("auth", "Sua sessão expirou. Entre novamente.");
  // confere no servidor se outro aparelho já não criou o cofre
  const settings = await reloadSettings();
  if (vaultStateOf(settings, false) !== "none") {
    throw new AppError(
      "conflict",
      "O cofre já existe (foi criado em outro aparelho ou numa tentativa anterior). Feche esta janela e use “Destrancar” com a senha-mestra dele.",
    );
  }
  const { config, key } = await createVault(password);
  try {
    await replaceVault(config as unknown as Record<string, unknown>, null);
  } catch (err) {
    if (toAppError(err).kind !== "network") throw err;
    const stored = await storedSalt();
    if (stored === undefined) {
      throw new AppError(
        "network",
        "Sem conexão: não consegui confirmar se o cofre foi criado. Quando a internet voltar, abra esta tela de novo — se aparecer “Destrancar”, use a senha-mestra que você acabou de digitar.",
      );
    }
    if (stored !== config.salt) throw err; // de fato não gravou
  }
  if (getStore().userId === userId) startSession(key, userId, config.salt);
}

/** Destranca o cofre. Senha errada → erro "Senha-mestra incorreta." */
export async function unlockVault(password: string): Promise<void> {
  requireCrypto();
  const userId = getStore().userId;
  if (!userId) throw new AppError("auth", "Sua sessão expirou. Entre novamente.");
  let settings = getStore().settings;
  try {
    // a senha-mestra pode ter sido trocada em outro aparelho: usa a configuração mais recente
    settings = await reloadSettings();
  } catch {
    // sem internet: segue com a configuração que já está na memória
  }
  const config = parseVaultConfig(settings?.vault);
  if (!config) throw new AppError("invalid", "Não encontrei um cofre para abrir. Atualize a página e tente de novo.");
  let key: CryptoKey;
  try {
    // (a senha-mestra nunca começa nem termina com espaço: um espaço a mais no fim é erro de digitação)
    key = await openVault(config, password.trim());
  } catch (err) {
    wrongPassword(err);
  }
  if (getStore().userId === userId) startSession(key, userId, config.salt);
}

/**
 * Troca a senha-mestra. A chave do cofre sai da senha, então ela muda junto:
 * todas as senhas guardadas são abertas com a chave antiga, cifradas de novo
 * com a nova (aqui, no aparelho) e gravadas de uma vez só pelo banco — ou tudo,
 * ou nada. Devolve quantas contas tinham um bloco que já não abria (ficam como estavam).
 */
export async function changeMasterPassword(currentPassword: string, newPassword: string): Promise<{ unreadable: number }> {
  requireCrypto();
  const userId = getStore().userId;
  if (!userId) throw new AppError("auth", "Sua sessão expirou. Entre novamente.");
  const settings = await reloadSettings();
  const config = parseVaultConfig(settings?.vault);
  if (!config) throw new AppError("invalid", "Não encontrei um cofre para alterar. Atualize a página e tente de novo.");

  let oldKey: CryptoKey;
  try {
    oldKey = await openVault(config, currentPassword.trim());
  } catch (err) {
    wrongPassword(err);
  }
  const next = await createVault(newPassword);

  // recifra, na memória, o bloco de cada conta (lidos direto do servidor, não da cópia local)
  const blobs: Record<string, { old: string; new: string }> = {};
  let unreadable = 0;
  for (const row of await fetchSecretBlobs()) {
    try {
      blobs[row.id] = { old: row.secrets_enc, new: await reencryptSecrets(oldKey, next.key, row.id, row.secrets_enc) };
    } catch {
      // este bloco já não abria com a senha atual: continua exatamente como estava
      blobs[row.id] = { old: row.secrets_enc, new: row.secrets_enc };
      unreadable += 1;
    }
  }

  // Se o cofre estava aberto aqui, ele fica trancado enquanto a troca é gravada (assim nenhuma tela
  // tenta abrir um bloco novo com a chave antiga, ou o contrário) e reabre em seguida, sozinho.
  const wasOpen = Boolean(session && session.userId === userId && session.salt === config.salt);
  if (wasOpen) lockVault();
  const reopen = (key: CryptoKey, salt: string) => {
    if (wasOpen && getStore().userId === userId) startSession(key, userId, salt);
  };
  try {
    await rekeyVault(config.salt, next.config as unknown as Record<string, unknown>, blobs);
  } catch (err) {
    const stored = toAppError(err).kind === "network" ? await storedSalt() : config.salt;
    if (stored === undefined) {
      // não dá para saber qual das duas senhas está valendo: fica trancado, com a explicação
      throw new AppError(
        "network",
        "Sem conexão: não consegui confirmar se a troca foi gravada. Quando a internet voltar, tente destrancar — se a senha antiga não abrir, a nova já está valendo.",
      );
    }
    if (stored !== next.config.salt) {
      reopen(oldKey, config.salt); // de fato não gravou: tudo continua como antes
      throw err;
    }
    // a resposta se perdeu, mas a troca foi gravada: segue como sucesso (e busca as contas regravadas)
    void refresh();
  }
  reopen(next.key, next.config.salt);
  return { unreadable };
}

/** Apaga o cofre e todas as senhas guardadas (para quem perdeu a senha-mestra). Não tem volta. */
export async function destroyVault(): Promise<void> {
  // o cofre que a tela está mostrando: se ele mudou em outro aparelho, nada é apagado
  const shown = parseVaultConfig(getStore().settings?.vault)?.salt ?? null;
  lockVault({ everywhere: true });
  await eraseVault(shown);
}

// ---------------------------------------------------------------------------
// Senhas de uma conta
// ---------------------------------------------------------------------------

/** Decifra as senhas de uma conta para a memória (se o cofre estiver aberto). */
export async function loadSecrets(account: Pick<Account, "id" | "secrets_enc">): Promise<void> {
  const current = currentSession();
  const payload = account.secrets_enc;
  if (!current || !payload) return;
  if (decrypted.get(account.id)?.payload === payload) return;
  const ticket = `${current.id}:${account.id}:${payload}`;
  if (decrypting.has(ticket)) return;
  decrypting.add(ticket);
  let entry: SecretsEntry;
  if (!isKnownPayload(payload)) {
    // gravado por uma versão mais nova do painel: não oferecer "guardar de novo" (apagaria o que está lá)
    entry = {
      payload,
      error: "Estas senhas foram guardadas por uma versão mais nova do painel. Atualize a página para ver.",
      replaceable: false,
    };
    decrypting.delete(ticket);
  } else {
    try {
      entry = { payload, secrets: await decryptSecrets(current.key, account.id, payload) };
    } catch {
      entry = {
        payload,
        error: "Não consegui abrir as senhas desta conta com o cofre atual. Isso acontece quando elas foram guardadas com outro cofre.",
        replaceable: true,
      };
    } finally {
      decrypting.delete(ticket);
    }
  }
  // o cofre pode ter sido trancado (ou reaberto) enquanto a conta era feita
  if (session !== current) return;
  decrypted.set(account.id, entry);
  emit();
}

/**
 * Cifra e grava as senhas de uma conta. Com tudo vazio, apaga o que estava guardado.
 * `base` é o bloco cifrado que estava na conta quando a edição começou: se nesse
 * meio tempo ele mudou (outro aparelho), nada é gravado — senão a versão antiga
 * que estava aberta no formulário apagaria a mais nova sem ninguém perceber.
 */
export async function saveSecrets(account: Account, secrets: AccountSecrets, base: string | null): Promise<void> {
  // Antes de cifrar, confere no servidor se o cofre ainda é o mesmo: se ele foi apagado ou
  // recriado em outro aparelho, o que fosse gravado com a chave antiga nunca mais abriria.
  const current = requireSession();
  syncVaultWithSettings(await reloadSettings());
  if (session !== current) {
    throw new AppError("conflict", "O cofre mudou em outro aparelho. Nada foi gravado: destranque de novo e repita.");
  }
  const payload = await encryptSecrets(current.key, account.id, secrets);
  if (payload === null && base === null) return;
  await updateRow("accounts", account.id, (row) => {
    if ((row.secrets_enc ?? null) !== base) {
      throw new AppError(
        "conflict",
        "As senhas desta conta foram alteradas em outro aparelho. Feche esta janela e abra de novo para ver a versão atual.",
      );
    }
    return { secrets_enc: payload };
  });
  if (session === current) {
    if (payload) decrypted.set(account.id, { payload, secrets });
    else decrypted.delete(account.id);
    for (const key of [...revealed]) if (key.startsWith(`${account.id}:`)) hideKey(key);
    touchVault();
    emit();
  }
  await logActivity({
    avatar_id: account.avatar_id,
    account_id: account.id,
    kind: "senhas_atualizadas",
    message: hasSecrets(secrets) ? "Senhas atualizadas no cofre" : "Senhas removidas do cofre",
    is_example: account.is_example,
  });
}

// ---------------------------------------------------------------------------
// Mostrar / esconder
// ---------------------------------------------------------------------------

/** Depois deste tempo à mostra, o campo volta a ficar escondido sozinho. */
export const REVEAL_SECONDS = 30;

export function revealKey(accountId: string, field: SecretField): string {
  return `${accountId}:${field}`;
}

function hideKey(key: string) {
  revealed.delete(key);
  const timer = revealTimers.get(key);
  if (timer) clearTimeout(timer);
  revealTimers.delete(key);
}

/** Mostra (ou esconde) um campo na tela. À mostra, ele se esconde sozinho depois de alguns segundos. */
export function setRevealed(accountId: string, field: SecretField, show: boolean): void {
  if (!currentSession()) return;
  const key = revealKey(accountId, field);
  hideKey(key);
  if (show) {
    revealed.add(key);
    revealTimers.set(
      key,
      setTimeout(() => {
        hideKey(key);
        emit();
      }, REVEAL_SECONDS * 1000),
    );
  }
  touchVault();
  emit();
}

/** Esconde o que estava à mostra de uma conta (quando o bloco de senhas dela sai da tela). */
export function hideSecretsOf(accountId: string): void {
  const keys = [...revealed].filter((key) => key.startsWith(`${accountId}:`));
  if (keys.length === 0) return;
  for (const key of keys) hideKey(key);
  emit();
}

/** Esconde tudo que estava à mostra (ao trocar de tela ou sair do app). */
export function hideAllSecrets(): void {
  if (revealed.size === 0) return;
  for (const key of [...revealed]) hideKey(key);
  emit();
}
