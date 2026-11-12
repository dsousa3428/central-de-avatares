// Vendas pela Stripe: as regras do navegador (de quem é cada link, semanas, moedas, o que muda no
// painel) e o código do servidor (quem pode pedir, a chave, as listas da Stripe) — tudo sem rede.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  checkCaller,
  handleLinks,
  handleSales,
  isLiveKey,
  listPaidSessions,
  listPaymentLinks,
  maskKeys,
  readStripeKey,
  stripeApiBase,
  StripeFailure,
} from "../../src/lib/stripe-server.ts";
import {
  buildPlan,
  fromMinorUnits,
  linkKey,
  matchLinks,
  settle,
  startOfDay,
  weekOfTimestamp,
  weeklyFromStripe,
} from "../../src/lib/stripe-sync.ts";

// ---------------------------------------------------------------------------
// No navegador
// ---------------------------------------------------------------------------

test("link: o mesmo endereço escrito de jeitos diferentes é o mesmo link", () => {
  const key = "buy.stripe.com/28o5kD0wN1Zu4iA7ss";
  assert.equal(linkKey("https://buy.stripe.com/28o5kD0wN1Zu4iA7ss"), key);
  assert.equal(linkKey("buy.stripe.com/28o5kD0wN1Zu4iA7ss"), key);
  assert.equal(linkKey("  HTTPS://BUY.Stripe.com/28o5kD0wN1Zu4iA7ss/  "), key);
  assert.equal(linkKey("https://www.buy.stripe.com/28o5kD0wN1Zu4iA7ss?utm_source=bio&prefilled_email=a%40b.c#topo"), key);
  // no caminho, maiúsculas e minúsculas são letras diferentes
  assert.notEqual(linkKey("https://buy.stripe.com/28O5KD0WN1ZU4IA7SS"), key);
  for (const bad of [null, undefined, "", "   ", "mailto:a@b.c", "https://"]) assert.equal(linkKey(bad), null);
});

const avatar = (id, extra = {}) => ({ id, checkout_url: null, sales_site_url: null, extra_links: [], ...extra });
const link = (id, path, active = true) => ({ id, url: `https://buy.stripe.com/${path}`, active });

test("de quem é cada link: pelo Checkout, pelo site ou por um link extra do avatar", () => {
  const avatars = [
    avatar("a1", { checkout_url: "https://buy.stripe.com/aaa?locale=it" }),
    avatar("a2", { sales_site_url: "buy.stripe.com/bbb/", extra_links: [{ id: "1", label: "Upsell", url: "https://buy.stripe.com/ccc" }] }),
    avatar("a3", { checkout_url: "https://exemplo.com/checkout" }),
    avatar("a4", { checkout_url: "https://buy.stripe.com/ddd" }),
    avatar("a5", { extra_links: [{ id: "1", label: "o mesmo do a4", url: "https://buy.stripe.com/ddd" }] }),
  ];
  const links = [link("plink_a", "aaa"), link("plink_b", "bbb"), link("plink_c", "ccc", false), link("plink_d", "ddd"), link("plink_e", "eee")];
  const matching = matchLinks(avatars, links);
  assert.deepEqual([...matching.owner], [["plink_a", "a1"], ["plink_b", "a2"], ["plink_c", "a2"]]);
  assert.deepEqual([...matching.byAvatar].map(([id, own]) => [id, own.map((item) => item.id)]), [["a1", ["plink_a"]], ["a2", ["plink_b", "plink_c"]]]);
  // o mesmo link em dois avatares: não entra para ninguém (não há como dividir as vendas)
  assert.deepEqual(matching.shared.map((item) => [item.link.id, item.avatarIds]), [["plink_d", ["a4", "a5"]]]);
  assert.deepEqual(matching.unused.map((item) => item.id), ["plink_e"]);
});

