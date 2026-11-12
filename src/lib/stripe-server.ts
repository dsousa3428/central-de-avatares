// A ligação com a Stripe — a única parte do painel que roda no servidor.
//
// Por quê: para ler as vendas, a Stripe exige uma chave secreta, e chave secreta
// não pode ir para o navegador. Ela fica numa variável de ambiente da Vercel
// (STRIPE_SECRET_KEY) e só este código a usa, em duas rotas:
//   POST /api/stripe/links  → os links de pagamento da conta
//   POST /api/stripe/sales  → as vendas pagas de um link, num período
//
// O que este código garante:
//  - só responde a quem está logado no painel (confere o login no Supabase), e só
//    se o cadastro público do Supabase estiver desligado: a chave é uma só para o
//    painel inteiro, então "qualquer um que consiga criar uma conta" não pode
//    chegar até ela;
//  - só LÊ, e só duas listas (links de pagamento e sessões de checkout);
//  - devolve o mínimo: o endereço de cada link e, de cada venda, a hora, o valor
//    e a moeda. Nada de nome, e-mail ou cartão de cliente;
//  - a chave nunca aparece numa resposta nem num registro.
//
// Tudo aqui recebe o `fetch` e as variáveis de ambiente de quem chama: é assim que
// dev/unit/stripe.test.mjs testa as regras sem rede.

export type Env = Record<string, string | undefined>;
type Fetch = typeof fetch;

export const STRIPE_API = "https://api.stripe.com";
/** Itens por página (o máximo que a Stripe aceita). */
const PAGE = 100;
/**
 * Cada pedido do painel termina rápido (a hospedagem corta funções demoradas): no máximo este
 * tanto de páginas da Stripe, e nem isso se o tempo passar de BUDGET_MS — o painel pede a continuação.
 */
const MAX_PAGES = 3;
const BUDGET_MS = 5_000;
const TIMEOUT_MS = 8_000;

// ---------------------------------------------------------------------------
// A chave
// ---------------------------------------------------------------------------

/** missing = falta a variável · publishable = colaram a chave pk_… · format = não parece chave da Stripe · exposed = chave secreta numa variável NEXT_PUBLIC_ */
export type KeyProblem = "missing" | "publishable" | "format" | "exposed";

export function readStripeKey(env: Env): { key: string; problem: null } | { key: null; problem: KeyProblem } {
  // Variável NEXT_PUBLIC_* é feita para ir ao navegador: chave secreta nunca pode estar numa delas.
  for (const [name, value] of Object.entries(env)) {
    if (name.startsWith("NEXT_PUBLIC_") && /^(sk|rk)_(live|test)_/.test((value ?? "").trim())) {
      return { key: null, problem: "exposed" };
    }
  }
  const key = (env.STRIPE_SECRET_KEY ?? "").trim();
  if (!key) return { key: null, problem: "missing" };
  if (key.startsWith("pk_")) return { key: null, problem: "publishable" };
  if (!/^(sk|rk)_(live|test)_[A-Za-z0-9_]{4,}$/.test(key)) return { key: null, problem: "format" };
  return { key, problem: null };
}

/** Chave "de verdade" (vendas reais) ou de teste. */
export function isLiveKey(key: string): boolean {
  return /^(sk|rk)_live_/.test(key);
}

/**
 * Onde fica a Stripe. Só aceita trocar por um endereço do próprio computador (o
 * simulador dos testes): assim nenhuma configuração errada manda a chave para
 * outro lugar da internet.
 */
export function stripeApiBase(env: Env): string {
  const custom = (env.STRIPE_API_BASE ?? "").trim();
  if (!custom) return STRIPE_API;
  try {
    const url = new URL(custom);
    if (url.protocol === "http:" && (url.hostname === "127.0.0.1" || url.hostname === "localhost")) return url.origin;
  } catch {
    // endereço inválido: fica a Stripe de verdade
  }
  return STRIPE_API;
}

// ---------------------------------------------------------------------------
// Quem está pedindo
// ---------------------------------------------------------------------------

export interface SupabaseConfig {
  url: string | null | undefined;
  key: string | null | undefined;
}

/** auth = sem login válido · signup_open = cadastro público ligado no Supabase · supabase = não deu para conferir */
export type CallerProblem = "auth" | "signup_open" | "supabase";

