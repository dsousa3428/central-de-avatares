// Teste de ponta a ponta da ETAPA (d): vendas semanais.
//
//   node dev/e2e/etapa-d.cjs      (com o app rodando em http://localhost:3000)
const { chromium } = require("playwright");
const { BASE, psql, resetData, ok, section, assert, openPhone, finish, fail } = require("./helpers.cjs");

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

// A segunda-feira desta semana e das anteriores, como o banco vê (o teste roda em UTC).
const monday = (weeksAgo = 0) => `(date_trunc('week', current_date)::date - ${7 * weeksAgo})`;
const saleOf = (avatar, weeksAgo, column) =>
  `select coalesce(${column}::text, '') from public.weekly_sales s join public.avatars a on a.id = s.avatar_id where a.name = '${avatar.replace(/'/g, "''")}' and s.week_start = ${monday(weeksAgo)}`;
// O mês "em andamento" é o da semana atual; e o mês de uma semana é o da quinta-feira dela.
const now = new Date();
const thursday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - ((now.getUTCDay() + 6) % 7) + 3));
const monthOnly = new Intl.DateTimeFormat("pt-BR", { month: "long", timeZone: "UTC" }).format(thursday);
const month = thursday.getUTCFullYear() === now.getUTCFullYear() ? monthOnly : `${monthOnly} de ${thursday.getUTCFullYear()}`;
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