test("valores: a Stripe manda na menor unidade da moeda", () => {
  assert.equal(fromMinorUnits(2700, "eur"), 27);
  assert.equal(fromMinorUnits(2799, "BRL"), 27.99);
  assert.equal(fromMinorUnits(2700, "jpy"), 2700); // iene não tem centavos
  assert.equal(fromMinorUnits(12345, "kwd"), 12.35); // três casas na Stripe; o painel guarda duas
  assert.equal(fromMinorUnits(500, "ugx"), 5); // a Stripe representa o xelim ugandense com duas casas
});

test("semana de uma venda: a do horário do aparelho, de segunda a domingo", () => {
  const at = (y, m, d, h = 12) => Math.floor(new Date(y, m - 1, d, h).getTime() / 1000);
  assert.equal(weekOfTimestamp(at(2026, 11, 12)), "2026-11-09"); // quinta
  assert.equal(weekOfTimestamp(at(2026, 11, 9, 0)), "2026-11-09"); // segunda, 00:00
  assert.equal(weekOfTimestamp(at(2026, 11, 15, 23)), "2026-11-09"); // domingo, 23:00
  assert.equal(weekOfTimestamp(at(2026, 11, 16, 0)), "2026-11-16");
  assert.equal(startOfDay("2026-11-09"), at(2026, 11, 9, 0));
});

const weekOf = (seconds) => (seconds < 200 ? "2026-11-02" : "2026-11-09"); // (para os testes: antes de 200 = semana passada)

test("vendas por semana: cada link soma no avatar dono dele, por moeda", () => {
  const sales = new Map([
    ["plink_a", [{ t: 100, a: 2700, c: "eur" }, { t: 150, a: 2700, c: "eur" }, { t: 300, a: 4700, c: "eur" }]],
    ["plink_b", [{ t: 300, a: 1010, c: "eur" }, { t: 301, a: 2000, c: "usd" }, { t: 302, a: 1020, c: "eur" }]],
    ["plink_sem_dono", [{ t: 300, a: 99900, c: "eur" }]],
  ]);
  const owner = new Map([["plink_a", "a1"], ["plink_b", "a1"]]);
  assert.deepEqual(weeklyFromStripe(sales, owner, weekOf), [
    { avatarId: "a1", week: "2026-11-02", parts: [{ currency: "EUR", amount: 54, count: 2 }] },
    { avatarId: "a1", week: "2026-11-09", parts: [{ currency: "EUR", amount: 67.3, count: 3 }, { currency: "USD", amount: 20, count: 1 }] },
  ]);
});

test("mais de uma moeda na semana: soma pelas cotações; sem cotação, fica a moeda com mais vendas", () => {
  const eur = { currency: "EUR", amount: 100, count: 4 };
  const usd = { currency: "USD", amount: 60, count: 2 };
  assert.deepEqual(settle([eur], {}), { ...eur, converted: false, left: [] });
  // com cotação das duas: tudo na moeda de maior valor, e o total em reais fica igual ao de lançamentos separados
  const both = settle([eur, usd], { EUR: 6, USD: 5 });
  assert.deepEqual(both, { currency: "EUR", amount: 150, count: 6, converted: true, left: [] });
  assert.equal(both.amount * 6, 100 * 6 + 60 * 5);
  assert.equal(settle([eur, { currency: "USD", amount: 200, count: 2 }], { EUR: 6, USD: 5 }).currency, "USD");
  // real não precisa de cotação
  assert.deepEqual(settle([{ currency: "BRL", amount: 50, count: 1 }, eur], { EUR: 6 }), { currency: "EUR", amount: 108.33, count: 5, converted: true, left: [] });
  // falta a cotação de alguma: nada é convertido; a outra moeda fica de fora (a tela avisa)
  assert.deepEqual(settle([eur, usd], { EUR: 6 }), { ...eur, converted: false, left: [usd] });
  assert.deepEqual(settle([usd, { ...eur, count: 2, amount: 10 }], {}), { ...usd, converted: false, left: [{ ...eur, count: 2, amount: 10 }] });
});

