// Backup: tudo que está no painel num arquivo só (JSON), para guardar fora dele
// e restaurar depois. Regras puras (sem tela e sem banco).
//
// O arquivo leva as linhas como estão no banco — inclusive o cofre de senhas, que
// continua cifrado (`settings.vault` + `accounts.secrets_enc`): sem a senha-mestra
// ninguém lê as senhas, com ou sem o arquivo. Na restauração os ids são mantidos:
// o bloco cifrado de cada conta só abre com o id da própria conta.
//
// Tarefas (`tasks`) seguem a mesma regra: tabela opcional (versão 5 do script).
//
// Arquivos e prompts (`library_items`) vão junto — os prompts inteiros, e de cada
// arquivo só o nome e onde ele está: o arquivo em si continua no armazenamento do
// Supabase. A tabela é opcional no backup: um arquivo feito antes de ela existir
// (ou num banco que ainda não a tem) simplesmente não a traz, e a restauração deixa
// os itens de agora como estão.

import { AppError } from "./errors";
import type { Db } from "./store";
import type { Settings, TableName, Tables } from "./types";

export const BACKUP_APP = "central-de-avatares";
/** Versão do formato do arquivo. Aumente só se um backup antigo deixar de ser entendido. */
export const BACKUP_FORMAT = 1;

/** As tabelas, na ordem em que precisam ser gravadas (quem é citado vem antes de quem cita). */
export const BACKUP_TABLES = [
  "countries",
  "phones",
  "antidetect_profiles",
  "avatars",
  "accounts",
  "warmups",
  "weekly_sales",
  "activity_log",
  "library_items",
  "tasks",
] as const satisfies readonly TableName[];

export type BackupTable = (typeof BACKUP_TABLES)[number];

/** Tabelas que um backup pode não trazer (vieram depois do formato 1). */
export const OPTIONAL_TABLES: ReadonlySet<BackupTable> = new Set<BackupTable>(["library_items", "tasks"]);

type Rows = Array<Record<string, unknown>>;
export type BackupTables = { [T in Exclude<BackupTable, "library_items" | "tasks">]: Rows } & {
  library_items?: Rows;
  tasks?: Rows;
};

export interface BackupSettings {
  vault: Record<string, unknown> | null;
  warmup_defaults: Record<string, unknown> | null;
  brl_rates: Record<string, number>;
  prefs: Record<string, unknown>;
}

export interface BackupFile {
  app: typeof BACKUP_APP;
  format: number;
  /** Quando o arquivo foi gerado (ISO). */
  exported_at: string;
  tables: BackupTables;
  settings: BackupSettings | null;
}

const KEY_OF: Record<BackupTable, keyof Db> = {
  countries: "countries",
  phones: "phones",
  antidetect_profiles: "profiles",
  avatars: "avatars",
  accounts: "accounts",
  warmups: "warmups",
  weekly_sales: "sales",
  activity_log: "activity",
  library_items: "library",
  tasks: "tasks",
};

/** Tira o dono da linha: quem restaura é o dono de quem está com o login aberto. */
function withoutOwner(row: object): Record<string, unknown> {
  const rest = { ...(row as Record<string, unknown>) };
  delete rest.user_id;
  return rest;
}

/** Monta o backup de tudo que está carregado no painel. */
export function buildBackup(db: Db, now: Date): BackupFile {
  const tables = {} as BackupTables;
  for (const table of BACKUP_TABLES) {
    // sem a tabela no banco (script SQL ainda não atualizado), o backup não a leva: restaurá-lo
    // não mexe nos arquivos e prompts de ninguém
    if (table === "library_items" && !db.libraryReady) continue;
    if (table === "tasks" && !db.tasksReady) continue;
    const rows = (db[KEY_OF[table]] ?? []) as unknown as Array<Tables[typeof table]>;
    tables[table] = rows.map(withoutOwner);
  }
  const settings: Settings | null = db.settings;
  return {
    app: BACKUP_APP,
    format: BACKUP_FORMAT,
    exported_at: now.toISOString(),
    tables,
    settings: settings
      ? {
          vault: settings.vault ?? null,
          warmup_defaults: settings.warmup_defaults ?? null,
          brl_rates: settings.brl_rates ?? {},
          prefs: { ...(settings.prefs ?? {}) },
        }
      : null,
  };
}

/** "central-de-avatares-2026-11-12-1432.json" */
export function backupFileName(now: Date, extension: string, prefix = BACKUP_APP): string {
  const two = (n: number) => String(n).padStart(2, "0");
  const stamp = `${now.getFullYear()}-${two(now.getMonth() + 1)}-${two(now.getDate())}-${two(now.getHours())}${two(now.getMinutes())}`;
  return `${prefix}-${stamp}.${extension}`;
}

export type BackupCounts = Record<BackupTable, number>;

export function backupCounts(file: BackupFile): BackupCounts {
  const counts = {} as BackupCounts;
  for (const table of BACKUP_TABLES) counts[table] = file.tables[table]?.length ?? 0;
  return counts;
}

