"use client";

// Vendas pela Stripe: as chamadas às rotas do próprio painel (/api/stripe/*) e a
// gravação do resultado. As regras ficam em ./stripe-sync; quem fala com a Stripe
// de verdade é o servidor (./stripe-server) — a chave nunca vem para o navegador.

import { errorMessage } from "./errors";
import { defaultCurrency } from "./sales";
import { saveSale } from "./sales-actions";
import { getStore } from "./store";
import {
  matchLinks,
  startOfDay,
  type LinkMatching,
  type PlanRow,
  type StripeLink,
  type StripeSale,
  type ZeroCandidate,
} from "./stripe-sync";
import { getSupabase } from "./supabase";
import { avatarsMissingSales } from "./warnings";

/** Por que a ligação com a Stripe não respondeu o que se esperava. */
export type StripeProblem =
  /** A chave ainda não está nas variáveis de ambiente (ou está errada). */
  | { kind: "not_configured"; problem: "missing" | "publishable" | "format" | "exposed" }
  /** O cadastro público do Supabase está ligado: o servidor se recusa a usar a chave. */
  | { kind: "signup_open" }
  /** A Stripe recusou ou não respondeu. */
  | { kind: "stripe"; error: "key" | "permission" | "rate" | "unavailable" | "request"; detail: string }
  /** O servidor não conseguiu conferir o login no Supabase. */
  | { kind: "supabase" }
  | { kind: "auth" }
  | { kind: "offline" }
  | { kind: "unknown"; detail: string };

export class StripeError extends Error {
  problem: StripeProblem;

  constructor(problem: StripeProblem) {
    super(problem.kind);
    this.name = "StripeError";
    this.problem = problem;
  }
}

const KEY_PROBLEMS = new Set(["missing", "publishable", "format", "exposed"]);
const STRIPE_ERRORS = new Set(["key", "permission", "rate", "unavailable", "request"]);

function problemOf(status: number, body: Record<string, unknown> | null): StripeProblem {
  const error = typeof body?.error === "string" ? body.error : "";
  if (status === 401 || error === "auth") return { kind: "auth" };
  if (error === "not_configured" && typeof body?.problem === "string" && KEY_PROBLEMS.has(body.problem)) {
    return { kind: "not_configured", problem: body.problem as "missing" | "publishable" | "format" | "exposed" };
  }
  if (error === "signup_open") return { kind: "signup_open" };
  if (error === "supabase") return { kind: "supabase" };
  if (error === "stripe" && typeof body?.kind === "string" && STRIPE_ERRORS.has(body.kind)) {
    return {
      kind: "stripe",
      error: body.kind as "key" | "permission" | "rate" | "unavailable" | "request",
      detail: typeof body.detail === "string" ? body.detail : "",
    };
  }
  return { kind: "unknown", detail: error || `resposta ${status}` };
}

async function call(path: string, payload: Record<string, unknown>): Promise<Record<string, unknown>> {
  const { data } = await getSupabase().auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new StripeError({ kind: "auth" });
  let response: Response;
  try {
    response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
      cache: "no-store",
    });
  } catch {
    throw new StripeError({ kind: "offline" });
  }
  let body: Record<string, unknown> | null = null;
  try {
    const parsed: unknown = await response.json();
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) body = parsed as Record<string, unknown>;
  } catch {
    // resposta que não é do painel (página de erro da hospedagem, por exemplo)
  }
  if (!response.ok || !body || body.ok !== true) throw new StripeError(problemOf(response.status, body));
  return body;
}

/** Quantas páginas, no máximo, o painel pede de uma lista (uma trava contra voltas sem fim). */
const MAX_CALLS = 300;

function isLink(value: unknown): value is StripeLink {
  const link = value as StripeLink | null;
  return Boolean(link) && typeof link?.id === "string" && typeof link.url === "string" && typeof link.active === "boolean";
}

function isSale(value: unknown): value is StripeSale {
  const sale = value as StripeSale | null;
  return Boolean(sale) && Number.isFinite(sale?.t) && Number.isFinite(sale?.a) && typeof sale?.c === "string";
}