test("o que muda no painel: novo, diferente, igual — e o zero da semana passada", () => {
  const weeks = [
    { avatarId: "a1", week: "2026-11-09", parts: [{ currency: "EUR", amount: 54, count: 2 }] }, // sem lançamento → novo
    { avatarId: "a1", week: "2026-11-02", parts: [{ currency: "EUR", amount: 81, count: 3 }] }, // lançado diferente → muda
    { avatarId: "a2", week: "2026-11-02", parts: [{ currency: "EUR", amount: 27, count: 1 }] }, // já está igual
    { avatarId: "a3", week: "2026-11-02", parts: [{ currency: "EUR", amount: 27, count: 1 }] }, // mesmo valor, sem o nº de vendas → muda
  ];
  const sales = [
    { avatar_id: "a1", week_start: "2026-11-02", amount: "80.00", currency: "eur", sales_count: null },
    { avatar_id: "a2", week_start: "2026-11-02", amount: 27, currency: "EUR", sales_count: 1 },
    { avatar_id: "a3", week_start: "2026-11-02", amount: 27, currency: "EUR", sales_count: null },
    { avatar_id: "a4", week_start: "2026-10-26", amount: 500, currency: "EUR", sales_count: 9 }, // semana sem venda na Stripe: não é tocada
    { avatar_id: "a6", week_start: "2026-11-02", amount: 10, currency: "EUR", sales_count: 1 },
  ];
  const zeros = [
    { avatarId: "a5", week: "2026-11-02", currency: "eur" }, // ligado à Stripe, sem venda e sem lançamento → 0
    { avatarId: "a1", week: "2026-11-02", currency: "EUR" }, // teve venda: não é zero
    { avatarId: "a6", week: "2026-11-02", currency: "EUR" }, // já tem lançamento: fica como está
  ];
  const plan = buildPlan({ weeks, sales, rates: {}, zeros });
  assert.equal(plan.same, 1);
  assert.deepEqual(plan.rows.map((row) => `${row.week}|${row.avatarId}|${row.kind}`), [
    "2026-11-09|a1|new",
    "2026-11-02|a1|change",
    "2026-11-02|a3|change",
    "2026-11-02|a5|zero",
  ]);
  assert.deepEqual(plan.rows[0], {
    key: "a1:2026-11-09", avatarId: "a1", week: "2026-11-09", kind: "new", current: null,
    next: { currency: "EUR", amount: 54, count: 2 }, converted: false, left: [],
  });
  assert.deepEqual(plan.rows[1].current, { amount: 80, currency: "EUR", count: null });
  assert.deepEqual(plan.rows[3].next, { currency: "EUR", amount: 0, count: 0 });
  // sem a lista de zeros, semana sem venda não gera nada
  assert.equal(buildPlan({ weeks: [], sales, rates: {} }).rows.length, 0);
});

// ---------------------------------------------------------------------------
// No servidor
// ---------------------------------------------------------------------------

test("chave: só vale uma chave secreta ou restrita, e nunca numa variável pública", () => {
  assert.deepEqual(readStripeKey({}), { key: null, problem: "missing" });
  assert.deepEqual(readStripeKey({ STRIPE_SECRET_KEY: "   " }), { key: null, problem: "missing" });
  assert.deepEqual(readStripeKey({ STRIPE_SECRET_KEY: "pk_live_abc123" }), { key: null, problem: "publishable" });
  assert.deepEqual(readStripeKey({ STRIPE_SECRET_KEY: "minha chave" }), { key: null, problem: "format" });
  assert.deepEqual(readStripeKey({ STRIPE_SECRET_KEY: " rk_live_abc123XYZ \n" }), { key: "rk_live_abc123XYZ", problem: null });
  assert.deepEqual(readStripeKey({ STRIPE_SECRET_KEY: "sk_test_abc123" }), { key: "sk_test_abc123", problem: null });
  // chave secreta numa variável NEXT_PUBLIC_*: o servidor se recusa a trabalhar, mesmo com a certa no lugar
  assert.deepEqual(readStripeKey({ STRIPE_SECRET_KEY: "rk_live_abc123", NEXT_PUBLIC_STRIPE_KEY: "rk_live_abc123" }), { key: null, problem: "exposed" });
  assert.deepEqual(readStripeKey({ STRIPE_SECRET_KEY: "rk_live_abc123", NEXT_PUBLIC_STRIPE_KEY: "pk_live_abc123" }).problem, null); // (a publicável pode)
  assert.equal(isLiveKey("rk_live_abc"), true);
  assert.equal(isLiveKey("rk_test_abc"), false);
});