function originOf(value: string | null | undefined): string | null {
  try {
    const url = new URL((value ?? "").trim());
    return url.protocol === "https:" || url.protocol === "http:" ? url.origin : null;
  } catch {
    return null;
  }
}

async function readJson(response: Response): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await response.json();
    return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/**
 * Confere, no Supabase, se o pedido vem de alguém logado no painel — e se o
 * painel é mesmo de uma pessoa só (cadastro público desligado). Devolve null
 * quando está tudo certo.
 */
export async function checkCaller(
  fetchImpl: Fetch,
  supabase: SupabaseConfig,
  authorization: string | null,
): Promise<CallerProblem | null> {
  const token = /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/.exec(authorization ?? "")?.[1];
  if (!token) return "auth";
  const origin = originOf(supabase.url);
  const apikey = (supabase.key ?? "").trim();
  if (!origin || !apikey) return "supabase";

  let user: Response;
  let settings: Response;
  try {
    [user, settings] = await Promise.all([
      fetchImpl(`${origin}/auth/v1/user`, {
        headers: { apikey, Authorization: `Bearer ${token}` },
        cache: "no-store",
        signal: AbortSignal.timeout(TIMEOUT_MS),
      }),
      fetchImpl(`${origin}/auth/v1/settings`, {
        headers: { apikey },
        cache: "no-store",
        signal: AbortSignal.timeout(TIMEOUT_MS),
      }),
    ]);
  } catch {
    return "supabase";
  }
  if (user.status === 401 || user.status === 403) return "auth";
  if (!user.ok || !settings.ok) return "supabase";
  const who = await readJson(user);
  if (!who || typeof who.id !== "string" || !who.id || who.is_anonymous === true) return "auth";
  const config = await readJson(settings);
  if (!config) return "supabase";
  return config.disable_signup === true ? null : "signup_open";
}

// ---------------------------------------------------------------------------
// Pedidos à Stripe
// ---------------------------------------------------------------------------

/** key = chave recusada · permission = a chave não pode ler isto · rate = pedidos demais · unavailable = a Stripe não respondeu · request = pedido recusado */
export type StripeErrorKind = "key" | "permission" | "rate" | "unavailable" | "request";

export class StripeFailure extends Error {
  kind: StripeErrorKind;
  status: number;

  constructor(kind: StripeErrorKind, status: number, detail: string) {
    super(detail);
    this.name = "StripeFailure";
    this.kind = kind;
    this.status = status;
  }
}

/** Tira do texto qualquer coisa com cara de chave da Stripe (as mensagens dela já vêm mascaradas; isto é por garantia). */
export function maskKeys(text: string): string {
  return text.replace(/\b(sk|rk|pk)_(live|test)_[A-Za-z0-9_*]+/g, "$1_$2_…");
}

export interface StripeAccess {
  fetch: Fetch;
  key: string;
  apiBase: string;
}

