// Teste de ponta a ponta da ETAPA (e): "Conta caiu" (assistente + checklist de reposição),
// avisos automáticos na tela Hoje e a tela de quedas.
//
//   node dev/e2e/etapa-e.cjs      (com o app rodando em http://localhost:3000)
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

const account = (generation, column) =>
  `select coalesce((${column})::text, '') from public.accounts a where a.handle = 'fra.salvio' and a.generation = ${generation}`;
// os itens feitos do checklist de uma geração, na ordem do checklist
const doneOf = (generation) =>
  `select coalesce(string_agg(item->>'key', ',' order by position), '') from public.accounts a, jsonb_array_elements(a.checklist) with ordinality as list(item, position) where a.handle = 'fra.salvio' and a.generation = ${generation} and (item->>'done')::boolean`;
const brDate = (iso) => iso.split("-").reverse().join("/");

(async () => {
  resetData();
  const session = await openPhone(chromium, { timezoneId: "UTC" });
  const { page, dialog, shot, toast, save, noDialog, overflow, clipboard } = session;
  await session.login();

  const field = (label) => dialog().getByLabel(label, { exact: true });
  const goToday = async () => {
    await page.getByRole("link", { name: /^Hoje/ }).click();
    await page.getByRole("heading", { name: "Hoje", exact: true }).waitFor();
  };
  // o número de avisos ao lado de "Hoje" na navegação (0 = sem número)
  const badge = async () => {
    const text = await page.getByRole("link", { name: /^Hoje/ }).textContent();
    const match = /\((\d+) avisos?\)/.exec(text);
    return match ? Number(match[1]) : 0;
  };
  const warnings = () => page.getByRole("list", { name: "Avisos em aberto" }).locator("> li");
  const today = psql("select current_date::text");
  const lastMonday = psql("select (date_trunc('week', current_date)::date - 7)::text");

  // ---------------------------------------------------------------
  section("Exemplos: a conta de reposição já vem com o checklist");
  assert(psql(account(2, "jsonb_array_length(a.checklist)")) === "9", "a conta de exemplo (2ª geração) tem o checklist de reposição com 9 itens");
  assert(psql(doneOf(2)) === "email,perfil,proxy,celular,bio,link,aquecimento", "sete itens feitos; faltam os destaques e as provas sociais");
  assert(psql(account(1, "a.checklist is null")) === "true", "a conta que caiu não tem checklist");
  // quem já usava o painel antes desta etapa ganha o checklist de exemplo na próxima abertura
  psql("update public.accounts set checklist = null; update public.settings set prefs = jsonb_set(prefs, '{examples_version}', '3')");
  await page.reload();
  await page.getByRole("heading", { name: "Hoje", exact: true }).waitFor({ timeout: 30000 });
  await db(account(2, "jsonb_array_length(a.checklist)") + " and (select prefs->>'examples_version' from public.settings) = '5'", "9", "exemplos de uma versão anterior são completados com o checklist");

  // ---------------------------------------------------------------
  section("Tela Hoje: lista de avisos");
  await page.getByRole("heading", { name: "Avisos", exact: true }).waitFor();
  await page.getByRole("link", { name: /Fra' Salvio · @fra\.salvio: reposição em andamento/ }).waitFor();
  await page.getByText("Faltam 2 itens do checklist: Destaques e Provas sociais.").waitFor();
  ok("a reposição em andamento aparece como lembrete, dizendo o que falta");
  assert((await badge()) === 0, "lembrete não acende o número de avisos na navegação");
  await shot("e10-hoje-avisos");

  // mais situações que o painel precisa perceber sozinho
  const uid = psql("select user_id from public.countries limit 1");
  const italy = psql("select id from public.countries where name = 'Itália'");
  const phoneB = psql("select phone_id from public.accounts where handle = 'fra.salvio' and generation = 2");
  psql(`insert into public.avatars (user_id, country_id, name, status, position) values ('${uid}', '${italy}', 'Nonna Maria', 'ativo', 1), ('${uid}', '${italy}', 'Zio Pino', 'ativo', 2), ('${uid}', '${italy}', 'Cugino Pausado', 'pausado', 3)`);
  // Nonna Maria: mesma celular da conta viva do Fra' Salvio, e o proxy da conta dele que caiu; sem vendas na semana passada
  psql(`insert into public.accounts (user_id, avatar_id, generation, handle, phone_id, proxy, created_on, status) select '${uid}', id, 1, 'nonna.maria', '${phoneB}', 'HTTP://it-res-01.exemplo.net:8000/', current_date - 20, 'ativa' from public.avatars where name = 'Nonna Maria'`);
  await page.reload();
  await page.getByRole("heading", { name: "Hoje", exact: true }).waitFor({ timeout: 30000 });
  await page.getByRole("link", { name: /Celular em 2 contas ao mesmo tempo/ }).waitFor();
  await page.getByText(/Celular B \(Xiaomi Redmi 13C\): .*@fra\.salvio \(2ª geração\) e Nonna Maria · @nonna\.maria \(1ª geração\)\./).waitFor();
  ok("o mesmo celular em duas contas vivas vira aviso, dizendo quais contas");
  await page.getByRole("link", { name: /@nonna\.maria usa um proxy de conta que caiu/ }).waitFor();
  await page.getByText(/já foi de Fra' Salvio · @fra\.salvio \(1ª geração\), caída em \d\d\/\d\d\/\d{4}\./).waitFor();
  ok("proxy igual ao de uma conta que caiu vira aviso (mesmo escrito com http:// e maiúsculas)");
  await page.getByRole("link", { name: /Zio Pino está sem conta em operação/ }).waitFor();
  ok("avatar ativo sem conta vira aviso");
  assert((await page.getByText(/Cugino Pausado/).count()) === 0, "avatar pausado não gera aviso");
  await page.getByRole("link", { name: /Vendas da semana passada sem lançamento/ }).waitFor();
  await page.getByText(/falta lançar Nonna Maria\. Se não vendeu nada, lance 0\./).waitFor();
  ok("semana passada sem lançamento de vendas vira aviso, só para quem falta (o Fra' Salvio tem lançamento)");
  assert((await warnings().count()) === 4, "a lista mostra os 4 primeiros avisos");
  const order = await warnings().allInnerTexts();
  assert(/Celular em 2 contas/.test(order[0]) && /usa um proxy/.test(order[1]) && /sem conta em operação/.test(order[2]) && /Vendas da semana passada/.test(order[3]), "na ordem: riscos primeiro, depois pendências");
  assert((await badge()) === 4, "o número ao lado de “Hoje” conta riscos e pendências (4)");
  await page.getByRole("button", { name: "Ver todos os 5 avisos" }).click();
  assert((await warnings().count()) === 5, "“Ver todos” mostra os 5 (o lembrete da reposição por último)");
  await overflow("Hoje (com avisos)");
  await shot("e11-hoje-todos-os-avisos");

  // o aviso de vendas abre a tela Vendas direto na semana que falta
  await page.getByRole("link", { name: /Vendas da semana passada sem lançamento/ }).click();
  await page.getByRole("heading", { name: "Vendas", exact: true }).waitFor();
  await page.getByText("Semana passada", { exact: true }).first().waitFor();
  ok("o aviso leva para Vendas, já na semana passada");
  await page.getByLabel("Vendas de Nonna Maria na semana").fill("0");
  await page.keyboard.press("Enter");
  await db(`select amount::text from public.weekly_sales s join public.avatars a on a.id = s.avatar_id where a.name = 'Nonna Maria' and s.week_start = '${lastMonday}'`, "0.00", "lançar 0 também é lançar");
  // o pedido do endereço vale uma vez: depois as setas mandam, e a troca é imediata
  await page.waitForURL(/\/vendas$/);
  await page.getByRole("button", { name: "Próxima semana" }).click();
  assert(await page.getByText("Esta semana", { exact: true }).first().isVisible(), "as setas continuam trocando de semana na hora");
  await goToday();
  await page.waitForFunction(() => !document.body.innerText.includes("Vendas da semana passada sem lançamento"));
  assert((await badge()) === 3, "lançada a venda, o aviso some sozinho (3 avisos)");

  // dispensar e trazer de volta
  await page.getByRole("button", { name: /Dispensar aviso: Celular em 2 contas/ }).click();
  await page.getByRole("button", { name: /1 aviso dispensado · mostrar/ }).waitFor();
  assert((await warnings().count()) === 3 && !(await warnings().allInnerTexts()).some((text) => text.includes("Celular em 2 contas")), "o aviso dispensado sai da lista (ficam os outros 3)");
  await db("select jsonb_array_length(prefs->'ignored_warnings')::text from public.settings", "1", "dispensar guarda o aviso nas preferências");
  assert((await badge()) === 2, "aviso dispensado não conta mais (2 avisos)");
  await page.getByRole("button", { name: /1 aviso dispensado · mostrar/ }).click();
  await page.getByRole("list", { name: "Avisos dispensados" }).getByText("Celular em 2 contas ao mesmo tempo").waitFor();
  await shot("e12-avisos-dispensados");
  await page.getByRole("button", { name: /Voltar a avisar: Celular em 2 contas/ }).click();
  await db("select jsonb_array_length(prefs->'ignored_warnings')::text from public.settings", "0", "“voltar a avisar” tira o aviso dos dispensados");
  await page.waitForFunction(() => !document.body.innerText.includes("aviso dispensado"));
  assert((await badge()) === 3, "e ele volta a contar (3 avisos)");
  // a situação mudou (a conta saiu daquele celular): o aviso some sem ninguém dispensar
  psql("update public.accounts set phone_id = null where handle = 'nonna.maria'");
  await page.reload();
  await page.getByRole("heading", { name: "Hoje", exact: true }).waitFor({ timeout: 30000 });
  await page.getByRole("link", { name: /@nonna\.maria usa um proxy/ }).waitFor();
  assert((await page.getByText("Celular em 2 contas ao mesmo tempo").count()) === 0 && (await badge()) === 2, "resolvido o problema, o aviso some sozinho");

  // ---------------------------------------------------------------
  section("“Conta caiu”, passo 1: data e motivo");
  await page.getByRole("link", { name: /reposição em andamento/ }).click();
  await page.getByRole("heading", { name: "Fra' Salvio" }).waitFor();
  await page.getByRole("heading", { name: "Checklist de reposição" }).waitFor();
  ok("o aviso da reposição abre a conta atual do avatar, com o checklist");
  await page.getByText("Esta conta caiu?").waitFor();
  await page.getByRole("button", { name: "Conta caiu", exact: true }).click();
  await dialog().getByRole("heading", { name: "Conta caiu" }).waitFor();
  await dialog().getByText("Passo 1 de 2 · @fra.salvio (2ª geração)").waitFor();
  assert((await field("Data da queda").inputValue()) === today, "a data da queda já vem com hoje");
  await field("Data da queda").fill(psql("select (created_on - 1)::text from public.accounts where handle = 'fra.salvio' and generation = 2"));
  await save("Confirmar queda");
  await dialog().getByRole("alert").filter({ hasText: "não pode ser anterior à data de criação" }).waitFor();
  ok("data anterior à criação da conta é recusada");
  await field("Data da queda").fill(today);
  await dialog().getByRole("button", { name: "Verificação por selfie / documento" }).click();
  assert((await field("Motivo provável").inputValue()) === "Verificação por selfie / documento", "tocar numa sugestão preenche o motivo");
  await shot("e13-conta-caiu");
  await save("Confirmar queda");
  await toast("Conta marcada como caída");
  await db(account(2, "a.status || '|' || a.fell_on || '|' || a.fall_reason"), `caida|${today}|Verificação por selfie / documento`, "a conta fica como caída, com a data e o motivo");
  await db("select (finished_at is not null)::text from public.warmups w join public.accounts a on a.id = w.account_id where a.handle = 'fra.salvio' and a.generation = 2", "true", "o aquecimento dela é encerrado");
  await db("select count(*)::text from public.activity_log e join public.accounts a on a.id = e.account_id where a.generation = 2 and e.kind = 'caiu' and e.message like 'Conta caiu — Verificação%'", "1", "a queda entra na linha do tempo");

  // ---------------------------------------------------------------
  section("“Conta caiu”, passo 2: a nova geração, sem reutilizar o que era da conta caída");
  await dialog().getByRole("heading", { name: "Nova conta" }).waitFor();
  await dialog().getByText(`Passo 2 de 2 · Reposição de @fra.salvio (2ª geração), que caiu em ${brDate(today)}.`).waitFor();
  ok("a criação da nova conta abre sozinha, dizendo qual conta ela substitui");
  assert((await field("@ do Instagram").inputValue()) === "fra.salvio" && (await field("Geração").inputValue()) === "3", "com o mesmo @, na 3ª geração");
  assert(
    (await field("E-mail da conta").inputValue()) === "" && (await field("Celular").inputValue()) === "" && (await field("Perfil no anti-detect").inputValue()) === "" && (await field("Proxy / IP usado").inputValue()) === "",
    "e-mail, celular, perfil e proxy começam em branco",
  );
  // o celular da conta que caiu só entra com confirmação
  await field("Celular").selectOption({ label: "Celular B (Xiaomi Redmi 13C) · usado por conta caída" });
  await dialog().getByText("Este celular foi usado por conta que caiu").waitFor();
  await save();
  await dialog().getByRole("alert").filter({ hasText: "Você escolheu o celular de uma conta que caiu" }).waitFor();
  assert(psql("select count(*) from public.accounts where handle = 'fra.salvio'") === "2", "sem a confirmação, a conta não é criada");
  ok("o assistente não deixa reutilizar o celular da conta caída sem confirmar");
  const reuse = dialog().getByRole("checkbox", { name: /^Reutilizar/ });
  await dialog().getByText("Reutilizar o celular de conta que caiu").waitFor();
  await reuse.check();
  // escolher também o perfil (que traz o proxy dele) muda a pergunta: a confirmação anterior não vale mais
  await field("Perfil no anti-detect").selectOption({ label: "Perfil 102 — Fra' Salvio IT — 2ª conta · usado por conta caída" });
  await dialog().getByText("Reutilizar o celular, o perfil e o proxy de conta que caiu").waitFor();
  assert(!(await reuse.isChecked()), "trocar a escolha desmarca a confirmação (ela vale para o que foi confirmado)");
  await save();
  await dialog().getByRole("alert").filter({ hasText: "Você escolheu o celular, o perfil e o proxy de uma conta que caiu" }).waitFor();
  ok("perfil e proxy da conta caída também são barrados");
  await dialog().getByText("Reutilizar o celular, o perfil e o proxy de conta que caiu").scrollIntoViewIfNeeded();
  await shot("e14-reuso-barrado");
  // perfil e proxy novos (o perfil é cadastrado ali mesmo); o celular continua o mesmo, agora com a confirmação
  await field("Perfil no anti-detect").selectOption({ label: "＋ Cadastrar novo perfil…" });
  await dialog().getByRole("heading", { name: "Novo perfil anti-detect" }).waitFor();
  await dialog().getByLabel("Número do perfil").fill("104");
  await save();
  await toast("Perfil cadastrado");
  await dialog().getByRole("heading", { name: "Nova conta" }).waitFor();
  assert((await field("Perfil no anti-detect").locator("option:checked").innerText()).startsWith("Perfil 104"), "o perfil novo, cadastrado ali mesmo, já fica escolhido");
  await field("Proxy / IP usado").fill("it-res-03.exemplo.net:8000");
  await dialog().getByText("Reutilizar o celular de conta que caiu").waitFor();
  assert(await reuse.isChecked(), "de volta a “só o celular”, vale a confirmação que já tinha sido dada para ele");
  await field("E-mail da conta").fill("frasalvio.conta3@exemplo.com");
  await save();
  await toast("Conta criada. Siga o checklist de reposição.");
  await noDialog();
  await db(account(3, "a.status || '|' || a.email || '|' || a.proxy"), "aquecendo|frasalvio.conta3@exemplo.com|it-res-03.exemplo.net:8000", "a 3ª geração é criada");
  await db(doneOf(3), "email,perfil,proxy,celular,aquecimento", "o checklist já nasce com o que os dados da conta respondem (e-mail, perfil, proxy, celular, aquecimento)");
  assert(psql("select count(*) from public.warmups w join public.accounts a on a.id = w.account_id where a.generation = 3 and w.finished_at is null") === "1", "com o calendário de aquecimento criado");
  assert(psql("select count(*) from public.activity_log where message = 'Conta criada (3ª geração) no lugar da 2ª geração, que caiu'") === "1", "a linha do tempo diz que ela entrou no lugar da que caiu");
  // o reuso confirmado não vira aviso em aberto: fica nos dispensados
  await db("select count(*)::text from public.settings, jsonb_array_elements_text(prefs->'ignored_warnings') as id where id like 'caida:%:celular:%'", "1", "o reuso que você confirmou já nasce como aviso dispensado");

  // ---------------------------------------------------------------
  section("Checklist de reposição, com o kit ao lado de cada passo");
  await page.getByRole("heading", { name: "Checklist de reposição" }).waitFor();
  await page.getByText("5 de 9 feitos").waitFor();
  const item = (label) => page.getByRole("checkbox", { name: label, exact: true });
  const row = (label) => page.locator("li", { has: item(label) });
  assert((await item("Criar o e-mail").getAttribute("aria-checked")) === "true" && (await item("Bio").getAttribute("aria-checked")) === "false", "os itens respondidos pela conta vêm marcados; os outros, não");
  await row("Criar o e-mail").getByText("frasalvio.conta3@exemplo.com").waitFor();
  await row("Bio").getByText(/Frate erborista/).waitFor();
  await row("Destaques").getByText(/Chi sono/).waitFor();
  await row("Provas sociais").getByText(/Prova social 1/).waitFor();
  ok("cada passo mostra o que o kit de reposição tem para ele");
  await row("Bio").getByRole("button", { name: "Copiar" }).nth(1).click();
  await toast("Bio copiada");
  assert((await clipboard()).startsWith("Frate erborista 🌿"), "copiar leva a bio do kit para colar no Instagram");
  await overflow("Conta atual (com checklist)");
  await shot("e15-checklist");
  await item("Bio").click();
  await db(doneOf(3), "email,perfil,proxy,celular,bio,aquecimento", "tocar num passo marca como feito");
  await page.getByText("6 de 9 feitos").waitFor();
  await item("Bio").click();
  await db(doneOf(3), "email,perfil,proxy,celular,aquecimento", "tocar de novo desmarca");
  for (const label of ["Bio", "Link da bio", "Destaques"]) {
    await item(label).click();
    await page.waitForFunction((name) => [...document.querySelectorAll('[role="checkbox"]')].find((el) => el.textContent.trim() === name)?.getAttribute("aria-checked") === "true", label);
  }
  await db(doneOf(3), "email,perfil,proxy,celular,bio,link,destaques,aquecimento", "três passos marcados em sequência (nenhum atropela o outro)");
  // o que falta aparece no aviso da tela Hoje
  await goToday();
  await page.getByText("Falta 1 item do checklist: Provas sociais.").waitFor();
  assert((await page.getByText(/usa um celular de conta que caiu/).count()) === 0, "o reuso confirmado não aparece entre os avisos em aberto");
  await page.getByRole("button", { name: /aviso dispensado · mostrar|avisos dispensados · mostrar/ }).click();
  await page.getByRole("list", { name: "Avisos dispensados" }).getByText("@fra.salvio usa um celular de conta que caiu").waitFor();
  ok("mas continua à mão nos dispensados");
  await page.getByRole("link", { name: /reposição em andamento/ }).click();
  await page.getByRole("heading", { name: "Checklist de reposição" }).waitFor();
  await item("Provas sociais").click();
  await page.getByText("Tudo feito: a conta nova está no ar.").waitFor();
  await db("select count(*)::text from public.activity_log e join public.accounts a on a.id = e.account_id where a.generation = 3 and e.kind = 'reposicao_concluida'", "1", "completar o checklist entra na linha do tempo");
  await page.getByRole("button", { name: "Concluir", exact: true }).click();
  await toast("Reposição concluída");
  await db(account(3, "a.checklist is null"), "true", "“Concluir” guarda o checklist");
  assert((await page.getByRole("heading", { name: "Checklist de reposição" }).count()) === 0, "e ele sai da tela");

  // preencher a conta marca o checklist sozinho (conta nova com tudo em branco)
  psql(`update public.accounts set checklist = '[{"key":"email","label":"Criar o e-mail","done":false},{"key":"proxy","label":"Novo proxy","done":false},{"key":"bio","label":"Bio","done":false}]'::jsonb, email = null, proxy = null where handle = 'fra.salvio' and generation = 3`);
  await page.reload();
  await page.getByRole("heading", { name: "Checklist de reposição" }).waitFor({ timeout: 30000 });
  await page.getByText("0 de 3 feitos").waitFor();
  await page.getByRole("button", { name: "Editar", exact: true }).click();
  await field("E-mail da conta").fill("outro3@exemplo.com");
  await save();
  await toast("Conta atualizada");
  await noDialog();
  await db(doneOf(3), "email", "anotar o e-mail na conta marca “Criar o e-mail” sozinho");
  await page.getByRole("button", { name: "Dispensar", exact: true }).click();
  await dialog().getByText("Dispensar o checklist?").waitFor();
  await dialog().getByText(/faltam 2 itens/).waitFor();
  await dialog().getByRole("button", { name: "Dispensar", exact: true }).click();
  await toast("Checklist dispensado");
  await db(account(3, "a.checklist is null"), "true", "checklist incompleto pode ser dispensado (com confirmação)");

  // ---------------------------------------------------------------
  section("Deixar a conta nova para depois");
  await page.getByLabel("Status da conta").selectOption("caida");
  await dialog().getByRole("heading", { name: "Conta caiu" }).waitFor();
  ok("escolher “Caída” no status abre o mesmo caminho");
  await field("Motivo provável").fill("Denúncias");
  await save("Confirmar queda");
  await toast("Conta marcada como caída");
  await dialog().getByRole("heading", { name: "Nova conta" }).waitFor();
  await dialog().getByRole("button", { name: "Cancelar" }).click();
  await noDialog();
  await page.getByText("Nenhuma conta ativa").waitFor();
  await page.getByText(/Suba uma nova geração para continuar: ela já vem com o mesmo @ e com o checklist de reposição\./).waitFor();
  assert(psql("select count(*) from public.accounts where handle = 'fra.salvio'") === "3", "nenhuma conta é criada ao cancelar");
  await goToday();
  await page.getByRole("link", { name: /Fra' Salvio está sem conta em operação/ }).waitFor();
  await page.getByText("A última conta caiu. Suba uma nova geração para continuar.").waitFor();
  ok("a tela Hoje avisa que o avatar ficou sem conta");
  await page.getByRole("link", { name: /Fra' Salvio está sem conta em operação/ }).click();
  await page.getByRole("button", { name: /Nova conta \(4ª geração\)/ }).click();
  await dialog().getByText(/Passo 2 de 2 · Reposição de @fra\.salvio \(3ª geração\)/).waitFor();
  ok("o aviso leva de volta à criação da conta, ainda no lugar da que caiu");
  await dialog().getByRole("button", { name: "Cancelar" }).click();
  await noDialog();

  // ---------------------------------------------------------------
  section("Editar uma conta: só o que foi trocado pede confirmação");
  await goToday();
  await page.getByRole("link", { name: /@nonna\.maria usa um proxy de conta que caiu/ }).click();
  await page.getByRole("heading", { name: "Nonna Maria" }).waitFor();
  await page.locator("p", { hasText: "@nonna.maria usa um proxy de conta que caiu" }).waitFor();
  ok("o risco em aberto também aparece na própria conta");
  await page.getByRole("button", { name: "Editar", exact: true }).click();
  await dialog().getByText("Este proxy foi usado por conta que caiu").waitFor();
  assert((await dialog().getByRole("checkbox", { name: /^Reutilizar/ }).count()) === 0, "o proxy que a conta já tinha não pede confirmação de novo");
  await field("Anotações").fill("Só uma anotação");
  await save();
  await toast("Conta atualizada");
  await noDialog();
  await page.getByRole("button", { name: "Editar", exact: true }).click();
  await field("Celular").selectOption({ label: "Celular A (Samsung Galaxy A15) · usado por conta caída" });
  await save();
  await dialog().getByRole("alert").filter({ hasText: "Você escolheu o celular de uma conta que caiu" }).waitFor();
  ok("trocar para um celular de conta caída pede a confirmação também na edição");
  await dialog().getByRole("button", { name: "Cancelar" }).click();
  await noDialog();

  // ---------------------------------------------------------------
  section("Quedas: tempo médio de vida por país e por motivo");
  await goToday();
  await page.getByRole("link", { name: /Caídas: 3\. Ver as quedas/ }).click();
  await page.getByRole("heading", { name: "Quedas", exact: true }).waitFor();
  ok("o contador de caídas da tela Hoje abre a tela de quedas");
  const lifetimes = psql("select string_agg((fell_on - created_on)::text, ',' order by generation) from public.accounts where status = 'caida'").split(",").map(Number);
  const average = Math.round(Math.round((lifetimes.reduce((sum, days) => sum + days, 0) / lifetimes.length) * 10) / 10);
  const tile = (label) => page.locator("li", { has: page.getByText(label, { exact: true }) }).first();
  await tile("Contas que caíram").getByText("3", { exact: true }).waitFor();
  await tile("Contas que caíram").getByText("de 4 contas cadastradas").waitFor();
  await tile("Últimos 30 dias").getByText("3", { exact: true }).waitFor();
  await tile("Tempo médio de vida").getByText(`${average} dias`, { exact: true }).waitFor();
  ok(`três contas caíram, vivendo em média ${average} dias (${lifetimes.join(", ")} dias)`);
  const byCountry = page.getByRole("list", { name: "Tempo médio de vida das contas por país" }).getByRole("listitem");
  assert((await byCountry.count()) === 1 && /Itália/.test(await byCountry.first().innerText()) && /3 contas/.test(await byCountry.first().innerText()), "por país: Itália, com as 3 contas");
  const byReason = page.getByRole("list", { name: "Tempo médio de vida das contas por motivo da queda" }).getByRole("listitem");
  const reasons = await byReason.allInnerTexts();
  assert(reasons.length === 3 && /Seguiu gente demais/.test(reasons[0]) && /2 meses e 9 dias/.test(reasons[0]), "por motivo: do que mais durou (2 meses e 9 dias) para o que menos durou");
  const history = page.locator("li", { has: page.getByText(/^Viveu /) });
  assert((await history.count()) === 3, "a lista mostra as 3 contas que caíram");
  assert(/3ª geração/.test(await history.first().innerText()) && /Denúncias/.test(await history.first().innerText()), "da queda mais recente para a mais antiga, com o motivo");
  await overflow("Quedas");
  await shot("e16-quedas");
  await history.first().getByRole("link").click();
  await page.getByRole("heading", { name: "Fra' Salvio" }).waitFor();
  await page.getByRole("tab", { name: /^Histórico/, selected: true }).waitFor();
  ok("tocar numa conta abre o histórico do avatar");
  await page.getByRole("button", { name: "Mais", exact: true }).click();
  await page.locator("dialog[open]").getByRole("link", { name: "Quedas de contas" }).click();
  await noDialog();
  await page.getByRole("heading", { name: "Quedas", exact: true }).waitFor();
  ok("a tela também fica no menu “Mais”");

  resetData();
  await finish(session);
})().catch(fail);
