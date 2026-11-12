// Teste de ponta a ponta do que veio depois das etapas: a ESTRUTURA do avatar (site,
// entregável, checkout e automação), montada enquanto a conta aquece.
//
//   node dev/e2e/etapa-g.cjs      (com o app rodando em http://localhost:3000)
const { chromium } = require("playwright");
const { psql, resetData, ok, section, assert, openPhone, finish, fail } = require("./helpers.cjs");

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

// os passos marcados como prontos no avatar de exemplo, em ordem alfabética
const STRUCTURE = "select coalesce((select string_agg(key, ',' order by key) from jsonb_each(kit->'structure') where value = 'true'::jsonb), '') from public.avatars where name = 'Fra'' Salvio'";
// empurra o calendário de aquecimento alguns dias (positivo = para a frente)
const shiftWarmup = (days) =>
  psql(`update public.warmups set start_date = start_date + ${days}, days = (select jsonb_agg(jsonb_set(d, '{date}', to_jsonb(((d->>'date')::date + ${days})::text)) order by (d->>'n')::int) from jsonb_array_elements(days) d)`);

(async () => {
  resetData();
  const session = await openPhone(chromium, { timezoneId: "UTC" });
  const { page, shot, overflow } = session;
  await session.login();

  const goToday = async () => {
    await page.getByRole("link", { name: /^Hoje/ }).click();
    await page.getByRole("heading", { name: "Hoje", exact: true }).waitFor();
  };
  const reload = async () => {
    await page.reload();
    await page.getByRole("heading", { name: "Hoje", exact: true }).waitFor({ timeout: 30000 });
  };
  const building = () => page.locator("li", { has: page.getByText(/^Falta: /) });
  const step = (label) => page.getByRole("checkbox", { name: label, exact: true });

  // ---------------------------------------------------------------
  section("Exemplos: o avatar de exemplo vem com a estrutura quase pronta");
  assert(psql(STRUCTURE) === "checkout,entregavel,site", "site, entregável e checkout prontos; falta a automação");
  // quem já usava o painel antes ganha a estrutura de exemplo na próxima abertura
  psql("update public.avatars set kit = kit - 'structure'; update public.settings set prefs = jsonb_set(prefs, '{examples_version}', '4')");
  await reload();
  await db(STRUCTURE + " and (select prefs->>'examples_version' from public.settings) = '5'", "checkout,entregavel,site", "exemplos de uma versão anterior são completados com a estrutura");
  assert(psql("select kit->>'bio' is not null and jsonb_array_length(kit->'highlights') = 3 from public.avatars where name = 'Fra'' Salvio'") === "t", "o resto do kit de reposição continua como estava");

  // ---------------------------------------------------------------
  section("Tela Hoje: montar a estrutura enquanto a conta aquece");
  await reload();
  await page.getByRole("heading", { name: "Montar a estrutura" }).waitFor();
  assert((await building().count()) === 1 && /Fra' Salvio/.test(await building().first().innerText()), "o avatar em aquecimento aparece em “Montar a estrutura”");
  await building().first().getByText("Falta: Automação · 3 de 4 prontos").waitFor();
  assert((await page.getByText("conta descansa hoje").count()) === 0, "hoje é dia de uso da conta: sem o lembrete de descanso");
  // no dia em que a conta descansa, o painel lembra que é um bom dia para adiantar a estrutura
  shiftWarmup(1);
  await reload();
  await building().first().getByText("conta descansa hoje").waitFor();
  await page.getByRole("heading", { name: "Descansando hoje" }).waitFor();
  ok("no dia de descanso do aquecimento, o avatar ganha o lembrete “conta descansa hoje”");
  await overflow("Hoje (montar a estrutura)");
  await shot("g10-hoje-estrutura");

  // ---------------------------------------------------------------
  section("Avatar: marcar os passos da estrutura");
  await building().first().getByRole("link").click();
  await page.getByRole("heading", { name: "Fra' Salvio" }).waitFor();
  await page.getByRole("heading", { name: "Estrutura", exact: true }).waitFor();
  await page.getByText("3 de 4 prontos — dá para adiantar enquanto a conta aquece.").waitFor();
  assert(
    (await step("Site de vendas").getAttribute("aria-checked")) === "true" && (await step("Automação").getAttribute("aria-checked")) === "false",
    "os passos prontos vêm marcados; a automação, não",
  );
  const row = (label) => page.locator("li", { has: step(label) });
  await row("Site de vendas").getByText("exemplo.com/fra-salvio").first().waitFor();
  await row("Checkout").getByText("exemplo.com/fra-salvio/checkout").waitFor();
  await row("Entregável").getByText("exemplo.com/fra-salvio/obrigado").waitFor();
  ok("cada passo mostra o link que já está cadastrado para ele");
  await overflow("Visão geral do avatar");
  await shot("g11-avatar-estrutura");
  await step("Automação").click();
  await db(STRUCTURE, "automacao,checkout,entregavel,site", "tocar num passo marca como pronto");
  await page.getByText("Tudo pronto para vender.").waitFor();
  await step("Checkout").click();
  await db(STRUCTURE, "automacao,entregavel,site", "tocar de novo desmarca");
  assert(psql("select kit->>'bio' is not null and jsonb_array_length(kit->'proof_links') = 3 from public.avatars where name = 'Fra'' Salvio'") === "t", "marcar a estrutura não mexe no kit de reposição");
  await goToday();
  await building().first().getByText("Falta: Checkout · 3 de 4 prontos").waitFor();
  ok("a tela Hoje acompanha o que falta");

  // ---------------------------------------------------------------
  section("Aviso: o aquecimento terminou e a estrutura não está pronta");
  // todos os dias de uso feitos e o calendário já no passado
  psql(`update public.warmups set days = (select jsonb_agg(jsonb_set(d, '{done}', 'true'::jsonb) order by (d->>'n')::int) from jsonb_array_elements(days) d)`);
  shiftWarmup(-12);
  await reload();
  await page.getByRole("heading", { name: "Prontas para operar" }).waitFor();
  await page.getByRole("link", { name: /Fra' Salvio: falta terminar a estrutura/ }).waitFor();
  await page.getByText("O aquecimento de @fra.salvio terminou, mas ainda falta: Checkout.").waitFor();
  ok("conta pronta para operar com a estrutura incompleta vira aviso");
  // a conta começa a operar com a estrutura pela metade: o aviso continua (com outro texto)
  psql("update public.accounts set status = 'ativa' where status = 'aquecendo'");
  await reload();
  await page.getByText("@fra.salvio já está ativa, mas ainda falta: Checkout.").waitFor();
  assert((await page.getByRole("heading", { name: "Montar a estrutura" }).count()) === 0, "(o bloco “Montar a estrutura” é só para contas em aquecimento)");
  ok("conta já ativa com a estrutura começada e não terminada continua com o aviso");
  await page.getByRole("link", { name: /Fra' Salvio: falta terminar a estrutura/ }).click();
  await page.getByRole("heading", { name: "Estrutura", exact: true }).waitFor();
  await step("Checkout").click();
  await db(STRUCTURE, "automacao,checkout,entregavel,site", "(estrutura completa)");
  await goToday();
  await page.waitForFunction(() => !document.body.innerText.includes("falta terminar a estrutura"));
  assert((await page.getByRole("heading", { name: "Montar a estrutura" }).count()) === 0, "com tudo pronto, o aviso e o bloco “Montar a estrutura” somem");

  // ---------------------------------------------------------------
  section("Planilha: coluna Estrutura");
  psql("update public.avatars set kit = jsonb_set(kit, '{structure}', '{\"site\": true}'::jsonb)");
  await page.getByRole("link", { name: "Planilha" }).click();
  await page.getByRole("heading", { name: "Planilha" }).waitFor();
  await page.reload();
  await page.getByRole("tab", { name: /^Avatares/ }).click();
  await page.getByRole("table").waitFor();
  const header = await page.evaluate(() => [...document.querySelectorAll("thead th")].map((th) => th.innerText.trim()));
  const index = header.indexOf("Estrutura");
  assert(index > 0, "a tabela de avatares tem a coluna Estrutura");
  assert((await page.locator("tbody tr").first().locator("td").nth(index).innerText()).trim() === "1 de 4 (falta Entregável, Checkout e Automação)", "dizendo quantos passos estão prontos e o que falta");

  resetData();
  await finish(session);
})().catch(fail);