test("endereço da Stripe: só pode ser trocado por um endereço do próprio computador", () => {
  assert.equal(stripeApiBase({}), "https://api.stripe.com");
  assert.equal(stripeApiBase({ STRIPE_API_BASE: "http://127.0.0.1:54390" }), "http://127.0.0.1:54390");
  assert.equal(stripeApiBase({ STRIPE_API_BASE: "http://localhost:54390/v1" }), "http://localhost:54390");
  for (const evil of ["https://exemplo.com", "http://exemplo.com", "http://127.0.0.1.exemplo.com", "https://127.0.0.1", "nada"]) {
    assert.equal(stripeApiBase({ STRIPE_API_BASE: evil }), "https://api.stripe.com");
  }
});

test("mensagens: nada com cara de chave passa adiante", () => {
  assert.equal(maskKeys("The provided key 'rk_live_51Habc*****XYZ9' does not have"), "The provided key 'rk_live_…' does not have");
  assert.equal(maskKeys("sk_test_abc123 e pk_live_zzz"), "sk_test_… e pk_live_…");
});

const TOKEN = "aaa.bbb.ccc";
const SUPABASE = { url: "https://projeto.supabase.co", key: "sb_publishable_x" };
const reply = (status, body) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/** Um Supabase de mentira: responde o usuário e as configurações de login. */
function supabaseFetch({ user = reply(200, { id: "u1", email: "dono@exemplo.com" }), settings = reply(200, { disable_signup: true }), seen = [] } = {}) {
  return async (url, init) => {
    seen.push({ url: String(url), headers: init?.headers ?? {} });
    if (String(url) === "https://projeto.supabase.co/auth/v1/user") return typeof user === "function" ? user() : user.clone();
    if (String(url) === "https://projeto.supabase.co/auth/v1/settings") return settings.clone();
    throw new Error(`pedido inesperado: ${url}`);
  };
}

