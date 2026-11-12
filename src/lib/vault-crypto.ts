// Criptografia do cofre. Tudo acontece no aparelho, com a Web Crypto do
// navegador — este arquivo não fala com o banco nem com a tela.
//
// Como funciona (do jeito que o dono do painel especificou):
//  1. A senha-mestra passa por PBKDF2 (SHA-256, 600 mil rodadas, sal aleatório)
//     e vira a chave AES-256 do cofre.
//  2. Essa chave cifra as senhas de cada conta com AES-256-GCM (um IV novo a
//     cada gravação).
//  3. O banco guarda só: o sal, o número de rodadas e um "teste de conferência"
//     (um texto fixo cifrado com a chave), que serve para saber se a senha-mestra
//     digitada está certa. A senha-mestra e a chave existem apenas na memória.
//
// Como a chave sai da senha-mestra, trocar a senha muda a chave: todas as senhas
// guardadas são decifradas e cifradas de novo (`reencryptSecrets`) e gravadas de
// uma vez só pela função `cda_vault_rekey` do banco (ou tudo, ou nada).

/** Rodadas do PBKDF2-SHA256 (recomendação atual da OWASP). */
export const VAULT_ITERATIONS = 600_000;

/** O que fica em `settings.vault`. Nada aqui serve para abrir o cofre sem a senha-mestra. */
export interface VaultConfig {
  v: 1;
  kdf: "PBKDF2-SHA256";
  iterations: number;
  /** Sal do PBKDF2 (base64url). Muda a cada troca da senha-mestra: identifica "qual cofre é este". */
  salt: string;
  /** Teste de conferência: um texto fixo cifrado com a chave do cofre (`v1.<iv>.<cifra>`). */
  check: string;
}

export class WrongPasswordError extends Error {
  constructor() {
    super("Senha-mestra incorreta.");
    this.name = "WrongPasswordError";
  }
}

export class DecryptError extends Error {
  constructor(message = "Não foi possível abrir este conteúdo com a chave do cofre.") {
    super(message);
    this.name = "DecryptError";
  }
}

const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });

// Textos fixos que entram na conta da cifra (AAD): um conteúdo cifrado para uma
// finalidade (ou para uma conta) não abre se for colado em outro lugar.
const CHECK_CONTEXT = "central-de-avatares/cofre/v1";
const CHECK_TEXT = "central-de-avatares: a senha-mestra confere";
const SECRETS_CONTEXT = "central-de-avatares/conta/v1/";

function bytesOf(text: string): Uint8Array<ArrayBuffer> {
  const encoded = encoder.encode(text);
  const copy = new Uint8Array(new ArrayBuffer(encoded.byteLength));
  copy.set(encoded);
  return copy;
}

function randomBytes(length: number): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(new ArrayBuffer(length)));
}

export function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromBase64Url(text: string): Uint8Array<ArrayBuffer> {
  if (typeof text !== "string" || !/^[A-Za-z0-9_-]*$/.test(text) || text.length % 4 === 1) {
    throw new DecryptError("Conteúdo cifrado em formato inválido.");
  }
  const binary = atob(text.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (text.length % 4)) % 4));
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function decodedLength(value: unknown): number {
  try {
    return typeof value === "string" ? fromBase64Url(value).length : -1;
  } catch {
    return -1;
  }
}

/** Formato de um conteúdo cifrado por `encryptText`: versão, IV de 12 bytes e a cifra. */
const PAYLOAD = /^v1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{22,}$/;

/** Confere o que veio de `settings.vault`. Devolve null se não for um cofre que este painel entende. */
export function parseVaultConfig(value: unknown): VaultConfig | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<VaultConfig>;
  if (raw.v !== 1 || raw.kdf !== "PBKDF2-SHA256") return null;
  const iterations = raw.iterations;
  if (typeof iterations !== "number" || !Number.isInteger(iterations) || iterations < 100_000 || iterations > 20_000_000) {
    return null;
  }
  if (decodedLength(raw.salt) < 16) return null;
  if (typeof raw.check !== "string" || !PAYLOAD.test(raw.check)) return null;
  return { v: 1, kdf: "PBKDF2-SHA256", iterations, salt: raw.salt as string, check: raw.check };
}

