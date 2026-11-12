// Teste de ponta a ponta das VENDAS PELA STRIPE: o painel busca as vendas de cada link de
// pagamento e lança na semana certa do avatar.
//
//   node dev/e2e/etapa-h.cjs      (com o app rodando em http://localhost:3000)
//
// A Stripe aqui é a de mentira (dev/stripe-mock.cjs), ligada por este teste na porta que o
// .env.local de testes aponta. Nenhum pedido sai para a Stripe de verdade.
const { chromium } = require("playwright");
const { spawn } = require("node:child_process");
const { existsSync, readdirSync, readFileSync, statSync } = require("node:fs");
const { join } = require("node:path");
const { BASE, USER, psql, resetData, ok, section, assert, openPhone, finish, fail } = require("./helpers.cjs");
const { startStripeMock, paidSession, KEY } = require("../stripe-mock.cjs");

const root = join(__dirname, "..", "..");

// Espera o banco chegar a um valor (as gravações da tela levam alguns instantes).
async function db(sql, expected, message) {
  let value = "";
  for (let i = 0; i < 40; i++) {
    value = psql(sql);
    if (value === expected) break;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  assert(value === expected, `${message}${value === expected ? "" : ` (banco: “${value}”, esperado: “${expected}”)`}`);
}

// A segunda-feira desta semana e das anteriores (o teste roda em UTC, como o banco).
const now = new Date();
const mondayUTC = (weeksAgo = 0) =>
  Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - ((now.getUTCDay() + 6) % 7) - 7 * weeksAgo) / 1000;
/** Um instante dentro da semana (segunda-feira + algumas horas). */
const inWeek = (weeksAgo, hours = 10) => mondayUTC(weeksAgo) + hours * 3600;
const monday = (weeksAgo = 0) => `(date_trunc('week', current_date)::date - ${7 * weeksAgo})`;
const saleOf = (avatar, weeksAgo, column = "s.amount || '|' || s.currency || '|' || coalesce(s.sales_count::text, '') || '|' || s.is_example") =>
  `select coalesce((select ${column} from public.weekly_sales s join public.avatars a on a.id = s.avatar_id where a.name = '${avatar.replace(/'/g, "''")}' and s.week_start = ${monday(weeksAgo)}), 'nada')`;

const FRA = "plink_FraSalvio01";
const LUCIA = "plink_SuorLucia02";
const OTHER = "plink_SemAvatar03";

/** Todos os arquivos de uma pasta (e das pastas dentro dela). */
function filesIn(dir) {
  const files = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) files.push(...filesIn(path));
    else files.push(path);
  }
  return files;
}

/** O login do usuário de teste, pedido direto ao Supabase local (para chamar as rotas sem o navegador). */
async function testToken() {
  const env = readFileSync(join(root, ".env.local"), "utf8");
  const apikey = /^NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=(.+)$/m.exec(env)[1].trim();
  const response = await fetch("http://localhost:54321/auth/v1/token?grant_type=password", {
    method: "POST",
    headers: { apikey, "content-type": "application/json" },
    body: JSON.stringify(USER),
  });
  return (await response.json()).access_token;
}