test("quem pede: só alguém logado no painel, e só com o cadastro público desligado", async () => {
  const seen = [];
  assert.equal(await checkCaller(supabaseFetch({ seen }), SUPABASE, `Bearer ${TOKEN}`), null);
  assert.deepEqual(seen.find((call) => call.url.endsWith("/user")).headers, { apikey: "sb_publishable_x", Authorization: `Bearer ${TOKEN}` });

  // sem o login, ou com algo que não é um login: nem pergunta ao Supabase
  for (const header of [null, "", "Bearer", "Bearer abc", `Basic ${TOKEN}`, `Bearer ${TOKEN} extra`, "Bearer a.b.c\nx"]) {
    const calls = [];
    assert.equal(await checkCaller(supabaseFetch({ seen: calls }), SUPABASE, header), "auth");
    assert.equal(calls.length, 0);
  }
  // login recusado pelo Supabase (vencido, inventado)
  assert.equal(await checkCaller(supabaseFetch({ user: reply(401, { msg: "invalid JWT" }) }), SUPABASE, `Bearer ${TOKEN}`), "auth");
  assert.equal(await checkCaller(supabaseFetch({ user: reply(403, {}) }), SUPABASE, `Bearer ${TOKEN}`), "auth");
  // usuário anônimo não é o dono
  assert.equal(await checkCaller(supabaseFetch({ user: reply(200, { id: "u2", is_anonymous: true }) }), SUPABASE, `Bearer ${TOKEN}`), "auth");
  assert.equal(await checkCaller(supabaseFetch({ user: reply(200, {}) }), SUPABASE, `Bearer ${TOKEN}`), "auth");
  // cadastro público ligado (ou não informado): qualquer pessoa poderia criar uma conta e usar a chave
  assert.equal(await checkCaller(supabaseFetch({ settings: reply(200, { disable_signup: false }) }), SUPABASE, `Bearer ${TOKEN}`), "signup_open");
  assert.equal(await checkCaller(supabaseFetch({ settings: reply(200, {}) }), SUPABASE, `Bearer ${TOKEN}`), "signup_open");
  // Supabase fora do ar ou mal configurado: na dúvida, não
  assert.equal(await checkCaller(supabaseFetch({ settings: reply(500, {}) }), SUPABASE, `Bearer ${TOKEN}`), "supabase");
  assert.equal(await checkCaller(supabaseFetch({ user: reply(500, {}) }), SUPABASE, `Bearer ${TOKEN}`), "supabase");
  assert.equal(await checkCaller(async () => { throw new Error("sem rede"); }, SUPABASE, `Bearer ${TOKEN}`), "supabase");
  assert.equal(await checkCaller(supabaseFetch(), { url: "", key: "x" }, `Bearer ${TOKEN}`), "supabase");
  assert.equal(await checkCaller(supabaseFetch(), { url: SUPABASE.url, key: "" }, `Bearer ${TOKEN}`), "supabase");
});

const KEY = "rk_test_chave_dos_testes";

/** Uma Stripe de mentira: `answer(path, query)` devolve a resposta; guarda o que foi pedido. */
function stripeAccess(answer) {
  const calls = [];
  return {
    calls,
    access: {
      key: KEY,
      apiBase: "https://api.stripe.com",
      fetch: async (url, init) => {
        const parsed = new URL(String(url));
        const query = Object.fromEntries(parsed.searchParams);
        calls.push({ path: parsed.pathname, query, authorization: init.headers.Authorization });
        return answer(parsed.pathname, query);
      },
    },
  };
}

test("links de pagamento: uma página por vez, só o endereço e a situação", async () => {
  const { access, calls } = stripeAccess((path, query) =>
    query.starting_after
      ? reply(200, { data: [{ id: "plink_3", url: "https://buy.stripe.com/c", active: false, metadata: { segredo: "x" } }], has_more: false })
      : reply(200, { data: [{ id: "plink_1", url: "https://buy.stripe.com/a", active: true }, { id: "plink_2", url: "https://buy.stripe.com/b" }, { id: "plink_sem_url" }, null], has_more: true }),
  );
  const first = await listPaymentLinks(access, null);
  assert.deepEqual(first, {
    links: [{ id: "plink_1", url: "https://buy.stripe.com/a", active: true }, { id: "plink_2", url: "https://buy.stripe.com/b", active: true }],
    next: "plink_sem_url",
  });
  assert.deepEqual(await listPaymentLinks(access, "plink_2"), { links: [{ id: "plink_3", url: "https://buy.stripe.com/c", active: false }], next: null });
  assert.deepEqual(calls, [
    { path: "/v1/payment_links", query: { limit: "100" }, authorization: `Bearer ${KEY}` },
    { path: "/v1/payment_links", query: { limit: "100", starting_after: "plink_2" }, authorization: `Bearer ${KEY}` },
  ]);
});

const session = (id, created, extra = {}) => ({ id, created, amount_total: 2700, currency: "eur", status: "complete", payment_status: "paid", mode: "payment", ...extra });