/** Senha-mestra → chave AES-256 do cofre (PBKDF2). A chave não pode ser exportada da memória. */
async function deriveVaultKey(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<CryptoKey> {
  // NFKC: a mesma senha com acento digitada em aparelhos diferentes vira os mesmos bytes
  const material = await crypto.subtle.importKey("raw", bytesOf(password.normalize("NFKC")), "PBKDF2", false, [
    "deriveKey",
  ]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

/**
 * Cria um cofre novo com a senha-mestra escolhida. Devolve o que vai para o
 * banco (`config`: sal, rodadas e teste de conferência) e a chave, para usar
 * nesta sessão.
 */
export async function createVault(
  password: string,
  iterations = VAULT_ITERATIONS,
): Promise<{ config: VaultConfig; key: CryptoKey }> {
  const salt = randomBytes(16);
  const key = await deriveVaultKey(password, salt, iterations);
  const check = await encryptText(key, CHECK_TEXT, CHECK_CONTEXT);
  return { config: { v: 1, kdf: "PBKDF2-SHA256", iterations, salt: toBase64Url(salt), check }, key };
}

/** Abre o cofre com a senha-mestra. Senha errada → WrongPasswordError. */
export async function openVault(config: VaultConfig, password: string): Promise<CryptoKey> {
  const key = await deriveVaultKey(password, fromBase64Url(config.salt), config.iterations);
  let text: string;
  try {
    // o AES-GCM confere a autenticidade: com a senha errada, o teste de conferência não abre
    text = await decryptText(key, config.check, CHECK_CONTEXT);
  } catch {
    throw new WrongPasswordError();
  }
  if (text !== CHECK_TEXT) throw new WrongPasswordError();
  return key;
}

/** Cifra um texto. `context` amarra o resultado a um uso: só abre com o mesmo contexto. */
export async function encryptText(key: CryptoKey, plaintext: string, context: string): Promise<string> {
  const iv = randomBytes(12);
  const cipher = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: bytesOf(context) },
    key,
    bytesOf(plaintext),
  );
  return `v1.${toBase64Url(iv)}.${toBase64Url(new Uint8Array(cipher))}`;
}

export async function decryptText(key: CryptoKey, payload: string, context: string): Promise<string> {
  const parts = typeof payload === "string" ? payload.split(".") : [];
  if (parts.length !== 3 || parts[0] !== "v1") throw new DecryptError("Conteúdo cifrado em formato desconhecido.");
  const iv = fromBase64Url(parts[1]);
  const cipher = fromBase64Url(parts[2]);
  if (iv.length !== 12 || cipher.length < 16) throw new DecryptError("Conteúdo cifrado em formato inválido.");
  try {
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv, additionalData: bytesOf(context) }, key, cipher);
    return decoder.decode(plain);
  } catch {
    throw new DecryptError();
  }
}

// ---------------------------------------------------------------------------
// Segredos de uma conta
// ---------------------------------------------------------------------------

/** O que o cofre guarda de cada conta. Tudo isso vira um único bloco cifrado em `accounts.secrets_enc`. */
export interface AccountSecrets {
  instagram_password: string;
  email_password: string;
  recovery_email: string;
  backup_codes: string;
}

export const SECRET_FIELDS = ["instagram_password", "email_password", "recovery_email", "backup_codes"] as const;
export type SecretField = (typeof SECRET_FIELDS)[number];

export const EMPTY_SECRETS: AccountSecrets = {
  instagram_password: "",
  email_password: "",
  recovery_email: "",
  backup_codes: "",
};

export function hasSecrets(secrets: AccountSecrets): boolean {
  return SECRET_FIELDS.some((field) => secrets[field] !== "");
}

// O texto é completado com espaços até um múltiplo deste tamanho antes de ser
// cifrado: quem olhar o banco não descobre o tamanho das senhas.
const PAD_BLOCK = 256;

function serializeSecrets(secrets: AccountSecrets): string {
  const json = JSON.stringify(Object.fromEntries(SECRET_FIELDS.map((field) => [field, secrets[field]])));
  const size = encoder.encode(json).byteLength;
  return json + " ".repeat((PAD_BLOCK - (size % PAD_BLOCK)) % PAD_BLOCK);
}

function parseSecrets(text: string): AccountSecrets {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new DecryptError("O conteúdo guardado no cofre está corrompido.");
  }
  if (!raw || typeof raw !== "object") throw new DecryptError("O conteúdo guardado no cofre está corrompido.");
  const data = raw as Record<string, unknown>;
  const secrets = { ...EMPTY_SECRETS };
  for (const field of SECRET_FIELDS) {
    if (typeof data[field] === "string") secrets[field] = data[field];
  }
  return secrets;
}