/** Quantos arquivos (fotos, PDFs…) os itens do backup citam — eles mesmos não vão no arquivo. */
export function backupFiles(file: BackupFile): number {
  return (file.tables.library_items ?? []).filter((row) => typeof row.file_path === "string" && row.file_path !== "").length;
}

/** Quantas contas do backup têm senhas guardadas no cofre. */
export function backupSecrets(file: BackupFile): number {
  return file.tables.accounts.filter((row) => typeof row.secrets_enc === "string" && row.secrets_enc !== "").length;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function bad(message: string): never {
  throw new AppError("invalid", message);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Lê um arquivo de backup e confere se ele está inteiro: é deste painel, tem
 * todas as tabelas, toda linha tem id, e ninguém cita uma linha que não veio
 * (conta sem avatar, venda sem avatar…). Qualquer problema vira uma mensagem
 * clara — e nada é gravado.
 */
export function parseBackup(text: string): BackupFile {
  let raw: unknown;
  try {
    raw = JSON.parse(text.replace(/^﻿/, ""));
  } catch {
    bad("Este arquivo não é um backup do painel (não consegui ler o conteúdo). Escolha o arquivo .json que o painel gerou.");
  }
  if (!isObject(raw) || raw.app !== BACKUP_APP) {
    bad("Este arquivo não é um backup da Central de Avatares. Escolha o arquivo .json que o painel gerou.");
  }
  if (typeof raw.format !== "number" || raw.format < 1) bad("Este backup está incompleto (sem a versão do formato).");
  if (raw.format > BACKUP_FORMAT) {
    bad("Este backup foi feito por uma versão mais nova do painel. Atualize a página (ou reabra o aplicativo) e tente de novo.");
  }
  if (!isObject(raw.tables)) bad("Este backup está incompleto (sem as tabelas).");

  const tables = {} as BackupTables;
  const ids = {} as Record<BackupTable, Set<string>>;
  for (const table of BACKUP_TABLES) {
    const rows = raw.tables[table];
    if (rows === undefined && OPTIONAL_TABLES.has(table)) continue;
    if (!Array.isArray(rows)) bad(`Este backup está incompleto (falta a tabela “${table}”).`);
    const seen = new Set<string>();
    tables[table] = rows.map((row) => {
      if (!isObject(row) || typeof row.id !== "string" || !UUID.test(row.id)) {
        bad(`Este backup está danificado (linha sem identificação na tabela “${table}”).`);
      }
      if (seen.has(row.id)) bad(`Este backup está danificado (linha repetida na tabela “${table}”).`);
      seen.add(row.id);
      return withoutOwner(row);
    });
    ids[table] = seen;
  }

  // ninguém pode citar uma linha que não veio no arquivo
  const refs: Array<[BackupTable, string, BackupTable, boolean]> = [
    ["avatars", "country_id", "countries", true],
    ["accounts", "avatar_id", "avatars", true],
    ["accounts", "phone_id", "phones", false],
    ["accounts", "profile_id", "antidetect_profiles", false],
    ["warmups", "account_id", "accounts", true],
    ["weekly_sales", "avatar_id", "avatars", true],
    ["weekly_sales", "account_id", "accounts", false],
    ["activity_log", "avatar_id", "avatars", false],
    ["activity_log", "account_id", "accounts", false],
    ["library_items", "avatar_id", "avatars", false],
    ["tasks", "avatar_id", "avatars", false],
  ];
  for (const [table, column, target, required] of refs) {
    for (const row of tables[table] ?? []) {
      const value = row[column];
      if (value === null || value === undefined) {
        if (required) bad(`Este backup está danificado (linha da tabela “${table}” sem “${column}”).`);
        continue;
      }
      if (typeof value !== "string" || !ids[target].has(value)) {
        bad(`Este backup está danificado (a tabela “${table}” cita um item de “${target}” que não veio no arquivo).`);
      }
    }
  }

  let settings: BackupSettings | null = null;
  if (raw.settings !== null && raw.settings !== undefined) {
    if (!isObject(raw.settings)) bad("Este backup está danificado (configurações ilegíveis).");
    const { vault, warmup_defaults: plan, brl_rates: rates, prefs } = raw.settings;
    settings = {
      vault: isObject(vault) ? vault : null,
      warmup_defaults: isObject(plan) ? plan : null,
      brl_rates: isObject(rates)
        ? Object.fromEntries(Object.entries(rates).filter((entry): entry is [string, number] => typeof entry[1] === "number"))
        : {},
      prefs: isObject(prefs) ? prefs : {},
    };
  }
  // senhas cifradas sem o cofre que as abre não servem para nada: melhor avisar agora
  const withSecrets = tables.accounts.some((row) => typeof row.secrets_enc === "string" && row.secrets_enc !== "");
  if (withSecrets && !settings?.vault) {
    bad("Este backup está danificado (tem senhas cifradas, mas não tem o cofre que as abre).");
  }

  return {
    app: BACKUP_APP,
    format: raw.format,
    exported_at: typeof raw.exported_at === "string" ? raw.exported_at : "",
    tables,
    settings,
  };
}