export interface StripeAccount {
  links: StripeLink[];
  /** true = chave de verdade (vendas reais) · false = chave de teste. */
  live: boolean;
}

/** Todos os links de pagamento da conta Stripe. É também o teste de que a ligação funciona. */
export async function fetchStripeLinks(): Promise<StripeAccount> {
  const links: StripeLink[] = [];
  let cursor: string | null = null;
  let live = true;
  for (let i = 0; i < MAX_CALLS; i++) {
    const body = await call("/api/stripe/links", { cursor });
    if (Array.isArray(body.links)) links.push(...body.links.filter(isLink));
    live = body.live !== false;
    cursor = typeof body.next === "string" && body.next ? body.next : null;
    if (!cursor) break;
  }
  return { links, live };
}

/** As vendas pagas de cada link desde `sinceDay` (AAAA-MM-DD, no horário do aparelho). Três links por vez. */
export async function fetchStripeSales(
  linkIds: readonly string[],
  sinceDay: string,
  onProgress?: (done: number, total: number) => void,
): Promise<Map<string, StripeSale[]>> {
  const since = startOfDay(sinceDay);
  const result = new Map<string, StripeSale[]>();
  const queue = [...linkIds];
  let done = 0;
  onProgress?.(0, linkIds.length);
  async function worker() {
    for (let link = queue.shift(); link !== undefined; link = queue.shift()) {
      const sales: StripeSale[] = [];
      let cursor: string | null = null;
      for (let i = 0; i < MAX_CALLS; i++) {
        const body = await call("/api/stripe/sales", { link, since, cursor });
        if (Array.isArray(body.sales)) sales.push(...body.sales.filter(isSale));
        cursor = typeof body.next === "string" && body.next ? body.next : null;
        if (!cursor) break;
      }
      result.set(link, sales);
      done += 1;
      onProgress?.(done, linkIds.length);
    }
  }
  await Promise.all([worker(), worker(), worker()]);
  return result;
}

/** De que avatar é cada link de pagamento (pelos links cadastrados nos avatares). */
export function matchStripeLinks(links: readonly StripeLink[]): LinkMatching {
  return matchLinks(getStore().avatars, links);
}

/**
 * Os avatares ligados à Stripe que o painel cobraria por não terem lançamento em
 * `week`: sem venda na Stripe, eles ganham um "0" (que é o que a Stripe diz).
 */
export function zeroCandidates(matching: LinkMatching, week: string): ZeroCandidate[] {
  const db = getStore();
  return avatarsMissingSales(db, week)
    .filter((avatar) => matching.byAvatar.has(avatar.id))
    .map((avatar) => ({
      avatarId: avatar.id,
      week,
      currency: defaultCurrency(
        db.sales.filter((sale) => sale.avatar_id === avatar.id),
        avatar.product_currency,
        db.countries.find((country) => country.id === avatar.country_id)?.currency,
      ),
    }));
}

export interface ApplyResult {
  saved: number;
  failed: Array<{ row: PlanRow; message: string }>;
}

/** Grava no painel as linhas escolhidas (quatro por vez). O que falhar não impede o resto. */
export async function applyStripePlan(
  rows: readonly PlanRow[],
  onProgress?: (done: number, total: number) => void,
): Promise<ApplyResult> {
  const result: ApplyResult = { saved: 0, failed: [] };
  const queue = [...rows];
  let done = 0;
  onProgress?.(0, rows.length);
  async function worker() {
    for (let row = queue.shift(); row !== undefined; row = queue.shift()) {
      try {
        // (o avatar é lido agora: pode ter sido apagado em outra aba enquanto a lista estava na tela)
        const avatar = getStore().avatars.find((item) => item.id === row.avatarId);
        if (!avatar) throw new Error("Este avatar não existe mais.");
        await saveSale(avatar, row.week, {
          amount: row.next.amount,
          currency: row.next.currency,
          sales_count: row.next.count,
        });
        result.saved += 1;
      } catch (err) {
        result.failed.push({ row, message: errorMessage(err) });
      }
      done += 1;
      onProgress?.(done, rows.length);
    }
  }
  await Promise.all([worker(), worker(), worker(), worker()]);
  return result;
}