test("vendas de um link: só as pagas, no período, com o mínimo de dados", async () => {
  const { access, calls } = stripeAccess(() =>
    reply(200, {
      has_more: false,
      data: [
        session("cs_1", 1000, { customer_details: { email: "cliente@exemplo.com", name: "Cliente" } }),
        session("cs_2", 900, { amount_total: 4700, currency: "USD" }),
        session("cs_3", 800, { payment_status: "unpaid" }), // boleto ainda não pago
        session("cs_4", 700, { status: "open", payment_status: "unpaid" }),
        session("cs_5", 600, { status: "expired", payment_status: "unpaid" }),
        session("cs_6", 500, { payment_status: "no_payment_required", amount_total: 0 }), // cupom de 100%
        session("cs_7", 400, { mode: "setup", amount_total: null }),
        session("cs_8", 300, { amount_total: null }),
        // Adaptive Pricing antigo: o cliente pagou em dólar canadense; o valor do vendedor está em currency_conversion
        session("cs_9", 200, { amount_total: 3999, currency: "cad", currency_conversion: { amount_total: 2700, source_currency: "eur", fx_rate: "1.48" } }),
        // Adaptive Pricing novo: amount_total já é do vendedor; o que o cliente viu vai em presentment_details
        session("cs_10", 150, { presentment_details: { presentment_amount: 3999, presentment_currency: "cad" } }),
        session("cs_11", 50), // antes do período
      ],
    }),
  );
  const page = await listPaidSessions(access, { link: "plink_1", since: 100, until: null, cursor: null });
  assert.deepEqual(page, {
    sales: [{ t: 1000, a: 2700, c: "eur" }, { t: 900, a: 4700, c: "usd" }, { t: 200, a: 2700, c: "eur" }, { t: 150, a: 2700, c: "eur" }],
    next: null,
  });
  assert.equal(JSON.stringify(page).includes("cliente"), false); // nada do cliente segue adiante
  assert.deepEqual(calls[0], {
    path: "/v1/checkout/sessions",
    query: { payment_link: "plink_1", limit: "100", status: "complete", "created[gte]": "100" },
    authorization: `Bearer ${KEY}`,
  });
});

test("vendas de um link: até três páginas por chamada, e continua de onde parou", async () => {
  // quatro páginas de uma venda cada
  const { access, calls } = stripeAccess((path, query) => {
    const n = query.starting_after ? Number(query.starting_after.slice(3)) + 1 : 1;
    return reply(200, { data: [session(`cs_${n}`, 1000 - n)], has_more: n < 4 });
  });
  const first = await listPaidSessions(access, { link: "plink_1", since: 100, until: 2000, cursor: null });
  assert.deepEqual(first.sales.map((sale) => sale.t), [999, 998, 997]);
  assert.equal(first.next, "cs_3");
  assert.equal(calls[0].query["created[lt]"], "2000");
  const second = await listPaidSessions(access, { link: "plink_1", since: 100, until: 2000, cursor: first.next });
  assert.deepEqual(second, { sales: [{ t: 996, a: 2700, c: "eur" }], next: null });
  assert.equal(calls.length, 4);
});

test("vendas de um link: se a Stripe recusar os filtros, pede a lista inteira e filtra aqui", async () => {
  const all = [session("cs_1", 900), session("cs_2", 800, { status: "expired", payment_status: "unpaid" }), session("cs_3", 700), session("cs_4", 90), session("cs_5", 80)];
  const { access, calls } = stripeAccess((path, query) => {
    if (query.status || query["created[gte]"]) return reply(400, { error: { message: "Received unknown parameter: status" } });
    const start = query.starting_after ? all.findIndex((item) => item.id === query.starting_after) + 1 : 0;
    return reply(200, { data: all.slice(start, start + 2), has_more: start + 2 < all.length });
  });
  const page = await listPaidSessions(access, { link: "plink_1", since: 100, until: null, cursor: null });
  // para ao passar do começo do período (a lista vem da mais nova para a mais antiga)
  assert.deepEqual(page, { sales: [{ t: 900, a: 2700, c: "eur" }, { t: 700, a: 2700, c: "eur" }], next: null });
  assert.deepEqual(calls.map((call) => Boolean(call.query.status)), [true, false, false]); // tentou filtrar uma vez só
});

