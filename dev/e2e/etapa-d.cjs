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
const month = new Intl.DateTimeFormat("pt-BR", { month: "long", timeZone: "UTC" }).format(new Date());

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
  await db("select count(*)::text || '|' || (select prefs->>'examples_version' from public.settings) from public.weekly_sales where is_example", "8|3", "exemplos de uma versão anterior são completados com as vendas");

  await openSales();
  await page.getByRole("heading", { name: "Lançar vendas" }).waitFor();
  await tile("Últimas 12 semanas").getByText("€ 1.431,00").waitFor();
  await tile("Últimas 12 semanas").getByText("53 vendas").waitFor();
  ok("a tela Vendas soma as 12 últimas semanas (€ 1.431,00, 53 vendas)");
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
  // um lançamento novo guarda a cotação do dia; mudar a cotação depois não mexe nele
  await page.getByRole("button", { name: "Semana anterior" }).click();
  await amountOf("Grandpa Joe").fill("50");
  await page.keyboard.press("Enter");
  await db(saleOf("Grandpa Joe", 1, "amount || '|' || brl_rate"), "50.00|5.000000", "o lançamento novo guarda a cotação em vigor (5,00)");
  await page.getByRole("button", { name: "Próxima semana" }).click();
  await page.getByRole("button", { name: "Cotações" }).click();
  await rate("USD").fill("6");
  await save();
  await toast("Cotações salvas");
  await noDialog();
  // esta semana (lançada sem cotação) usa a atual: 400 × 6,10 + 100 × 6 = 3.040
  await tile("Esta semana").getByText("R$ 3.040,00").waitFor();
  ok("lançamento feito sem cotação acompanha a cotação atual (US$ 100 → R$ 600)");

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
  await page.getByText("1ª geração").first().waitFor();
  await page.getByText("2ª geração").first().waitFor();
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
  await overflow("aba Vendas do avatar");
  await shot("d15-avatar-vendas");

  // ---------------------------------------------------------------
  section("Países: vendas do mês no cartão do avatar");
  await page.getByRole("link", { name: "Países" }).click();
  await page.getByRole("heading", { name: "Países", exact: true }).waitFor();
  const monthTotal = psql(
    "select sum(amount)::text from public.weekly_sales s join public.avatars a on a.id = s.avatar_id where a.name = 'Fra'' Salvio' and to_char(s.week_start, 'YYYY-MM') = to_char(current_date, 'YYYY-MM')",
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
  section("Apagar exemplos: as vendas de exemplo saem, as suas ficam");
  const mine = psql("select count(*) from public.weekly_sales where not is_example");
  await more("Configurações");
  await page.getByText(/lançamentos de vendas/).waitFor();
  await page.getByRole("button", { name: "Apagar exemplos" }).click();
  await dialog().getByRole("button", { name: "Apagar exemplos", exact: true }).click();
  await toast("Exemplos apagados");
  await db("select count(*)::text || '|' || count(*) filter (where is_example)::text from public.weekly_sales", `${mine}|0`, "só as vendas de exemplo são apagadas");
  assert(psql("select is_example::text from public.avatars where name = 'Fra'' Salvio'") === "false", "o avatar com vendas suas fica (deixa de ser exemplo)");

  resetData();
  // (o 409 é esperado: é o banco recusando o lançamento repetido no teste dos dois aparelhos)
  await finish(session, [/the server responded with a status of 409/]);
})().catch(fail);