async function route(base, path, { token, body = {}, method = "POST" } = {}) {
  const response = await fetch(base + path, {
    method,
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: method === "POST" ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    // resposta sem corpo
  }
  return { status: response.status, json, text };
}

(async () => {
  resetData();
  let mock = await startStripeMock();
  mock.state.links = [
    { id: FRA, url: "https://buy.stripe.com/test_fraSalvio01", active: true },
    { id: LUCIA, url: "https://buy.stripe.com/test_suorLucia02", active: true },
    { id: OTHER, url: "https://buy.stripe.com/test_semAvatar03", active: false },
  ];
  mock.state.sessions = [
    // esta semana: 2 vendas pagas de € 27, uma ainda não paga e uma abandonada
    paidSession(FRA, inWeek(0, 1), 2700),
    paidSession(FRA, inWeek(0, 2), 2700, "eur", { customer_details: { email: "cliente@exemplo.com", name: "Cliente Secreto" } }),
    paidSession(FRA, inWeek(0, 3), 2700, "eur", { payment_status: "unpaid" }),
    paidSession(FRA, inWeek(0, 4), 2700, "eur", { status: "expired", payment_status: "unpaid" }),
    // semana passada: 8 vendas (igual ao que o exemplo já tem lançado: 8 × € 27)
    ...Array.from({ length: 8 }, (_, i) => paidSession(FRA, inWeek(1, 5 + i), 2700)),
    // há 2 semanas: 4 vendas (o exemplo tem 3 lançadas)
    ...Array.from({ length: 4 }, (_, i) => paidSession(FRA, inWeek(2, 30 + i), 2700)),
    // há 6 semanas: 1 venda (fora das "últimas 4 semanas")
    paidSession(FRA, inWeek(6, 50), 2700),
    // um link que não é de nenhum avatar
    paidSession(OTHER, inWeek(0, 1), 99900),
  ];

  const session = await openPhone(chromium, { timezoneId: "UTC" });
  const { page, dialog, shot, toast, noDialog, overflow, clipboard, more } = session;
  // tudo que as rotas da Stripe responderam ao navegador (para conferir que a chave nunca veio junto)
  const answers = [];
  page.on("response", async (response) => {
    if (!response.url().includes("/api/stripe/")) return;
    answers.push(await response.text().catch(() => ""));
  });

  const openSales = async () => {
    await page.getByRole("link", { name: "Vendas" }).click();
    await page.getByRole("heading", { name: "Vendas", exact: true }).waitFor();
  };
  const openStripe = async () => {
    await page.getByRole("button", { name: "Stripe", exact: true }).click();
    await dialog().getByRole("heading", { name: "Vendas pela Stripe" }).waitFor();
  };
  const search = () => dialog().getByRole("button", { name: "Buscar vendas" }).click();
  const close = async () => {
    await dialog().getByRole("button", { name: "Fechar", exact: true }).last().click();
    await noDialog();
  };
  const reload = async () => {
    await page.reload();
    await page.getByRole("heading", { name: "Vendas", exact: true }).waitFor({ timeout: 30000 });
    await page.getByRole("heading", { name: "Lançar vendas" }).waitFor({ timeout: 30000 });
  };
  // a janela não pode rolar para o lado
  const fits = async (where) => {
    const extra = await dialog().evaluate((element) => {
      const body = element.querySelector(".overflow-y-auto");
      return body ? body.scrollWidth - body.clientWidth : 0;
    });
    assert(extra <= 0, `sem rolagem lateral na janela (${where})`);
  };
  const row = (name) => dialog().locator("li", { has: page.getByText(name, { exact: true }) });
  // o texto de um trecho da tela, com espaços comuns (os valores em dinheiro usam um espaço que não quebra a linha)
  const textOf = async (locator) => (await locator.innerText()).replace(/\u00a0/g, " ");

  // ---------------------------------------------------------------
  section("A chave fica só no servidor");
  const anonymous = await route(BASE, "/api/stripe/links");
  assert(anonymous.status === 401 && anonymous.json?.error === "auth", "sem login, a rota dos links responde 401");
  assert((await route(BASE, "/api/stripe/sales", { body: { link: FRA, since: mondayUTC(1) } })).status === 401, "e a das vendas também");
  assert((await route(BASE, "/api/stripe/links", { token: "aaa.bbb.ccc" })).status === 401, "um login inventado não passa");
  assert((await route(BASE, "/api/stripe/links", { method: "GET" })).status === 405, "as rotas só aceitam POST");
  assert(mock.requests.length === 0, "nenhum desses pedidos chegou à Stripe");
  const token = await testToken();
  const links = await route(BASE, "/api/stripe/links", { token });
  assert(links.status === 200 && links.json?.ok === true && links.json.links.length === 3 && links.json.live === false, "com login, a rota devolve os links da conta (chave de teste)");
  assert(!links.text.includes(KEY) && mock.requests.every((request) => request.authorization === `Bearer ${KEY}`), "a chave vai do servidor para a Stripe, e não volta na resposta");
  const sales = await route(BASE, "/api/stripe/sales", { token, body: { link: FRA, since: mondayUTC(0) } });
  assert(
    sales.json?.ok === true && sales.json.sales.length === 2 && sales.json.sales.every((sale) => Object.keys(sale).join() === "t,a,c") && !sales.text.includes("Cliente"),
    "de cada venda paga só vêm a hora, o valor e a moeda (nada do cliente)",
  );
  assert((await route(BASE, "/api/stripe/sales", { token, body: { link: `${FRA}&limit=1`, since: mondayUTC(0) } })).status === 400, "pedido malfeito é recusado antes de chegar à Stripe");
  const built = join(root, ".next", "static");
  if (existsSync(built)) {
    const leaked = filesIn(built).filter((file) => readFileSync(file).includes(KEY));
    assert(leaked.length === 0, "a chave não está em nenhum arquivo que o navegador baixa");
  }

  // ---------------------------------------------------------------
  section("Antes de ligar: nenhum avatar tem link da Stripe");
  await session.login();
  await openSales();
  await page.getByRole("heading", { name: "Lançar vendas" }).waitFor();
  await openStripe();
  await dialog().getByText("Nenhum avatar está ligado a um link da Stripe ainda.").waitFor();
  await dialog().getByText("A sua conta Stripe tem 3 links de pagamento.").waitFor();
  ok("a janela diz que falta colar o link no avatar, e quantos links a conta tem");
  await dialog().getByText(/A chave guardada na Vercel é de teste/).waitFor();
  ok("chave de teste: a janela avisa que os números não são de clientes de verdade");
  assert(await dialog().getByRole("button", { name: "Buscar vendas" }).isDisabled(), "sem avatar ligado não há o que buscar");
  await fits("sem avatar ligado");
  await shot("h10-stripe-sem-link");
  await close();

  // ---------------------------------------------------------------
  section("Dizer qual link é de qual avatar: o campo Checkout");
  const fraId = psql("select id from public.avatars where name = 'Fra'' Salvio'");
  await page.goto(`${BASE}/avatar?id=${fraId}&aba=links`);
  await page.getByRole("heading", { name: "Links principais" }).waitFor({ timeout: 30000 });
  await page.getByRole("button", { name: "Editar", exact: true }).click();
  await dialog().getByText(/Vende pela Stripe\? Cole aqui o link de pagamento/).waitFor();
  ok("o campo Checkout explica que é por ele que o painel acha as vendas");
  // (colado com o que costuma vir junto: o painel compara só o endereço do link)
  await dialog().getByLabel("Checkout", { exact: true }).fill("buy.stripe.com/test_fraSalvio01?locale=it&utm_source=bio");
  await dialog().getByRole("button", { name: "Salvar", exact: true }).click();
  await toast("Links salvos");
  await noDialog();

  // ---------------------------------------------------------------
  section("Buscar, conferir e lançar");
  await openSales();
  await openStripe();
  await dialog().getByRole("heading", { name: "Avatares ligados" }).waitFor();
  await row("🇮🇹 Fra' Salvio").getByText("buy.stripe.com/test_fraSalvio01").waitFor();
  ok("o avatar aparece ligado ao link de pagamento dele");
  await dialog().getByText("2 links da Stripe sem avatar").click();
  await dialog().getByText("buy.stripe.com/test_semAvatar03 (desativado)").waitFor();
  ok("os links da conta que nenhum avatar usa ficam à mão (com o desativado marcado)");
  assert((await dialog().getByLabel("Buscar as vendas de").inputValue()) === "4", "o período sugerido são as últimas 4 semanas");
  mock.requests.length = 0;
  await search();
  await dialog().getByText("2 lançamentos para atualizar. Desmarque o que não deve ser gravado.").waitFor();
  const asked = mock.requests.filter((request) => request.path === "/v1/checkout/sessions");
  assert(
    asked.length === 1 && asked[0].query.payment_link === FRA && asked[0].query.status === "complete" && asked[0].query["created[gte]"] === String(mondayUTC(3)),
    "o painel pede à Stripe só as vendas concluídas do link do avatar, desde a segunda-feira de 4 semanas atrás",
  );
  await dialog().getByRole("heading", { name: /^Esta semana/ }).waitFor();
  assert(/Novo: € 54,00 · 2 vendas/.test(await textOf(row("🇮🇹 Fra' Salvio").first())), "esta semana: 2 vendas pagas de € 27 (a não paga e a abandonada ficam de fora)");
  assert(/No painel: € 81,00 · 3 vendas → € 108,00 · 4 vendas/.test(await textOf(row("🇮🇹 Fra' Salvio").nth(1))), "há 2 semanas: o painel tinha 3 vendas, a Stripe tem 4 — mostra o antes e o depois");
  await dialog().getByText("1 outro lançamento já estava igual ao da Stripe.").waitFor();
  ok("a semana passada já estava igual: não entra na lista");
  assert(psql(saleOf("Fra' Salvio", 0)) === "nada", "nada é gravado antes de confirmar");
  await fits("conferência");
  await shot("h20-stripe-conferencia");
  await dialog().getByRole("button", { name: "Lançar 2" }).click();
  await toast("2 lançamentos atualizados pela Stripe");
  await noDialog();
  await db(saleOf("Fra' Salvio", 0), "54.00|EUR|2|false", "esta semana ficou com € 54,00 e 2 vendas");
  await db(saleOf("Fra' Salvio", 2), "108.00|EUR|4|false", "a de 2 semanas atrás foi corrigida (e deixou de ser exemplo)");
  assert(psql(saleOf("Fra' Salvio", 1)) === "216.00|EUR|8|true" && psql(saleOf("Fra' Salvio", 3)) === "297.00|EUR|11|true", "a semana que já estava igual e a semana sem venda na Stripe não foram tocadas");
  assert(psql(saleOf("Fra' Salvio", 0, "(select generation from public.accounts where id = s.account_id)::text")) === "2", "o lançamento novo fica ligado à conta que está no ar");
  assert((await page.getByLabel("Vendas de Fra' Salvio na semana").inputValue()) === "54,00", "a tela Vendas já mostra o valor lançado");

  // de novo: nada para fazer
  await openStripe();
  await search();
  await dialog().getByText("Tudo em dia.").waitFor();
  await dialog().getByText("As vendas da Stripe neste período já estão lançadas no painel (3 lançamentos conferidos).").waitFor();
  ok("buscar de novo sem venda nova: “Tudo em dia”");
  await close();

  // ---------------------------------------------------------------
  section("Venda nova: atualiza o lançamento; dá para deixar uma linha de fora");
  mock.state.sessions.push(paidSession(FRA, inWeek(0, 6), 4700));
  await openStripe();
  await search();
  await dialog().getByText("1 lançamento para atualizar.").waitFor();
  assert(/No painel: € 54,00 · 2 vendas → € 101,00 · 3 vendas/.test(await textOf(row("🇮🇹 Fra' Salvio"))), "a venda nova entra na soma da semana");
  await row("🇮🇹 Fra' Salvio").getByRole("checkbox").uncheck();
  assert(await dialog().getByRole("button", { name: "Lançar", exact: true }).isDisabled(), "com tudo desmarcado não há o que lançar");
  await row("🇮🇹 Fra' Salvio").getByRole("checkbox").check();
  await dialog().getByRole("button", { name: "Lançar 1" }).click();
  await toast("1 lançamento atualizado pela Stripe");
  await db(saleOf("Fra' Salvio", 0), "101.00|EUR|3|false", "o lançamento da semana passou para € 101,00 e 3 vendas");

  // um período maior alcança vendas mais antigas
  await openStripe();
  await dialog().getByLabel("Buscar as vendas de").selectOption("12");
  await search();
  await dialog().getByText("1 lançamento para atualizar.").waitFor();
  assert(/No painel: € 135,00 · 5 vendas → € 27,00 · 1 venda/.test(await textOf(row("🇮🇹 Fra' Salvio"))), "com 12 semanas, a venda de 6 semanas atrás entra na conferência");
  await dialog().getByRole("button", { name: "Voltar" }).click();
  await dialog().getByRole("heading", { name: "Avatares ligados" }).waitFor();
  ok("“Voltar” desiste sem gravar");
  assert(psql(saleOf("Fra' Salvio", 6)) === "135.00|EUR|5|true", "(a semana antiga continua como estava)");
  await close();

  // ---------------------------------------------------------------
  section("O lançamento mudou depois da conferência: o painel não grava por cima");
  await openStripe();
  await dialog().getByLabel("Buscar as vendas de").selectOption("12");
  await search();
  await dialog().getByText("1 lançamento para atualizar.").waitFor();
  // com a lista na tela, o valor dessa semana é corrigido em outro aparelho — e, ao voltar para o painel
  // (15 s depois), este aparelho fica sabendo
  psql(`update public.weekly_sales set amount = 140, updated_at = now() where week_start = ${monday(6)}`);
  await page.waitForTimeout(15500);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.waitForTimeout(1500);
  await dialog().getByRole("button", { name: "Lançar 1" }).click();
  await dialog().getByText("1 lançamento não foi gravado:").waitFor();
  await dialog().getByText(/mudou depois da conferência\. Toque em Stripe de novo para conferir\./).waitFor();
  ok("a janela diz que o lançamento mudou e pede para conferir de novo");
  assert(psql(saleOf("Fra' Salvio", 6)) === "140.00|EUR|5|true", "o valor corrigido no outro aparelho continua lá");
  await fits("resultado com falha");
  await close();

  // ---------------------------------------------------------------
  section("Semana passada sem venda: a Stripe diz zero");
  const uid = psql("select user_id from public.countries limit 1");
  const italy = psql("select id from public.countries where name = 'Itália'");
  psql(`insert into public.avatars (user_id, country_id, name, status, position, product_currency, checkout_url) values ('${uid}', '${italy}', 'Suor Lucia', 'ativo', 1, 'EUR', 'https://buy.stripe.com/test_suorLucia02')`);
  psql(`insert into public.accounts (user_id, avatar_id, generation, handle, created_on, status) select '${uid}', id, 1, 'suor.lucia', current_date - 60, 'ativa' from public.avatars where name = 'Suor Lucia'`);
  await reload();
  await openStripe();
  await row("🇮🇹 Suor Lucia").getByText("buy.stripe.com/test_suorLucia02").waitFor();
  await search();
  await dialog().getByText("1 lançamento para atualizar.").waitFor();
  await dialog().getByRole("heading", { name: /^Semana passada/ }).waitFor();
  assert(/Nenhuma venda na Stripe: lança € 0,00\./.test(await textOf(row("🇮🇹 Suor Lucia"))), "avatar ligado, sem venda e sem lançamento na semana passada: o painel propõe lançar 0");
  await dialog().getByRole("button", { name: "Lançar 1" }).click();
  await toast("1 lançamento atualizado pela Stripe");
  await db(saleOf("Suor Lucia", 1), "0.00|EUR|0|false", "o zero fica lançado");
  await page.getByRole("link", { name: /^Hoje/ }).click();
  await page.getByRole("heading", { name: "Hoje", exact: true }).waitFor();
  assert(!(await page.locator("main").innerText()).includes("Vendas da semana passada sem lançamento"), "e o aviso de “semana passada sem lançamento” não aparece");

  // ---------------------------------------------------------------
  section("Vendas em mais de uma moeda na mesma semana");
  mock.state.sessions.push(paidSession(LUCIA, inWeek(0, 1), 2700, "eur"), paidSession(LUCIA, inWeek(0, 2), 2000, "usd"), paidSession(LUCIA, inWeek(0, 3), 2000, "usd"));
  await openSales();
  await openStripe();
  await search();
  await dialog().getByText("1 lançamento para atualizar.").waitFor();
  const mixed = await textOf(row("🇮🇹 Suor Lucia"));
  assert(/Novo: US\$ 40,00 · 2 vendas/.test(mixed) && /Ficou de fora: € 27,00 · 1 venda\./.test(mixed), "sem cotação, fica a moeda com mais vendas e a tela diz o que ficou de fora");
  assert(/digite a cotação de USD e EUR em Vendas → Cotações/.test(mixed), "e ensina a resolver");
  await fits("moedas misturadas");
  await dialog().getByRole("button", { name: "Lançar 1" }).click();
  await toast("1 lançamento atualizado pela Stripe");
  await db(saleOf("Suor Lucia", 0), "40.00|USD|2|false", "a parte em dólar é lançada");
  // buscar de novo: não há o que gravar, mas o painel não pode dizer "tudo em dia"
  await openStripe();
  await search();
  await dialog().getByText("Nenhum lançamento para atualizar.").waitFor();
  await dialog().getByText("Vendas que continuam de fora, por falta de cotação:").waitFor();
  assert(/Suor Lucia, semana de .*: € 27,00 · 1 venda/.test(await textOf(dialog())) && !(await textOf(dialog())).includes("Tudo em dia"), "os € 27 que não entraram continuam avisados a cada busca");
  await fits("vendas de fora");
  await close();
  psql(`update public.settings set brl_rates = '{"EUR": 6, "USD": 5}'::jsonb`);
  await reload();
  await openStripe();
  await search();
  await dialog().getByText("1 lançamento para atualizar.").waitFor();
  const converted = await textOf(row("🇮🇹 Suor Lucia"));
  assert(/No painel: US\$ 40,00 · 2 vendas → US\$ 72,40 · 3 vendas/.test(converted) && /somadas pelas cotações do painel/.test(converted), "com as cotações, as duas moedas viram um lançamento só (40 + 27 × 6 ÷ 5 = US$ 72,40)");
  await dialog().getByRole("button", { name: "Lançar 1" }).click();
  await toast("1 lançamento atualizado pela Stripe");
  await db(saleOf("Suor Lucia", 0, "s.amount || '|' || s.currency || '|' || s.sales_count || '|' || s.brl_rate::float"), "72.40|USD|3|5", "gravado em dólares, com a cotação usada na soma guardada no lançamento");

  // ---------------------------------------------------------------
  section("O mesmo link em dois avatares");
  psql(`update public.avatars set extra_links = '[{"id":"1","label":"Checkout do Fra","url":"https://buy.stripe.com/test_fraSalvio01"}]'::jsonb where name = 'Suor Lucia'`);
  await reload();
  await openStripe();
  await dialog().getByText(/O link buy\.stripe\.com\/test_fraSalvio01 está em mais de um avatar \(🇮🇹 Fra' Salvio, 🇮🇹 Suor Lucia\)/).waitFor();
  await dialog().getByText(/Sem link da Stripe: Fra' Salvio\./).waitFor();
  ok("o painel avisa e não usa o link (não há como dividir as vendas)");
  mock.requests.length = 0;
  await search();
  await dialog().getByText("Tudo em dia.").waitFor();
  assert(mock.requests.every((request) => request.query.payment_link !== FRA), "as vendas do link repetido nem são pedidas");
  await close();
  psql("update public.avatars set extra_links = '[]'::jsonb where name = 'Suor Lucia'");
  await reload();

  // ---------------------------------------------------------------
  section("Quando algo dá errado, a janela explica");
  mock.state.denySessions = true;
  await openStripe();
  await search();
  await dialog().getByText("A chave não tem permissão para ler as vendas").waitFor();
  const denied = await textOf(dialog());
  assert(/Checkout Sessions/.test(denied) && /Detalhe: The provided key 'rk_test_…'/.test(denied) && !denied.includes(KEY), "chave sem permissão: diz quais permissões marcar, com o detalhe da Stripe (sem a chave)");
  await fits("erro da Stripe");
  mock.state.denySessions = false;
  await dialog().getByRole("button", { name: "Tentar de novo" }).click();
  await dialog().getByRole("heading", { name: "Avatares ligados" }).waitFor();
  ok("“Tentar de novo” volta a funcionar quando o problema passa");
  await close();

  await mock.close();
  await openStripe();
  await dialog().getByText("A Stripe não respondeu", { exact: true }).waitFor();
  assert(!(await textOf(dialog())).includes("Detalhe:"), "(sem detalhe técnico: não há o que acrescentar)");
  ok("Stripe fora do ar: a janela diz e oferece tentar de novo");
  mock = await startStripeMock();
  mock.state.links = [{ id: FRA, url: "https://buy.stripe.com/test_fraSalvio01", active: true }];
  await dialog().getByRole("button", { name: "Tentar de novo" }).click();
  await dialog().getByRole("heading", { name: "Avatares ligados" }).waitFor();
  await close();

  // a Stripe recusa os filtros (como uma versão antiga da API): o servidor filtra por conta própria
  mock.state.rejectFilters = true;
  mock.state.sessions = [paidSession(FRA, inWeek(0, 1), 2700), paidSession(FRA, inWeek(0, 2), 2700, "eur", { status: "expired", payment_status: "unpaid" }), paidSession(FRA, inWeek(9, 1), 2700)];
  await openStripe();
  await search();
  await dialog().getByText("1 lançamento para atualizar.").waitFor();
  assert(/No painel: € 101,00 · 3 vendas → € 27,00 · 1 venda/.test(await textOf(row("🇮🇹 Fra' Salvio"))), "sem os filtros da Stripe o resultado é o mesmo: só as pagas, só do período");
  mock.state.rejectFilters = false;
  await close();

  // ---------------------------------------------------------------
  section("Passo a passo para ligar (quando a chave ainda não está na Vercel)");
  const answer = (body) => (request) => request.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  await page.route("**/api/stripe/links", answer({ ok: false, error: "not_configured", problem: "missing" }));
  await openStripe();
  await dialog().getByText("Falta ligar o painel à sua conta Stripe.").waitFor();
  const steps = await dialog().locator("ol > li").allInnerTexts();
  assert(
    steps.length === 5 && /Criar chave restrita/.test(steps[0]) && /Checkout Sessions/.test(steps[1]) && /Payment Links/.test(steps[1]) && /STRIPE_SECRET_KEY/.test(steps[2]) && /Redeploy/.test(steps[3]),
    "cinco passos: criar a chave restrita (só leitura de Checkout Sessions e Payment Links), guardar na Vercel, publicar de novo, tentar de novo",
  );
  await dialog().getByRole("button", { name: "Copiar nome" }).click();
  assert((await clipboard()) === "STRIPE_SECRET_KEY", "o nome da variável é copiado certinho");
  await dialog().getByText(/Ela só permite ler vendas e links de pagamento/).waitFor();
  await fits("passo a passo");
  await shot("h30-stripe-passo-a-passo");
  await page.setViewportSize({ width: 360, height: 740 });
  await fits("passo a passo, 360 px");
  await page.setViewportSize({ width: 390, height: 844 });
  await close();
  await page.unroute("**/api/stripe/links");

  await page.route("**/api/stripe/links", answer({ ok: false, error: "not_configured", problem: "publishable" }));
  await openStripe();
  await dialog().getByText(/está com a chave publicável \(começa com pk_\)/).waitFor();
  ok("chave errada (a publicável) na variável: a janela diz qual é a certa");
  await close();
  await page.unroute("**/api/stripe/links");

  await page.route("**/api/stripe/links", answer({ ok: false, error: "signup_open" }));
  await openStripe();
  await dialog().getByText("O cadastro público do Supabase está ligado").waitFor();
  await dialog().getByText(/Allow new users to sign up/).waitFor();
  ok("cadastro público ligado no Supabase: o painel se recusa a usar a chave e ensina a desligar");
  await close();
  await page.unroute("**/api/stripe/links");

  await page.route("**/api/stripe/links", answer({ ok: true, live: true, restricted: false, next: null, links: [] }));
  await openStripe();
  await dialog().getByText(/é a chave secreta completa \(começa com sk_\)/).waitFor();
  ok("chave secreta completa em vez da restrita: funciona, mas a janela recomenda trocar");
  await close();
  await page.unroute("**/api/stripe/links");

  // também em Configurações
  await more("Configurações");
  await page.getByRole("heading", { name: "Vendas pela Stripe" }).waitFor();
  await page.getByRole("button", { name: "Ligar ou testar a Stripe" }).click();
  await dialog().getByRole("heading", { name: "Avatares ligados" }).waitFor();
  ok("Configurações → Vendas pela Stripe abre a mesma janela");
  await overflow("Configurações");
  await close();

  // ---------------------------------------------------------------
  section("Um servidor sem a chave (ou com a chave errada) explica o que falta");
  if (BASE.includes(":3000") && existsSync(join(root, ".next", "BUILD_ID"))) {
    const cases = [
      [{ STRIPE_SECRET_KEY: "" }, "sem a chave", (r) => r.status === 200 && r.json?.error === "not_configured" && r.json.problem === "missing"],
      [{ STRIPE_SECRET_KEY: "pk_live_chavepublicavel" }, "com a chave publicável no lugar", (r) => r.status === 200 && r.json?.problem === "publishable"],
      [{ STRIPE_SECRET_KEY: "qualquer coisa" }, "com um valor que não é chave", (r) => r.status === 200 && r.json?.problem === "format"],
      // a Stripe reservada a um e-mail: outro usuário do projeto (aqui, o de teste) não passa…
      [{ STRIPE_OWNER_EMAIL: "outra@pessoa.com" }, "reservado a outro e-mail (STRIPE_OWNER_EMAIL)", (r) => r.status === 403 && r.json?.error === "forbidden"],
      // …e o dono passa (maiúsculas e espaços não atrapalham)
      [{ STRIPE_OWNER_EMAIL: ` ${USER.email.toUpperCase()} ` }, "reservado ao e-mail de quem está logado", (r) => r.status === 200 && r.json?.ok === true && r.json.restricted === true],
    ];
    for (const [extra, label, expected] of cases) {
      const server = spawn(process.execPath, [join(root, "node_modules", "next", "dist", "bin", "next"), "start", "-p", "3055"], {
        cwd: root,
        env: { ...process.env, ...extra },
        stdio: "ignore",
      });
      try {
        let up = false;
        for (let i = 0; i < 60 && !up; i++) {
          await new Promise((resolve) => setTimeout(resolve, 250));
          up = await fetch("http://localhost:3055/login").then((response) => response.ok, () => false);
        }
        assert(up, `(servidor de teste no ar, ${label})`);
        const answered = await route("http://localhost:3055", "/api/stripe/links", { token });
        assert(expected(answered), `servidor ${label}: a rota responde ${answered.status} ${answered.text.slice(0, 80)}`);
        assert((await route("http://localhost:3055", "/api/stripe/links")).status === 401, "(e, sem login, só o 401)");
      } finally {
        server.kill();
        await new Promise((resolve) => server.once("exit", resolve));
      }
    }
  } else {
    ok("(só com a versão de produção em :3000 — pulado)");
  }

  // ---------------------------------------------------------------
  section("Por fim: a chave nunca passou pelo navegador");
  assert(answers.length > 10 && answers.every((text) => !text.includes(KEY) && !text.includes("Cliente Secreto")), `nenhuma das ${answers.length} respostas das rotas trouxe a chave ou dados de cliente`);
  const stored = await page.evaluate(() => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }) + document.documentElement.innerHTML);
  assert(!stored.includes(KEY), "nem ficou guardada no aparelho ou na página");

  await mock.close();
  resetData();
  await finish(session);
})().catch(fail);