test("erros da Stripe: cada um com o seu motivo, sem nunca mostrar a chave", async () => {
  const failing = (status, body) => stripeAccess(() => reply(status, body)).access;
  const kindOf = async (access) => {
    try {
      await listPaymentLinks(access, null);
      return "nenhum erro";
    } catch (err) {
      assert.ok(err instanceof StripeFailure);
      assert.equal(err.message.includes(KEY), false);
      return `${err.kind}|${err.status}|${err.message}`;
    }
  };
  assert.equal(await kindOf(failing(401, { error: { message: `Invalid API Key provided: ${KEY}` } })), "key|401|Invalid API Key provided: rk_test_…");
  assert.equal(await kindOf(failing(403, { error: { message: "does not have the required permissions" } })), "permission|403|does not have the required permissions");
  assert.equal(await kindOf(failing(429, { error: { message: "Too many requests" } })), "rate|429|Too many requests");
  assert.equal(await kindOf(failing(500, {})), "unavailable|500|HTTP 500");
  assert.equal(await kindOf(failing(400, { error: { message: "No such payment_link" } })), "request|400|No such payment_link");
  assert.equal(await kindOf(failing(200, [])), "unavailable|200|HTTP 200"); // resposta que não é o que a Stripe manda
  const offline = { key: KEY, apiBase: "https://api.stripe.com", fetch: async () => { throw new Error(`falha ao chamar com ${KEY}`); } };
  assert.equal(await kindOf(offline), "unavailable|0|A Stripe não respondeu.");
});

// --- as rotas inteiras ---