(async () => {
  resetData();
  const session = await openPhone(chromium, { timezoneId: "UTC" });
  const { page, dialog, shot, toast, save, noDialog, overflow, clipboard, more } = session;
  await session.login();

  const field = (label) => dialog().getByLabel(label, { exact: true });
  // o campo da cotação de uma moeda, na janela "Cotações para reais"
  const rate = (code) => dialog().getByLabel(new RegExp(`^1 ${code}`));
  const amountOf = (avatar) => page.getByLabel(`Vendas de ${avatar} na semana`);
  const openSales = async () => {
    await page.getByRole("link", { name: "Vendas" }).click();
    await page.getByRole("heading", { name: "Vendas", exact: true }).waitFor();
  };
  const tile = (label) => page.locator("li", { has: page.getByText(label, { exact: true }) }).first();

  // ---------------------------------------------------------------
  section("Exemplos: o avatar de exemplo já vem com vendas");
  assert(psql("select count(*)::text || '|' || sum(amount)::text || '|' || sum(sales_count)::text from public.weekly_sales where is_example") === "8|1431.00|53", "8 semanas de vendas de exemplo (53 vendas, € 1.431)");
  assert(psql(`select count(*) from public.weekly_sales where week_start >= ${monday(0)}`) === "0", "a semana atual fica livre para o primeiro lançamento de verdade");
  assert(psql("select count(*) from public.weekly_sales where account_id is null") === "0", "cada semana de exemplo está ligada à conta que estava no ar");
  // quem já usava o painel antes desta etapa ganha as vendas de exemplo na próxima abertura
  psql("delete from public.weekly_sales; update public.settings set prefs = jsonb_set(prefs, '{examples_version}', '2')");
  await page.reload();
  await page.getByRole("heading", { name: "Hoje", exact: true }).waitFor({ timeout: 30000 });
  await db("select count(*)::text || '|' || (select prefs->>'examples_version' from public.settings) from public.weekly_sales where is_example", "8|5", "exemplos de uma versão anterior são completados com as vendas");

  await openSales();
  await page.getByRole("heading", { name: "Lançar vendas" }).waitFor();
  await tile("Últimas 12 semanas").getByText("€ 1.431,00").waitFor();
  await tile("Últimas 12 semanas").getByText("53 vendas").waitFor();
  ok("a tela Vendas soma as 12 últimas semanas (€ 1.431,00, 53 vendas)");
  await tile("Esta semana").getByText("nenhum lançamento").waitFor();
  assert(!(await page.locator("main").innerText()).includes("100%"), "semana ainda sem lançamento diz “nenhum lançamento” (e não “−100%”)");
  await overflow("Vendas");
  await shot("d10-vendas");

  // ---------------------------------------------------------------
  section("Lançamento rápido: digitar o valor e apertar Enter");
  await page.getByText("Esta semana", { exact: true }).first().waitFor();
  assert(await page.getByRole("button", { name: "Próxima semana" }).isDisabled(), "não dá para avançar além da semana atual");
  await amountOf("Fra' Salvio").fill("321,50");
  await page.keyboard.press("Enter");
  await db(saleOf("Fra' Salvio", 0, "amount"), "321.50", "“321,50” + Enter lança a venda da semana");
  assert(
    psql(saleOf("Fra' Salvio", 0, "s.currency || '|' || s.is_example::text || '|' || (select generation from public.accounts where id = s.account_id)")) === "EUR|false|2",
    "na moeda do avatar (EUR), como dado seu, ligada à conta atual (2ª geração)",
  );
  await page.getByText("Todos lançados").waitFor();
  await tile("Esta semana").getByText("€ 321,50").waitFor();
  ok("o total da semana aparece na hora");
  // corrigir: digitar outro valor e sair do campo
  await amountOf("Fra' Salvio").fill("400");
  await page.getByRole("heading", { name: "Lançar vendas" }).click();
  await db(saleOf("Fra' Salvio", 0, "amount"), "400.00", "digitar outro valor e sair do campo corrige o lançamento");
  assert(psql(`select count(*) from public.weekly_sales where week_start = ${monday(0)}`) === "1", "continua sendo um lançamento só por semana");
  await amountOf("Fra' Salvio").fill("abc");
  await page.keyboard.press("Enter");
  await toast("Não entendi o valor");
  await amountOf("Fra' Salvio").fill("");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(400);
  assert((await amountOf("Fra' Salvio").inputValue()) === "400,00" && psql(saleOf("Fra' Salvio", 0, "amount")) === "400.00", "valor inválido ou campo vazio não mexem no que está lançado");

  // o campo comporta um valor de cinco dígitos inteiro (o símbolo da moeda fica ao lado, não por cima)
  await amountOf("Fra' Salvio").fill("12.345,67");
  assert(await amountOf("Fra' Salvio").evaluate((input) => input.scrollWidth <= input.clientWidth), "“12.345,67” cabe inteiro no campo");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  assert((await amountOf("Fra' Salvio").inputValue()) === "400,00" && psql(saleOf("Fra' Salvio", 0, "amount")) === "400.00", "Esc desiste do que foi digitado");

  // semana anterior: um lançamento de exemplo que você corrige passa a ser seu
  await page.getByRole("button", { name: "Semana anterior" }).click();
  await page.getByText("Semana passada", { exact: true }).waitFor();
  assert((await amountOf("Fra' Salvio").inputValue()) === "216,00", "a semana passada mostra o valor de exemplo (8 × € 27)");
  await amountOf("Fra' Salvio").fill("250,00");
  await page.keyboard.press("Enter");
  await db(saleOf("Fra' Salvio", 1, "s.amount || '|' || s.is_example"), "250.00|false", "corrigir um lançamento de exemplo faz dele um dado seu");
  await page.getByRole("button", { name: "Próxima semana" }).click();
  await page.getByText("Esta semana", { exact: true }).first().waitFor();

  // ---------------------------------------------------------------
  section("Detalhes do lançamento: quantidade, conta e observação");
  await page.getByRole("button", { name: "Detalhes da venda de Fra' Salvio" }).click();
  await dialog().getByText("Venda da semana").waitFor();
  assert((await field("Valor vendido na semana").inputValue()) === "400,00", "abre com o valor lançado");
  await field("Valor vendido na semana").fill("");
  await save();
  await dialog().getByRole("alert").filter({ hasText: "Informe o valor vendido" }).waitFor();
  await field("Valor vendido na semana").fill("400");
  await field("Quantidade de vendas").fill("doze");
  await save();
  await dialog().getByRole("alert").filter({ hasText: "Não entendi a quantidade" }).waitFor();
  ok("valor vazio e quantidade inválida são recusados");
  await field("Quantidade de vendas").fill("12");
  await field("Observação").fill("Promoção de fim de semana");
  await field("Conta que estava no ar").selectOption({ label: "@fra.salvio · 1ª geração" });
  await shot("d11-detalhes");
  await save();
  await toast("Venda atualizada");
  await noDialog();
  await db(
    saleOf("Fra' Salvio", 0, "s.sales_count || '|' || s.notes || '|' || (select generation from public.accounts where id = s.account_id)"),
    "12|Promoção de fim de semana|1",
    "quantidade, observação e conta gravadas",
  );
  // apagar um lançamento (o de duas semanas atrás)
  await page.getByRole("button", { name: "Semana anterior" }).click();
  await page.getByRole("button", { name: "Semana anterior" }).click();
  await page.getByText("Há 2 semanas", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Detalhes da venda de Fra' Salvio" }).click();
  await dialog().getByRole("button", { name: "Apagar", exact: true }).click();
  await dialog().getByText("Apagar este lançamento?").waitFor();
  await dialog().getByRole("button", { name: "Apagar", exact: true }).click();
  await toast("Lançamento apagado");
  await noDialog();
  await db(`select count(*) from public.weekly_sales where week_start = ${monday(2)}`, "0", "o lançamento é apagado");
  await page.getByText("sem lançamento").waitFor();
  await page.getByRole("button", { name: "Próxima semana" }).click();
  await page.getByRole("button", { name: "Próxima semana" }).click();

  // ---------------------------------------------------------------
  section("Cotações: somar em reais");
  await page.getByRole("button", { name: /digite a cotação de EUR/ }).click();
  await dialog().getByText("Cotações para reais").waitFor();
  await rate("EUR").fill("abc");
  await save();
  await dialog().getByRole("alert").filter({ hasText: "Não entendi a cotação de EUR" }).waitFor();
  await rate("EUR").fill("6,10");
  await dialog().getByText("100 EUR = R$ 610,00").waitFor();
  await shot("d12-cotacoes");
  await save();
  await toast("Cotações salvas");
  await noDialog();
  await db("select brl_rates::text from public.settings", '{"EUR": 6.1}', "a cotação digitada fica salva");
  await db(
    "select count(*)::text || '|' || count(*) filter (where brl_rate = 6.1)::text from public.weekly_sales where currency = 'EUR'",
    `${psql("select count(*) from public.weekly_sales where currency = 'EUR'")}|${psql("select count(*) from public.weekly_sales where currency = 'EUR'")}`,
    "as vendas lançadas antes de existir cotação ficam com a primeira digitada (6,10)",
  );
  await tile("Esta semana").getByText("≈ R$ 2.440,00").waitFor();
  ok("os totais passam a mostrar o equivalente em reais (€ 400 × 6,10 = R$ 2.440,00)");

  // um segundo avatar, em outra moeda
  const uid = psql("select user_id from public.countries limit 1");
  psql(`insert into public.countries (user_id, name, flag, language, currency, timezone, position) values ('${uid}', 'Estados Unidos', '🇺🇸', 'Inglês', 'USD', 'America/New_York', 1)`);
  psql(`insert into public.avatars (user_id, country_id, name, product_currency) select '${uid}', id, 'Grandpa Joe', 'USD' from public.countries where name = 'Estados Unidos'`);
  await page.reload();
  await page.getByRole("heading", { name: "Lançar vendas" }).waitFor({ timeout: 30000 });
  await amountOf("Grandpa Joe").fill("100");
  await page.keyboard.press("Enter");
  await db(saleOf("Grandpa Joe", 0, "amount || '|' || currency || '|' || coalesce(brl_rate::text, 'sem')"), "100.00|USD|sem", "o avatar americano lança em dólares (ainda sem cotação)");
  await page.getByText(/Falta a cotação de USD para somar tudo em reais/).waitFor();
  ok("com duas moedas e uma sem cotação, a tela avisa que essas vendas ficam fora do gráfico e do ranking");
  await page.getByRole("button", { name: "Digitar cotação" }).click();
  await rate("USD").fill("5");
  await save();
  await toast("Cotações salvas");
  await noDialog();
  await page.waitForFunction(() => !document.body.innerText.includes("Falta a cotação"));
  await tile("Esta semana").getByText("R$ 2.940,00").waitFor();
  await tile("Esta semana").getByText("€ 400,00 + US$ 100,00").waitFor();
  ok("com as duas cotações, a semana soma R$ 2.940,00 (€ 400,00 + US$ 100,00)");
  await db(saleOf("Grandpa Joe", 0, "brl_rate"), "5.000000", "a venda em dólares lançada sem cotação fica com a primeira digitada (5,00)");
  // um lançamento novo guarda a cotação do dia; mudar a cotação depois não mexe nele
  await page.getByRole("button", { name: "Semana anterior" }).click();
  await amountOf("Grandpa Joe").fill("50");
  await page.keyboard.press("Enter");
  await db(saleOf("Grandpa Joe", 1, "amount || '|' || brl_rate"), "50.00|5.000000", "o lançamento novo guarda a cotação em vigor (5,00)");
  await page.getByRole("button", { name: "Próxima semana" }).click();
  await page.getByRole("button", { name: "Cotações" }).click();
  assert((await rate("USD").inputValue()) === "5,00" && (await rate("EUR").inputValue()) === "6,10", "a janela abre com as cotações salvas (5,00 e 6,10)");
  // numa cotação, um ponto sozinho é a vírgula decimal: "5.432" são R$ 5,432 — nunca cinco mil
  await rate("USD").fill("5.432");
  await dialog().getByText("100 USD = R$ 543,20").waitFor();
  ok("“5.432” é lido como 5,432 (100 USD = R$ 543,20)");
  await rate("USD").fill("6");
  await save();
  await toast("Cotações salvas");
  await noDialog();
  await db("select brl_rates->>'USD' from public.settings", "6", "(cotação do dólar atualizada para 6,00)");
  await page.waitForTimeout(500);
  // atualizar a cotação não mexe no que já foi lançado: 400 × 6,10 + 100 × 5,00 continua R$ 2.940,00
  await tile("Esta semana").getByText("R$ 2.940,00").waitFor();
  assert(psql(saleOf("Grandpa Joe", 0, "brl_rate")) === "5.000000", "atualizar a cotação não muda as vendas já lançadas");

  // a cotação de uma venda só se corrige nos detalhes dela
  await page.getByRole("button", { name: "Detalhes da venda de Grandpa Joe" }).click();
  const saleRate = field("Cotação: 1 USD em reais");
  assert((await saleRate.inputValue()) === "5,00", "os detalhes mostram a cotação guardada na venda (5,00)");
  await dialog().getByText("≈ R$ 500,00 nesta semana").waitFor();
  await saleRate.fill("seis");
  await save();
  await dialog().getByRole("alert").filter({ hasText: "Não entendi a cotação" }).waitFor();
  await saleRate.fill("6");
  await dialog().getByText("≈ R$ 600,00 nesta semana").waitFor();
  await shot("d12b-cotacao-da-venda");
  await save();
  await toast("Venda atualizada");
  await noDialog();
  await db(saleOf("Grandpa Joe", 0, "brl_rate"), "6.000000", "a cotação digitada nos detalhes fica guardada na venda");
  // 400 × 6,10 + 100 × 6,00 = 3.040
  await tile("Esta semana").getByText("R$ 3.040,00").waitFor();
  ok("o total da semana acompanha (R$ 3.040,00)");

  // ---------------------------------------------------------------
  section("Gráfico por semana, tabela e filtros");
  const chart = page.getByRole("figure", { name: "Vendas por semana" });
  const bars = chart.getByRole("button", { name: /^Semana de / });
  assert((await bars.count()) === 12, "uma coluna por semana (12 semanas)");
  assert(/: R\$\s3\.040,00$/.test(await bars.last().getAttribute("aria-label")), "a última coluna é a semana atual, em reais");
  // semana passada: € 250 × 6,10 + US$ 50 × 5,00 (cotação guardada) = R$ 1.775,00
  assert(/: R\$\s1\.775,00$/.test(await bars.nth(10).getAttribute("aria-label")), "a semana passada usa a cotação guardada no lançamento (R$ 1.775,00)");
  await chart.getByText("R$ 3.040,00").waitFor();
  await bars.nth(10).click();
  await chart.getByText("R$ 1.775,00").waitFor();
  await chart.getByText(/Semana passada/).waitFor();
  ok("tocar numa coluna mostra o valor e a semana dela");
  // com o dedo: a coluna escolhida é a que está debaixo dele, e arrastar de lado percorre as semanas
  const touch = (type, column, y = 0.5) =>
    bars.first().evaluate(
      (button, [type, column, y]) => {
        const plot = button.parentElement.parentElement;
        const box = plot.getBoundingClientRect();
        const target = type === "pointerdown" ? button : plot;
        target.dispatchEvent(
          new PointerEvent(type, {
            bubbles: true,
            pointerType: "touch",
            pointerId: 7,
            clientX: box.left + ((column + 0.5) / 12) * box.width,
            clientY: box.top + y * box.height,
          }),
        );
      },
      [type, column, y],
    );
  await touch("pointerdown", 3);
  await chart.getByText(/Há 8 semanas/).waitFor();
  await touch("pointermove", 6);
  await chart.getByText(/Há 5 semanas/).waitFor();
  await touch("pointermove", 11);
  await chart.getByText(/Esta semana/).waitFor();
  await touch("pointermove", 10);
  await touch("pointerup", 10);
  await chart.getByText(/Semana passada/).waitFor();
  ok("arrastar o dedo sobre o gráfico percorre as semanas, e a escolhida fica ao soltar");
  await page.getByRole("heading", { name: "Vendas por semana" }).click();
  await chart.getByText(/Esta semana/).waitFor();
  ok("um toque fora do gráfico volta para a semana mais recente");
  const heights = await bars.evaluateAll((list) => list.map((button) => Math.round(button.firstElementChild.getBoundingClientRect().height)));
  assert(heights[11] === Math.max(...heights) && heights[9] === 0, "a altura das colunas acompanha o valor (a semana apagada fica vazia)");
  await shot("d13-grafico");
  await chart.getByRole("button", { name: "Ver tabela" }).click();
  assert((await chart.getByRole("row").count()) === 13, "“Ver tabela” lista as mesmas 12 semanas");
  await chart.getByRole("row").nth(1).getByText("R$ 3.040,00").waitFor();
  await chart.getByRole("button", { name: "Ver gráfico" }).click();
  await bars.first().waitFor();

  await page.getByLabel("País", { exact: true }).selectOption({ label: "🇮🇹 Itália" });
  await tile("Esta semana").getByText("€ 400,00").waitFor();
  assert(/: €\s400,00$/.test(await bars.last().getAttribute("aria-label")), "filtrando por país com uma moeda só, tudo aparece nessa moeda");
  assert((await page.getByRole("list", { name: "Ranking de avatares por vendas" }).getByRole("listitem").count()) === 1, "o ranking mostra só os avatares do país");
  await page.getByLabel("País", { exact: true }).selectOption("");
  await page.getByLabel("Período").selectOption("all");
  await tile("Desde o início").getByText("vendas").waitFor();
  assert((await bars.count()) === 12, "“Desde o início” mostra pelo menos 12 semanas");
  await page.getByLabel("Período").selectOption("12");

  // ---------------------------------------------------------------
  section("Ranking de avatares e totais por país");
  const ranking = page.getByRole("list", { name: "Ranking de avatares por vendas" }).getByRole("listitem");
  assert((await ranking.count()) === 2, "o ranking tem os dois avatares");
  assert((await ranking.nth(0).innerText()).includes("Fra' Salvio") && (await ranking.nth(1).innerText()).includes("Grandpa Joe"), "do que mais vendeu para o que menos vendeu");
  const countries = page.getByRole("list", { name: "Vendas por país" }).getByRole("listitem");
  assert((await countries.nth(0).innerText()).includes("Itália") && (await countries.nth(1).innerText()).includes("Estados Unidos"), "os países também, na mesma ordem");
  // Grandpa Joe: US$ 100 (cotação atual 6) + US$ 50 (cotação guardada 5) = R$ 850
  await ranking.nth(1).getByText("US$ 150,00").waitFor();
  await ranking.nth(1).getByText("≈ R$ 850,00").waitFor();
  ok("cada avatar aparece na moeda dele, com o equivalente em reais");
  await overflow("Vendas (com dois avatares)");
  await shot("d14-ranking");

  // ---------------------------------------------------------------
  section("Página do avatar: aba Vendas");
  await ranking.nth(0).getByRole("link", { name: /Fra' Salvio/ }).click();
  await page.getByRole("heading", { name: "Fra' Salvio" }).waitFor();
  await page.getByRole("heading", { name: "Lançamentos por semana" }).waitFor();
  ok("o nome no ranking abre a aba Vendas do avatar");
  const total = psql("select sum(amount)::text from public.weekly_sales s join public.avatars a on a.id = s.avatar_id where a.name = 'Fra'' Salvio'");
  const totalText = "€ " + Number(total).toLocaleString("pt-BR", { minimumFractionDigits: 2 });
  await page.getByText(totalText, { exact: true }).first().waitFor();
  ok(`total somando todas as contas (${totalText})`);
  // (Nos exemplos, a 2ª geração nasce 4 dias antes de hoje: só de segunda a quinta isso cai na semana passada e
  //  alguma venda fica ligada a ela. Para a conferência valer em qualquer dia da semana, uma venda antiga é
  //  ligada à 2ª geração aqui.)
  psql(`update public.weekly_sales set account_id = (select id from public.accounts where generation = 2) where week_start = ${monday(3)}`);
  await page.reload();
  await page.getByRole("heading", { name: "Lançamentos por semana" }).waitFor({ timeout: 30000 });
  await page.getByText("1ª geração").first().waitFor();
  await page.getByText("2ª geração").first().waitFor();
  ok("cada lançamento mostra a conta (geração) que estava no ar");
  const before = psql("select count(*) from public.weekly_sales");
  await page.getByRole("button", { name: "Lançar venda" }).click();
  await dialog().getByRole("button", { name: "Semana anterior" }).click();
  await dialog().getByRole("button", { name: "Semana anterior" }).click();
  await dialog().getByText("Há 2 semanas", { exact: true }).waitFor();
  assert((await field("Valor vendido na semana").inputValue()) === "", "a semana apagada abre em branco");
  await field("Valor vendido na semana").fill("1.234,56");
  await dialog().getByText("≈ R$ 7.530,82").waitFor();
  await save();
  await toast("Venda lançada");
  await noDialog();
  await db(saleOf("Fra' Salvio", 2, "amount || '|' || brl_rate"), "1234.56|6.100000", "lançar pela página do avatar, escolhendo a semana (com a cotação do dia guardada)");
  assert(psql("select count(*) from public.weekly_sales") === String(Number(before) + 1), "um lançamento a mais");
  await page.getByRole("button", { name: /Corrigir a venda da semana/ }).first().click();
  await dialog().getByText("Venda da semana").waitFor();
  assert((await field("Valor vendido na semana").inputValue()) === "400,00", "tocar num lançamento abre para corrigir");
  await dialog().getByRole("button", { name: "Cancelar" }).click();
  await noDialog();
  // quem digitou na semana errada só troca a semana: o que foi digitado vai junto
  await page.getByRole("button", { name: "Lançar venda" }).click();
  for (let i = 0; i < 9; i++) await dialog().getByRole("button", { name: "Semana anterior" }).click();
  await dialog().getByText("Há 9 semanas", { exact: true }).waitFor();
  await field("Valor vendido na semana").fill("77");
  await field("Observação").fill("semana errada");
  await dialog().getByRole("button", { name: "Semana anterior" }).click();
  await dialog().getByText("Há 10 semanas", { exact: true }).waitFor();
  assert(
    (await field("Valor vendido na semana").inputValue()) === "77" && (await field("Observação").inputValue()) === "semana errada",
    "trocar para outra semana em branco mantém o que foi digitado",
  );
  await dialog().getByRole("button", { name: "Próxima semana" }).click();
  await dialog().getByRole("button", { name: "Próxima semana" }).click();
  await dialog().getByText("Há 8 semanas", { exact: true }).waitFor();
  assert((await field("Valor vendido na semana").inputValue()) === "108,00", "numa semana já lançada, a janela mostra o que está lançado nela");
  await dialog().getByRole("button", { name: "Semana anterior" }).click();
  await dialog().getByText("Há 9 semanas", { exact: true }).waitFor();
  assert((await field("Valor vendido na semana").inputValue()) === "77", "e, voltando para a semana em branco, o que foi digitado continua lá");
  await dialog().getByRole("button", { name: "Cancelar" }).click();
  await noDialog();
  assert(psql(`select count(*) from public.weekly_sales where week_start <= ${monday(9)}`) === "0", "(cancelar não lança nada)");
  await overflow("aba Vendas do avatar");
  await shot("d15-avatar-vendas");

  // ---------------------------------------------------------------
  section("Países: vendas do mês no cartão do avatar");
  await page.getByRole("link", { name: "Países" }).click();
  await page.getByRole("heading", { name: "Países", exact: true }).waitFor();
  const monthTotal = psql(
    "select sum(amount)::text from public.weekly_sales s join public.avatars a on a.id = s.avatar_id where a.name = 'Fra'' Salvio' and to_char(s.week_start + 3, 'YYYY-MM') = to_char(date_trunc('week', current_date)::date + 3, 'YYYY-MM')",
  );
  const card = page.getByRole("link", { name: /Fra' Salvio/ });
  await card.getByText(`Vendas em ${month}`).waitFor();
  await card.getByText("€ " + Number(monthTotal).toLocaleString("pt-BR", { minimumFractionDigits: 2 }), { exact: true }).waitFor();
  ok(`o cartão mostra “Vendas em ${month}” com o total do mês`);

  // ---------------------------------------------------------------
  section("Planilha: tabela de vendas");
  await page.getByRole("link", { name: "Planilha" }).click();
  await page.getByRole("heading", { name: "Planilha" }).waitFor();
  await page.getByRole("tab", { name: /^Vendas/ }).click();
  await page.getByRole("table").waitFor();
  const count = psql("select count(*) from public.weekly_sales");
  assert(String(await page.locator("tbody tr").count()) === count, `uma linha por lançamento (${count})`);
  const header = await page.evaluate(() => [...document.querySelectorAll("thead th")].map((th) => th.innerText.trim()));
  const valor = header.indexOf("Valor");
  assert(header.join("|").startsWith("Avatar|País|Semana|Valor|Moeda|Qtd. de vendas|Em reais|Conta na semana|Observação"), "colunas da tabela de vendas");
  const first = page.locator("tbody tr").first();
  await first.locator("td").nth(valor).getByRole("button").click();
  await first.getByLabel("Valor").fill("410,10");
  await page.keyboard.press("Enter");
  // (a primeira linha é a semana mais recente; em empate, por nome do avatar: Fra' Salvio)
  await db(saleOf("Fra' Salvio", 0, "amount"), "410.10", "editar o valor direto na célula");
  await page.getByRole("button", { name: "Copiar", exact: true }).click();
  await toast(`${count} linhas copiadas`);
  const copied = (await clipboard()).split("\n").map((line) => line.split("\t"));
  assert(copied[0][valor] === "Valor" && copied[1][valor] === "410,10" && copied[1][header.indexOf("Em reais")] === "2501,61", "copiar leva os valores como números (410,10 e 2501,61)");
  // corrigir qualquer campo de um lançamento de exemplo faz dele um dado seu (também pela planilha)
  const exampleRow = page.locator("tbody tr").nth(5); // Fra' Salvio, há 3 semanas (ainda de exemplo)
  assert(psql(saleOf("Fra' Salvio", 3, "s.sales_count || '|' || s.is_example")) === "11|true", "(a linha de 3 semanas atrás é um exemplo com 11 vendas)");
  await exampleRow.locator("td").nth(header.indexOf("Qtd. de vendas")).getByRole("button").click();
  await exampleRow.getByLabel("Qtd. de vendas").fill("10");
  await page.keyboard.press("Enter");
  await db(saleOf("Fra' Salvio", 3, "s.sales_count || '|' || s.is_example"), "10|false", "corrigir a quantidade de um exemplo na planilha faz dele um dado seu");
  await page.getByLabel("Filtrar por país").selectOption({ label: "Estados Unidos" });
  assert((await page.locator("tbody tr").count()) === 2, "filtro por país");

  // ---------------------------------------------------------------
  section("Dois aparelhos lançando a mesma semana");
  await page.getByLabel("Filtrar por país").selectOption("");
  await openSales();
  for (let i = 0; i < 3; i++) await page.getByRole("button", { name: "Semana anterior" }).click();
  await page.getByText("Há 3 semanas", { exact: true }).waitFor();
  assert((await amountOf("Grandpa Joe").inputValue()) === "", "(o avatar americano não tem lançamento há 3 semanas)");
  // "outro aparelho" lança essa mesma semana enquanto esta tela está aberta
  psql(`insert into public.weekly_sales (user_id, avatar_id, week_start, amount, currency) select '${uid}', id, ${monday(3)}, 77, 'USD' from public.avatars where name = 'Grandpa Joe'`);
  await amountOf("Grandpa Joe").fill("999");
  await page.keyboard.press("Enter");
  await toast("já tem um lançamento nesta semana");
  await db(saleOf("Grandpa Joe", 3, "amount"), "77.00", "o lançamento do outro aparelho não é atropelado");
  await page.waitForFunction(() => [...document.querySelectorAll("input")].some((input) => input.value === "77,00"), null, { timeout: 10000 });
  ok("a tela se atualiza e mostra o valor que já estava lançado");

  // ---------------------------------------------------------------
  section("Digitando rápido: valor, Enter, valor, Enter");
  for (let i = 0; i < 6; i++) await page.getByRole("button", { name: "Semana anterior" }).click();
  await page.getByText("Há 9 semanas", { exact: true }).waitFor();
  assert((await amountOf("Fra' Salvio").inputValue()) === "" && (await amountOf("Grandpa Joe").inputValue()) === "", "(há 9 semanas, nenhum dos dois avatares tem lançamento)");
  // (espera sumir o aviso do teste anterior, para conferir que este trecho não gera aviso nenhum)
  await page.waitForFunction(() => !document.querySelector(".cda-toast"), null, { timeout: 15000 });
  // as gravações demoram meio segundo: quem digita rápido não espera por elas
  const slow = async (route) => {
    if (["POST", "PATCH"].includes(route.request().method())) await pause(500);
    await route.continue();
  };
  await page.route("**/rest/v1/weekly_sales*", slow);
  await amountOf("Fra' Salvio").click();
  await page.keyboard.type("111");
  await page.keyboard.press("Enter");
  await page.keyboard.type("222");
  await page.keyboard.press("Enter");
  await db(saleOf("Fra' Salvio", 9, "amount"), "111.00", "o primeiro valor vai para o primeiro avatar");
  await db(saleOf("Grandpa Joe", 9, "amount"), "222.00", "e o segundo, digitado sem esperar, vai para o avatar de baixo");
  await page.waitForFunction(() => !document.body.innerText.includes("salvando"));
  assert((await amountOf("Fra' Salvio").inputValue()) === "111,00" && (await amountOf("Grandpa Joe").inputValue()) === "222,00", "os dois campos mostram o que foi lançado");

  // corrigir o mesmo campo antes de a primeira gravação terminar
  await page.getByRole("button", { name: "Semana anterior" }).click();
  await page.getByText("Há 10 semanas", { exact: true }).waitFor();
  await amountOf("Fra' Salvio").click();
  await page.keyboard.type("10");
  await page.keyboard.press("Enter");
  await amountOf("Fra' Salvio").click();
  await page.keyboard.type("20");
  await page.keyboard.press("Enter");
  await db(saleOf("Fra' Salvio", 10, "amount"), "20.00", "vale o último valor digitado (as gravações entram em fila)");
  await page.waitForFunction(() => !document.body.innerText.includes("salvando"));
  assert(psql(`select count(*) from public.weekly_sales s join public.avatars a on a.id = s.avatar_id where a.name = 'Fra'' Salvio' and s.week_start = ${monday(10)}`) === "1", "um lançamento só, sem erro de duplicado");
  assert((await amountOf("Fra' Salvio").inputValue()) === "20,00", "o campo mostra o último valor");
  assert((await page.locator(".cda-toast").count()) === 0, "nenhum aviso de erro no caminho");

  // abrir os detalhes logo depois de digitar: a janela espera o lançamento e abre com ele
  await page.getByRole("button", { name: "Semana anterior" }).click();
  await page.getByText("Há 11 semanas", { exact: true }).waitFor();
  await amountOf("Grandpa Joe").fill("55");
  await page.getByRole("button", { name: "Detalhes da venda de Grandpa Joe" }).click();
  await dialog().getByText("Venda da semana").waitFor();
  assert((await field("Valor vendido na semana").inputValue()) === "55,00", "os detalhes abrem já com o valor que acabou de ser digitado");
  await field("Quantidade de vendas").fill("3");
  await save();
  await toast("Venda atualizada");
  await noDialog();
  await db(saleOf("Grandpa Joe", 11, "s.amount || '|' || s.sales_count"), "55.00|3", "e salvar os detalhes não desfaz o valor");
  await page.unroute("**/rest/v1/weekly_sales*", slow);
  // valor que não dá para entender: avisa uma vez, marca o campo e não abre os detalhes
  await amountOf("Fra' Salvio").fill("1x");
  await page.getByRole("button", { name: "Detalhes da venda de Fra' Salvio" }).click();
  await toast("Não entendi o valor");
  await page.waitForTimeout(400);
  assert((await page.locator("dialog[open]").count()) === 0, "com um valor inválido no campo, os detalhes não abrem");
  assert((await amountOf("Fra' Salvio").getAttribute("aria-invalid")) === "true", "o campo fica marcado");
  await amountOf("Fra' Salvio").click();
  await page.keyboard.press("Escape");

  // ---------------------------------------------------------------
  section("Cotação digitada errada: recalcular as vendas já lançadas");
  await page.getByRole("button", { name: "Cotações" }).click();
  await rate("USD").fill("5,5");
  await dialog().getByText("Usar também nas vendas já lançadas").click();
  await shot("d16-cotacoes-recalcular");
  await save();
  await toast("Cotações salvas");
  await noDialog();
  await db(
    "select count(*)::text || '|' || count(*) filter (where brl_rate = 5.5)::text from public.weekly_sales where currency = 'USD'",
    `${psql("select count(*) from public.weekly_sales where currency = 'USD'")}|${psql("select count(*) from public.weekly_sales where currency = 'USD'")}`,
    "marcando “usar também nas vendas já lançadas”, todas as vendas em dólar passam a 5,50",
  );
  assert(psql("select count(*) from public.weekly_sales where currency = 'EUR' and brl_rate is distinct from 6.1") === "0", "as vendas em euro (cotação não alterada) continuam como estavam");
  // depois de recalcular, as linhas mudaram de versão no banco: a tela precisa estar em dia para editar
  await amountOf("Grandpa Joe").fill("56");
  await page.keyboard.press("Enter");
  await db(saleOf("Grandpa Joe", 11, "amount || '|' || brl_rate"), "56.00|5.500000", "editar uma venda logo depois de recalcular funciona (sem “alterado em outro aparelho”)");

  // ---------------------------------------------------------------
  section("Apagar exemplos: as vendas de exemplo saem, as suas ficam");
  const mine = psql("select count(*) from public.weekly_sales where not is_example");
  await more("Configurações");
  await page.getByText(/lançamentos de vendas/).waitFor();
  await page.getByRole("button", { name: "Apagar exemplos" }).click();
  await dialog().getByRole("button", { name: "Apagar exemplos", exact: true }).click();
  await toast("Exemplos apagados");
  await db("select count(*)::text || '|' || count(*) filter (where is_example)::text from public.weekly_sales", `${mine}|0`, "só as vendas de exemplo são apagadas");
  assert(psql("select is_example::text from public.avatars where name = 'Fra'' Salvio'") === "false", "o avatar com vendas suas fica (deixa de ser exemplo)");

  // ---------------------------------------------------------------
  section("“Ficar com este avatar”: as vendas inventadas não viram dados seus");
  resetData(); // banco limpo: a próxima carga recria os exemplos
  await page.reload();
  await page.getByRole("heading", { name: "Configurações" }).waitFor({ timeout: 30000 });
  await openSales();
  await amountOf("Fra' Salvio").fill("90");
  await page.keyboard.press("Enter");
  await db(saleOf("Fra' Salvio", 0, "amount"), "90.00", "(uma venda de verdade lançada nesta semana)");
  await page.getByRole("link", { name: "Países" }).click();
  await page.getByRole("heading", { name: "Países", exact: true }).waitFor();
  await page.getByRole("link", { name: /Fra' Salvio/ }).click();
  await page.getByRole("heading", { name: "Fra' Salvio" }).waitFor();
  await page.getByRole("button", { name: "Ficar com este avatar" }).click();
  await dialog().getByText(/8 lançamentos inventados/).waitFor();
  ok("a confirmação avisa que as 8 vendas de exemplo serão apagadas");
  await dialog().getByRole("button", { name: "Ficar com ele" }).click();
  await toast("Fra' Salvio agora é seu");
  await db("select count(*)::text || '|' || coalesce(sum(amount), 0)::text || '|' || count(*) filter (where is_example)::text from public.weekly_sales", "1|90.00|0", "as vendas inventadas são apagadas; a que você lançou fica");
  assert(psql("select is_example::text from public.avatars where name = 'Fra'' Salvio'") === "false", "o avatar passa a ser seu");

  resetData();
  // (o 409 é esperado: é o banco recusando o lançamento repetido no teste dos dois aparelhos)
  await finish(session, [/the server responded with a status of 409/]);
})().catch(fail);