async function stripeGet(
  access: StripeAccess,
  path: string,
  params: ReadonlyArray<readonly [string, string]>,
): Promise<Record<string, unknown>> {
  const query = new URLSearchParams(params.map(([name, value]) => [name, value])).toString();
  let response: Response;
  try {
    response = await access.fetch(`${access.apiBase}${path}?${query}`, {
      headers: { Authorization: `Bearer ${access.key}` },
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new StripeFailure("unavailable", 0, "A Stripe não respondeu.");
  }
  const body = await readJson(response);
  if (response.ok && body) return body;

  const error = body && typeof body.error === "object" && body.error ? (body.error as Record<string, unknown>) : null;
  const message = typeof error?.message === "string" && error.message ? error.message : `HTTP ${response.status}`;
  const kind: StripeErrorKind =
    response.status === 401
      ? "key"
      : response.status === 403
        ? "permission"
        : response.status === 429
          ? "rate"
          : response.status >= 500 || response.ok
            ? "unavailable"
            : "request";
  throw new StripeFailure(kind, response.status, maskKeys(message).slice(0, 400));
}

function itemsOf(body: Record<string, unknown>): Array<Record<string, unknown>> {
  if (!Array.isArray(body.data)) return [];
  return body.data.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object");
}

/** O id do último item, para pedir a página seguinte (null quando a lista acabou). */
function nextCursor(body: Record<string, unknown>, items: Array<Record<string, unknown>>): string | null {
  const last = items[items.length - 1];
  return body.has_more === true && last && typeof last.id === "string" ? last.id : null;
}

export interface StripeLink {
  id: string;
  /** O endereço público do link de pagamento (ex.: https://buy.stripe.com/abc). */
  url: string;
  active: boolean;
}

/** Uma página dos links de pagamento da conta (ativos e desativados: um link desativado também já vendeu). */
export async function listPaymentLinks(
  access: StripeAccess,
  cursor: string | null,
): Promise<{ links: StripeLink[]; next: string | null }> {
  const params: Array<[string, string]> = [["limit", String(PAGE)]];
  if (cursor) params.push(["starting_after", cursor]);
  const body = await stripeGet(access, "/v1/payment_links", params);
  const items = itemsOf(body);
  const links: StripeLink[] = [];
  for (const item of items) {
    if (typeof item.id === "string" && typeof item.url === "string" && item.url) {
      links.push({ id: item.id, url: item.url, active: item.active !== false });
    }
  }
  return { links, next: nextCursor(body, items) };
}

/** Uma venda paga: quando foi (segundos desde 1970), quanto (na menor unidade da moeda, como a Stripe manda) e em que moeda. */
export interface StripeSale {
  t: number;
  a: number;
  c: string;
}

function paidSale(item: Record<string, unknown>, created: number): StripeSale | null {
  // só o que foi concluído e pago (boleto ou débito ainda pendente só entra quando o pagamento cair)
  if (item.status !== "complete" || item.payment_status !== "paid" || item.mode === "setup") return null;
  // Adaptive Pricing antigo (sessões de antes de 31/03/2025): amount_total vinha na moeda do cliente, e
  // o valor na moeda do vendedor ficava em currency_conversion. Depois disso, amount_total e currency já
  // são os do vendedor (o que o cliente viu fica em presentment_details, que não nos interessa).
  let amount: unknown = item.amount_total;
  let currency: unknown = item.currency;
  const conversion = item.currency_conversion;
  if (conversion && typeof conversion === "object") {
    const { amount_total, source_currency } = conversion as Record<string, unknown>;
    if (typeof amount_total === "number" && typeof source_currency === "string") {
      amount = amount_total;
      currency = source_currency;
    }
  }
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount < 0) return null;
  if (typeof currency !== "string" || !/^[A-Za-z]{3}$/.test(currency)) return null;
  return { t: created, a: amount, c: currency.toLowerCase() };
}

export interface SalesQuery {
  /** id do link de pagamento (plink_…) */
  link: string;
  /** começo do período (segundos desde 1970), inclusive */
  since: number;
  /** fim do período, exclusive (null = até agora) */
  until: number | null;
  cursor: string | null;
}

/**
 * As vendas pagas de um link de pagamento no período — até MAX_PAGES páginas da
 * Stripe por chamada. `next` diz de onde continuar (null = acabou).
 */
export async function listPaidSessions(
  access: StripeAccess,
  query: SalesQuery,
): Promise<{ sales: StripeSale[]; next: string | null }> {
  const sales: StripeSale[] = [];
  const started = Date.now();
  let cursor = query.cursor;
  // Se a Stripe recusar os filtros de situação e de data, o painel pede a lista inteira do link e
  // filtra aqui (a lista vem da mais nova para a mais antiga: ao passar do começo do período, acabou).
  let plain = false;
  for (let page = 0; page < MAX_PAGES; page++) {
    if (page > 0 && Date.now() - started > BUDGET_MS) break;
    const base: Array<[string, string]> = [
      ["payment_link", query.link],
      ["limit", String(PAGE)],
    ];
    if (cursor) base.push(["starting_after", cursor]);
    let body: Record<string, unknown> | null = null;
    if (!plain) {
      const filtered: Array<[string, string]> = [...base, ["status", "complete"], ["created[gte]", String(query.since)]];
      if (query.until !== null) filtered.push(["created[lt]", String(query.until)]);
      try {
        body = await stripeGet(access, "/v1/checkout/sessions", filtered);
      } catch (err) {
        if (!(err instanceof StripeFailure) || err.status !== 400) throw err;
        plain = true;
      }
    }
    if (!body) body = await stripeGet(access, "/v1/checkout/sessions", base);

    const items = itemsOf(body);
    let pastTheStart = false;
    for (const item of items) {
      const created = Number(item.created);
      if (!Number.isFinite(created)) continue;
      if (created < query.since) {
        pastTheStart = true;
        continue;
      }
      if (query.until !== null && created >= query.until) continue;
      const sale = paidSale(item, created);
      if (sale) sales.push(sale);
    }
    const next = nextCursor(body, items);
    if (!next || pastTheStart) return { sales, next: null };
    cursor = next;
  }
  return { sales, next: cursor };
}

// ---------------------------------------------------------------------------
// As duas rotas
// ---------------------------------------------------------------------------

export interface RouteDeps {
  env: Env;
  supabase: SupabaseConfig;
  fetch: Fetch;
  /** "Agora", em milissegundos (só os testes trocam). */
  now?: () => number;
}

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

// Situações previstas (Stripe ainda não ligada, chave recusada…) respondem 200 com `ok: false` e o
// motivo: são estados que a tela sabe explicar, não falhas. Só "sem login" (401) e "pedido malfeito"
// (400) usam o código de erro do HTTP.
function refused(error: string, extra: Record<string, unknown> = {}): Response {
  return json(200, { ok: false, error, ...extra });
}

async function prepare(
  request: Request,
  deps: RouteDeps,
): Promise<Response | { access: StripeAccess; body: Record<string, unknown> }> {
  const problem = await checkCaller(deps.fetch, deps.supabase, request.headers.get("authorization"));
  if (problem === "auth") return json(401, { ok: false, error: "auth" });
  if (problem) return refused(problem);
  const stripe = readStripeKey(deps.env);
  if (stripe.problem) return refused("not_configured", { problem: stripe.problem });
  let body: Record<string, unknown> = {};
  try {
    const parsed: unknown = await request.json();
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) body = parsed as Record<string, unknown>;
  } catch {
    // sem corpo (ou corpo que não é JSON): vale como pedido sem parâmetros
  }
  return { access: { fetch: deps.fetch, key: stripe.key, apiBase: stripeApiBase(deps.env) }, body };
}