function routeDeps({ env = { STRIPE_SECRET_KEY: KEY }, supabase = {}, stripe = () => reply(200, { data: [], has_more: false }) } = {}) {
  const calls = [];
  const supa = supabaseFetch(supabase);
  return {
    calls,
    deps: {
      env,
      supabase: SUPABASE,
      now: () => 1_800_000_000_000,
      fetch: async (url, init) => {
        const parsed = new URL(String(url));
        if (parsed.origin === "https://projeto.supabase.co") return supa(url, init);
        calls.push({ url: String(url), authorization: init.headers.Authorization });
        return stripe(parsed.pathname, Object.fromEntries(parsed.searchParams));
      },
    },
  };
}
const post = (body, token = TOKEN) =>
  new Request("https://painel.exemplo.com/api/stripe/x", {
    method: "POST",
    headers: token ? { authorization: `Bearer ${token}`, "content-type": "application/json" } : {},
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const read = async (response) => ({ status: response.status, body: await response.json(), cache: response.headers.get("cache-control") });

test("rota dos links: sem login nada acontece; com login, a lista — e a chave fica no servidor", async () => {
  // sem login: 401, e a Stripe nem é chamada
  const anonymous = routeDeps();
  assert.deepEqual(await read(await handleLinks(post({}, null), anonymous.deps)), { status: 401, body: { ok: false, error: "auth" }, cache: "no-store" });
  assert.equal(anonymous.calls.length, 0);
  // login que o Supabase não reconhece
  const stranger = routeDeps({ supabase: { user: reply(401, {}) } });
  assert.equal((await handleLinks(post({}), stranger.deps)).status, 401);
  assert.equal(stranger.calls.length, 0);
  // cadastro público ligado: recusa, sem chamar a Stripe
  const open = routeDeps({ supabase: { settings: reply(200, { disable_signup: false }) } });
  assert.deepEqual((await read(await handleLinks(post({}), open.deps))).body, { ok: false, error: "signup_open" });
  assert.equal(open.calls.length, 0);
  // sem a chave (ou com a errada): explica o que falta — mas só para quem está logado
  assert.deepEqual((await read(await handleLinks(post({}), routeDeps({ env: {} }).deps))).body, { ok: false, error: "not_configured", problem: "missing" });
  assert.deepEqual((await read(await handleLinks(post({}), routeDeps({ env: { STRIPE_SECRET_KEY: "pk_live_x1234" } }).deps))).body, { ok: false, error: "not_configured", problem: "publishable" });
  assert.equal((await read(await handleLinks(post({}, null), routeDeps({ env: {} }).deps))).status, 401);

  // tudo certo
  const fine = routeDeps({ stripe: () => reply(200, { data: [{ id: "plink_1", url: "https://buy.stripe.com/a", active: true }], has_more: false }) });
  const result = await read(await handleLinks(post({}), fine.deps));
  assert.deepEqual(result, { status: 200, body: { ok: true, links: [{ id: "plink_1", url: "https://buy.stripe.com/a", active: true }], next: null, live: false }, cache: "no-store" });
  assert.deepEqual(fine.calls, [{ url: "https://api.stripe.com/v1/payment_links?limit=100", authorization: `Bearer ${KEY}` }]);
  assert.equal(JSON.stringify(result).includes(KEY), false);
  // corpo vazio também vale; continuação inválida, não
  assert.equal((await read(await handleLinks(post(undefined), routeDeps().deps))).body.ok, true);
  for (const cursor of ["cs_1", "plink_1/../x", 5, "plink_"]) assert.equal((await handleLinks(post({ cursor }), routeDeps().deps)).status, 400);
  // erro da Stripe: vai o motivo, não a chave
  const denied = routeDeps({ stripe: () => reply(403, { error: { message: `The provided key '${KEY}' does not have the required permissions` } }) });
  assert.deepEqual((await read(await handleLinks(post({}), denied.deps))).body, {
    ok: false, error: "stripe", kind: "permission", detail: "The provided key 'rk_test_…' does not have the required permissions",
  });
});

test("rota das vendas: confere o pedido antes de falar com a Stripe", async () => {
  const fine = routeDeps({ stripe: () => reply(200, { data: [session("cs_1", 1_799_000_000, { customer_email: "cliente@exemplo.com" })], has_more: false }) });
  const result = await read(await handleSales(post({ link: "plink_1", since: 1_798_000_000 }), fine.deps));
  assert.deepEqual(result.body, { ok: true, sales: [{ t: 1_799_000_000, a: 2700, c: "eur" }], next: null });
  assert.equal(fine.calls[0].url, "https://api.stripe.com/v1/checkout/sessions?payment_link=plink_1&limit=100&status=complete&created%5Bgte%5D=1798000000");

  const bad = [
    {},
    { link: "plink_1" }, // sem o começo do período
    { link: "outra_coisa", since: 1_798_000_000 },
    { link: "plink_1&status=open", since: 1_798_000_000 }, // tentativa de enfiar outro parâmetro no pedido
    { link: "plink_1", since: "1798000000" },
    { link: "plink_1", since: 1_798_000_000.5 },
    { link: "plink_1", since: 1000 }, // antes de a Stripe existir
    { link: "plink_1", since: 1_900_000_000 }, // no futuro
    { link: "plink_1", since: 1_798_000_000, until: 1_797_000_000 }, // fim antes do começo
    { link: "plink_1", since: 1_798_000_000, cursor: "plink_1" },
  ];
  for (const body of bad) {
    const deps = routeDeps();
    assert.equal((await handleSales(post(body), deps.deps)).status, 400, JSON.stringify(body));
    assert.equal(deps.calls.length, 0);
  }
  assert.equal((await handleSales(post({ link: "plink_1", since: 1_798_000_000 }, null), routeDeps().deps)).status, 401);
});
