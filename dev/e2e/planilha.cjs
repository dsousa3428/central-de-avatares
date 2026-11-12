// Teste de ponta a ponta da PLANILHA: grade, edição nas células, ordenar,
// filtrar, buscar e exportar.
//
//   node dev/e2e/planilha.cjs      (com o app rodando em http://localhost:3000)
const { chromium } = require("playwright");
const { readFileSync } = require("node:fs");
const { BASE, USER, SHOTS, psql, resetData, ok, section, assert, openPhone, finish, fail } = require("./helpers.cjs");

(async () => {
  resetData();
  const session = await openPhone(chromium, { timezoneId: "UTC", acceptDownloads: true });
  const { page, dialog, shot, toast, clipboard, more } = session;
  await session.login();

  const cell = (rowText, columnLabel) =>
    page.getByRole("row", { name: rowText }).getByRole("button", { name: columnLabel }).or(
      page.getByRole("row", { name: rowText }).getByLabel(columnLabel, { exact: true }),
    );
  // Linhas da grade (sem o cabeçalho), como textos das células
  const rows = () =>
    page.evaluate(() =>
      [...document.querySelectorAll("tbody tr")].map((tr) =>
        [...tr.querySelectorAll("td")].map((td) => {
          const select = td.querySelector("select");
          return select ? select.options[select.selectedIndex].text : td.innerText.trim();
        }),
      ),
    );
  const header = () => page.evaluate(() => [...document.querySelectorAll("thead th")].map((th) => th.innerText.trim()));
  const column = async (name) => (await header()).indexOf(name);

  // ---------------------------------------------------------------
  section("Planilha no celular");
  await page.getByRole("link", { name: "Planilha" }).click();
  await page.getByRole("heading", { name: "Planilha" }).waitFor();
  await page.getByRole("table").waitFor();
  assert((await rows()).length === 2, "a tabela de contas mostra as 2 contas de exemplo");
  const extra = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert(extra <= 0, "a página não rola para o lado (só a tabela, por dentro)");
  const scrolls = await page.evaluate(() => {
    const box = document.querySelector("table").parentElement;
    return box.scrollWidth > box.clientWidth;
  });
  assert(scrolls, "a tabela rola para o lado dentro da própria caixa");
  const sticky = await page.evaluate(() => {
    const box = document.querySelector("table").parentElement;
    box.scrollLeft = 300;
    const first = document.querySelector("tbody td").getBoundingClientRect();
    const head = document.querySelector("thead th").getBoundingClientRect();
    const result = Math.round(first.left) === Math.round(box.getBoundingClientRect().left) && Math.round(head.left) === Math.round(first.left);
    box.scrollLeft = 0;
    return result;
  });
  assert(sticky, "a primeira coluna (Avatar) fica fixa ao rolar para o lado");
  await shot("p1-planilha-celular");

  // ---------------------------------------------------------------
  section("Editar direto nas células");
  const seguidores = await column("Seguidores");
  await page.getByRole("row", { name: /Aquecendo/ }).locator("td").nth(seguidores).getByRole("button").click();
  await page.getByRole("row", { name: /Aquecendo/ }).getByLabel("Seguidores").fill("12,3 mil");
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => document.body.innerText.includes("12.300"));
  await page.waitForTimeout(500);
  assert(psql("select followers from public.accounts where generation = 2") === "12300", "seguidores “12,3 mil” gravados como 12300");

  await page.getByRole("row", { name: /12\.300/ }).locator("td").nth(seguidores).getByRole("button").click();
  await page.getByLabel("Seguidores").fill("abc");
  await page.keyboard.press("Enter");
  await toast("Não entendi o número");
  assert(psql("select followers from public.accounts where generation = 2") === "12300", "valor inválido é recusado e nada muda");

  await page.getByRole("row", { name: /12\.300/ }).locator("td").nth(seguidores).getByRole("button").click();
  await page.getByLabel("Seguidores").fill("999");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);
  assert(psql("select followers from public.accounts where generation = 2") === "12300", "Esc cancela a edição");

  await page.getByRole("row", { name: /12\.300/ }).getByLabel("Status").selectOption("ativa");
  await page.waitForTimeout(700);
  assert(psql("select status from public.accounts where generation = 2") === "ativa", "status alterado pela lista da célula");
  assert(psql("select (finished_at is not null)::text from public.warmups") === "true", "…e o aquecimento da conta é encerrado junto");

  await page.getByRole("row", { name: /12\.300/ }).getByLabel("Celular").selectOption({ label: "Celular A" });
  await page.waitForTimeout(600);
  assert(
    psql("select p.nickname from public.accounts a join public.phones p on p.id = a.phone_id where a.generation = 2") === "Celular A",
    "celular trocado pela lista da célula",
  );

  const anotacoes = await column("Anotações");
  await page.getByRole("row", { name: /12\.300/ }).locator("td").nth(anotacoes).getByRole("button").click();
  await page.getByLabel("Anotações").fill("Anotação feita na planilha");
  await page.getByRole("heading", { name: "Planilha" }).click(); // sair do campo também grava
  await page.waitForTimeout(600);
  assert(psql("select notes from public.accounts where generation = 2") === "Anotação feita na planilha", "sair do campo grava a anotação");

  // status "Caída" pede data e motivo: abre o formulário da conta
  await page.getByRole("row", { name: /12\.300/ }).getByLabel("Status").selectOption("caida");
  await dialog().getByLabel("Data da queda").waitFor();
  ok("escolher “Caída” abre o formulário para informar data e motivo");
  await dialog().getByRole("button", { name: "Cancelar" }).click();
  await page.waitForFunction(() => !document.querySelector("dialog[open]"));
  assert(psql("select status from public.accounts where generation = 2") === "ativa", "cancelar o formulário não muda o status");

  // ---------------------------------------------------------------
  section("Ordenar, filtrar e buscar");
  await page.getByRole("button", { name: "Seguidores" }).click();
  let data = await rows();
  assert(data[0][seguidores] === "1.840" && data[1][seguidores] === "12.300", "ordenar por seguidores (crescente)");
  await page.getByRole("button", { name: "Seguidores" }).click();
  data = await rows();
  assert(data[0][seguidores] === "12.300", "segundo toque: decrescente");

  await page.getByLabel("Filtrar por status").selectOption("caida");
  data = await rows();
  assert(data.length === 1 && data[0].includes("Caída"), "filtro por status mostra só as caídas");
  await page.getByLabel("Filtrar por status").selectOption("");
  await page.getByLabel("Só a conta atual").check();
  assert((await rows()).length === 1, "“Só a conta atual” deixa uma linha por avatar");
  await page.getByLabel("Só a conta atual").uncheck();
  await page.getByPlaceholder("Buscar…").fill("it-res-01");
  data = await rows();
  assert(data.length === 1 && data[0].includes("Caída"), "busca encontra pela conta do proxy digitado");
  await page.getByPlaceholder("Buscar…").fill("@FRA.salvio");
  assert((await rows()).length === 2, "busca por “@conta” (com o arroba, como aparece na tela) encontra as contas");
  await page.getByPlaceholder("Buscar…").fill("12.300");
  data = await rows();
  assert(data.length === 1 && data[0][seguidores] === "12.300", "busca por “12.300” (com o ponto de milhar) encontra a conta");
  await page.getByPlaceholder("Buscar…").fill("nada-com-esse-texto");
  await page.getByText("Nenhuma linha combina com a busca ou os filtros.").waitFor();
  await page.getByRole("button", { name: "Limpar busca" }).click();
  assert((await rows()).length === 2, "limpar a busca traz tudo de volta");

  // ---------------------------------------------------------------
  section("Copiar e baixar");
  await page.getByRole("button", { name: "Copiar", exact: true }).click();
  await toast("2 linhas copiadas");
  const tsv = (await clipboard()).split("\n").map((line) => line.split("\t"));
  assert(tsv.length === 3 && tsv[0][0] === "Avatar" && tsv[0].includes("Seguidores"), "copiar leva o cabeçalho e as 2 linhas, separados por TAB");
  assert(tsv[1][tsv[0].indexOf("Conta (@)")] === "fra.salvio", "o @ vai sem o arroba (não vira fórmula na planilha)");
  assert(tsv.some((line) => line.includes("12300")), "números vão sem pontos de milhar");

  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Baixar", exact: true }).click()]);
  const file = SHOTS + "/" + download.suggestedFilename();
  await download.saveAs(file);
  const csv = readFileSync(file, "utf8");
  assert(/^contas-\d{4}-\d{2}-\d{2}\.csv$/.test(download.suggestedFilename()), `arquivo baixado: ${download.suggestedFilename()}`);
  assert(csv.charCodeAt(0) === 0xfeff && csv.includes("Avatar;País;Conta (@)"), "CSV com ponto e vírgula e acentos corretos para o Excel");

  // ---------------------------------------------------------------
  section("Outras tabelas");
  await page.getByRole("tab", { name: /^Avatares/ }).click();
  await page.getByRole("row", { name: /Fra' Salvio/ }).getByRole("button", { name: /Remédios naturais/ }).click();
  await page.getByLabel("Nicho").fill("Chás e ervas");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(600);
  assert(psql("select niche from public.avatars") === "Chás e ervas", "nicho do avatar editado na planilha");
  await page.getByRole("row", { name: /Fra' Salvio/ }).getByLabel("Status").selectOption("pausado");
  await page.waitForTimeout(600);
  assert(psql("select status from public.avatars") === "pausado", "status do avatar editado na planilha");

  await page.getByRole("tab", { name: /^Celulares/ }).click();
  data = await rows();
  assert(data.length === 2 && data.some((r) => r.includes("Em uso")) && data.some((r) => r.includes("Livre")), "celulares mostram quem está em uso e quem está livre");
  // telefones começam com "+": na exportação ganham um espaço na frente para não virarem fórmula
  await page.getByRole("button", { name: "Copiar", exact: true }).click();
  const phones = await clipboard();
  assert(phones.includes("\t +39 351 000 0001"), "telefone com “+” é exportado como texto (com um espaço na frente)");

  await page.getByRole("tab", { name: /^Perfis anti-detect/ }).click();
  await page.getByRole("row", { name: /101/ }).getByRole("button", { name: "101" }).click();
  await page.getByLabel("Perfil nº").fill("102");
  await page.keyboard.press("Enter");
  await toast("Já existe um perfil com o número 102");
  assert(psql("select count(*) from public.antidetect_profiles where number = '101'") === "1", "número de perfil repetido é recusado");

  // ---------------------------------------------------------------
  section("Conta caída que volta à ativa");
  await page.getByRole("tab", { name: /^Contas/ }).click();
  assert(
    psql("select (fell_on is not null)::text || '|' || (fall_reason is not null)::text from public.accounts where generation = 1") === "true|true",
    "a conta caída de exemplo tem data e motivo da queda",
  );
  await page.getByRole("row", { name: /Caída/ }).getByLabel("Status").selectOption("ativa");
  await page.waitForTimeout(800);
  assert(
    psql("select status || '|' || coalesce(fell_on::text, '') || '|' || coalesce(fall_reason, '') from public.accounts where generation = 1") === "ativa||",
    "trocar “Caída” por “Ativa” na célula limpa a data e o motivo da queda",
  );

  // ---------------------------------------------------------------
  section("Menu “Mais” no celular");
  await more("Infraestrutura");
  await more("Configurações");
  ok("Infraestrutura e Configurações abrem pelo menu “Mais”");

  await finish(session);

  // ---------------------------------------------------------------
  // No computador: a planilha usa a largura toda
  const browser = await chromium.launch();
  const desk = await (await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "pt-BR", serviceWorkers: "block" })).newPage();
  await desk.goto(BASE + "/login");
  await desk.getByLabel("E-mail").fill(USER.email);
  await desk.getByLabel("Senha", { exact: true }).fill(USER.password);
  await desk.getByRole("button", { name: "Entrar" }).click();
  await desk.getByRole("heading", { name: "Hoje", exact: true }).waitFor({ timeout: 30000 });
  await desk.getByRole("link", { name: "Planilha" }).click();
  await desk.getByRole("table").waitFor();
  const width = await desk.evaluate(() => document.querySelector("table").parentElement.getBoundingClientRect().width);
  if (width < 1050) throw new Error(`FALHOU: no computador a planilha deveria usar a largura toda (tem ${Math.round(width)}px)`);
  console.log(`\n  ✓ no computador a planilha usa a largura toda (${Math.round(width)}px de 1440)`);
  await desk.waitForTimeout(400);
  await desk.screenshot({ path: SHOTS + "/p2-planilha-computador.png" });
  await browser.close();
  resetData();
})().catch(fail);
