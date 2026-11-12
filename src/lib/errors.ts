// Transforma erros técnicos (banco, rede, login) em mensagens claras em português.

export type ErrorKind =
  | "network"
  | "auth"
  | "schema"
  | "conflict"
  | "in_use"
  | "invalid"
  | "unknown";

export class AppError extends Error {
  kind: ErrorKind;
  code?: string;
  /** Mensagem técnica original, para diagnóstico. */
  detail?: string;

  constructor(kind: ErrorKind, message: string, code?: string, detail?: string) {
    super(message);
    this.name = "AppError";
    this.kind = kind;
    this.code = code;
    this.detail = detail;
  }
}

interface ErrorLike {
  message?: unknown;
  code?: unknown;
  status?: unknown;
  name?: unknown;
}

const NETWORK_RE = /failed to fetch|networkerror|load failed|fetch failed|network request failed/i;

export function toAppError(err: unknown): AppError {
  if (err instanceof AppError) return err;

  const e = (err ?? {}) as ErrorLike;
  const message = typeof e.message === "string" ? e.message : String(err ?? "");
  const code = typeof e.code === "string" ? e.code : undefined;
  const status = typeof e.status === "number" ? e.status : undefined;

  if (NETWORK_RE.test(message) || status === 0 || e.name === "AuthRetryableFetchError") {
    return new AppError(
      "network",
      "Sem conexão com o servidor. Confira sua internet e tente de novo.",
      code,
      message,
    );
  }

  // --- banco não preparado / desatualizado ---
  if (
    code === "PGRST205" ||
    code === "42P01" ||
    code === "PGRST204" ||
    code === "42703" ||
    /could not find the (table|.*column)/i.test(message)
  ) {
    return new AppError(
      "schema",
      "O banco de dados ainda não está preparado (ou está desatualizado).",
      code,
      message,
    );
  }
  if (code === "42501") {
    return new AppError(
      "schema",
      "O banco recusou o acesso. Rode novamente o script de preparação do banco.",
      code,
      message,
    );
  }

  // --- sessão ---
  if (
    code === "PGRST301" ||
    code === "PGRST303" ||
    status === 401 ||
    /jwt expired|invalid jwt|session.*(missing|not found)/i.test(message)
  ) {
    return new AppError("auth", "Sua sessão expirou. Entre novamente.", code, message);
  }

  // --- regras do banco ---
  if (code === "23505") {
    return new AppError("conflict", "Já existe um registro igual a este.", code, message);
  }
  if (code === "23503") {
    return new AppError(
      "in_use",
      "Não foi possível concluir: este item ainda está ligado a outros registros.",
      code,
      message,
    );
  }
  if (code === "23514" || code === "22P02" || code === "23502") {
    return new AppError("invalid", "Algum campo tem um valor inválido.", code, message);
  }

  return new AppError(
    "unknown",
    message ? `Algo deu errado: ${message}` : "Algo deu errado. Tente de novo.",
    code,
    message,
  );
}

/** Mensagens específicas da tela de login. */
export function loginErrorMessage(err: unknown): string {
  const e = (err ?? {}) as ErrorLike;
  const code = typeof e.code === "string" ? e.code : "";
  const message = typeof e.message === "string" ? e.message : "";
  const status = typeof e.status === "number" ? e.status : undefined;

  if (code === "invalid_credentials" || /invalid login credentials/i.test(message)) {
    return "E-mail ou senha incorretos.";
  }
  if (code === "email_not_confirmed") {
    return "Este e-mail ainda não foi confirmado no Supabase. Recrie o usuário marcando “Auto Confirm User”.";
  }
  if (status === 429 || /rate limit/i.test(message)) {
    return "Muitas tentativas seguidas. Espere um minuto e tente de novo.";
  }
  return toAppError(err).message;
}

export function errorMessage(err: unknown): string {
  return toAppError(err).message;
}