/**
 * Cifra os segredos de uma conta. Devolve null se não há nada para guardar.
 * O resultado só abre para a mesma conta (o id entra na conta da cifra).
 */
export async function encryptSecrets(key: CryptoKey, accountId: string, secrets: AccountSecrets): Promise<string | null> {
  if (!hasSecrets(secrets)) return null;
  return encryptText(key, serializeSecrets(secrets), SECRETS_CONTEXT + accountId);
}

export async function decryptSecrets(key: CryptoKey, accountId: string, payload: string): Promise<AccountSecrets> {
  return parseSecrets(await decryptText(key, payload, SECRETS_CONTEXT + accountId));
}

/**
 * Troca da senha-mestra: abre o bloco de uma conta com a chave antiga e o cifra
 * de novo com a chave nova (mesmo conteúdo, IV novo). Se o bloco não abrir com
 * a chave antiga → DecryptError.
 */
export async function reencryptSecrets(
  oldKey: CryptoKey,
  newKey: CryptoKey,
  accountId: string,
  payload: string,
): Promise<string> {
  const context = SECRETS_CONTEXT + accountId;
  return encryptText(newKey, await decryptText(oldKey, payload, context), context);
}

/** Verdadeiro se o bloco cifrado está num formato que esta versão do painel sabe abrir. */
export function isKnownPayload(payload: string): boolean {
  return PAYLOAD.test(payload);
}

// ---------------------------------------------------------------------------
// Senha-mestra
// ---------------------------------------------------------------------------

/** Mínimo de caracteres. Quem tiver uma cópia do banco pode tentar adivinhar a senha sem limite de tentativas. */
export const MIN_MASTER_PASSWORD = 12;

export type PasswordStrength = "curta" | "fraca" | "boa" | "forte";

/** Palavras que todo ataque tenta primeiro: não contam para o tamanho. */
const COMMON_WORDS = ["password", "senha", "mestra", "cofre", "instagram", "avatar", "admin", "login", "usuario"];

/** Fileiras do teclado, o alfabeto e os números: trechos em sequência (para frente ou para trás) não contam. */
const SEQUENCES = ["qwertyuiop", "asdfghjkl", "zxcvbnm", "abcdefghijklmnopqrstuvwxyz", "01234567890"].flatMap((row) => [
  row,
  [...row].reverse().join(""),
]);

/** Tira da senha os trechos de 4 ou mais caracteres que são uma sequência conhecida ("qwer", "4321", "defgh"). */
function stripSequences(text: string): string {
  let out = "";
  let i = 0;
  while (i < text.length) {
    let longest = 0;
    for (let size = text.length - i; size >= 4; size--) {
      const piece = text.slice(i, i + size);
      if (SEQUENCES.some((row) => row.includes(piece))) {
        longest = size;
        break;
      }
    }
    if (longest > 0) i += longest;
    else out += text[i++];
  }
  return out;
}

/** A senha inteira é um trecho curto repetido ("senhasenhasenha", "121212121212")? */
function isRepetition(text: string): boolean {
  for (let size = 1; size <= Math.floor(text.length / 2); size++) {
    if (text === text.slice(0, size).repeat(Math.ceil(text.length / size)).slice(0, text.length)) return true;
  }
  return false;
}

/**
 * Avaliação simples, só para barrar o óbvio e orientar. O que mais conta é o
 * tamanho; palavras muito comuns, sequências, números e repetições não contam.
 * "curta" e "fraca" não são aceitas como senha-mestra.
 */
export function passwordStrength(password: string): PasswordStrength {
  const chars = [...password];
  if (chars.length < MIN_MASTER_PASSWORD) return "curta";
  const lower = password.toLowerCase();
  if (isRepetition(lower)) return "fraca";
  // tira o que é previsível e vê quanto sobra de verdade (só as letras)
  let rest = lower;
  for (const word of COMMON_WORDS) rest = rest.split(word).join("");
  rest = stripSequences(rest).replace(/[^\p{L}]/gu, "");
  const distinct = new Set(rest).size;
  if (rest.length < 6 || distinct < 4) return "fraca";
  if (chars.length >= 16 && rest.length >= 10 && distinct >= 6) return "forte";
  return "boa";
}