function failed(err: unknown): Response {
  if (err instanceof StripeFailure) return refused("stripe", { kind: err.kind, detail: err.message });
  // (nunca o erro inteiro: ele poderia carregar o pedido, e o pedido leva a chave)
  console.error("[stripe] falha inesperada:", err instanceof Error ? err.name : typeof err);
  return json(500, { ok: false, error: "internal" });
}

function optionalId(value: unknown, pattern: RegExp): string | null | undefined {
  if (value === undefined || value === null || value === "") return null;
  return typeof value === "string" && pattern.test(value) ? value : undefined;
}

const LINK_ID = /^plink_[A-Za-z0-9]{1,120}$/;
const SESSION_ID = /^cs_[A-Za-z0-9_]{1,250}$/;
/** 01/01/2010: antes disso não existe venda na Stripe. */
const EARLIEST = 1_262_304_000;

/** POST /api/stripe/links — corpo: `{ cursor? }`. */
export async function handleLinks(request: Request, deps: RouteDeps): Promise<Response> {
  const ready = await prepare(request, deps);
  if (ready instanceof Response) return ready;
  const cursor = optionalId(ready.body.cursor, LINK_ID);
  if (cursor === undefined) return json(400, { ok: false, error: "bad_request" });
  try {
    const page = await listPaymentLinks(ready.access, cursor);
    return json(200, { ok: true, links: page.links, next: page.next, live: isLiveKey(ready.access.key) });
  } catch (err) {
    return failed(err);
  }
}

/** POST /api/stripe/sales — corpo: `{ link, since, until?, cursor? }`. */
export async function handleSales(request: Request, deps: RouteDeps): Promise<Response> {
  const ready = await prepare(request, deps);
  if (ready instanceof Response) return ready;
  const { link, since } = ready.body;
  const until = ready.body.until ?? null;
  const cursor = optionalId(ready.body.cursor, SESSION_ID);
  const latest = Math.floor((deps.now?.() ?? Date.now()) / 1000) + 86_400;
  if (typeof link !== "string" || !LINK_ID.test(link) || cursor === undefined) return json(400, { ok: false, error: "bad_request" });
  if (typeof since !== "number" || !Number.isInteger(since) || since < EARLIEST || since > latest) {
    return json(400, { ok: false, error: "bad_request" });
  }
  if (until !== null && (typeof until !== "number" || !Number.isInteger(until) || until <= since)) {
    return json(400, { ok: false, error: "bad_request" });
  }
  try {
    const page = await listPaidSessions(ready.access, { link, since, until, cursor });
    return json(200, { ok: true, sales: page.sales, next: page.next });
  } catch (err) {
    return failed(err);
  }
}
