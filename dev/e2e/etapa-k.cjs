// Teste de ponta a ponta das TAREFAS: as do dono (adicionar rápido, datas, repetição,
// concluir, editar) e as que o painel sugere a partir do que está registrado
// (estrutura, aquecimento, reposição, vídeos) — concluir uma delas marca a coisa de verdade.
//
//   node dev/e2e/etapa-k.cjs      (com o app rodando em http://localhost:3000)
const { chromium } = require("playwright");
const { mkdtempSync, readFileSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { BASE, USER, psql, resetData, ok, section, assert, openPhone, finish, fail } = require("./helpers.cjs");

const root = join(__dirname, "..", "..");
const API = "http://localhost:54321";
const stackEnv = Object.fromEntries(
  readFileSync(join(root, "dev", "supabase-local", ".env"), "utf8")
    .split("\n")
    .filter((line) => line.includes("="))
    .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)]),
);
const ANON = stackEnv.ANON_KEY;

// O navegador do teste está em UTC, como o banco local: "hoje" é o mesmo dia para os dois.
const iso = (days) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);

// Espera o banco chegar a um valor (as gravações da tela levam alguns instantes).
async function db(sql, expected, message) {
  let value = "";
  for (let i = 0; i < 60; i++) {
    value = psql(sql);
    if (value === expected) break;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  assert(value === expected, `${message}${value === expected ? "" : ` (banco: “${value}”, esperado: “${expected}”)`}`);
}

// (o valor sempre como texto)
const task = (title, column) => `select coalesce((select (${column})::text from public.tasks where title = '${title.replace(/'/g, "''")}'), 'nada')`;

async function login(email, password) {
  const response = await fetch(`${API}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON, "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const body = await response.json();
  if (!body.access_token) throw new Error(`login de ${email} falhou: ${JSON.stringify(body)}`);
  return body.access_token;
}

/** Espera a API do Supabase enxergar (ou deixar de enxergar) a tabela. */
async function waitForTable(token, present) {
  for (let i = 0; i < 80; i++) {
    const response = await fetch(`${API}/rest/v1/tasks?select=id&limit=1`, { headers: { apikey: ANON, authorization: `Bearer ${token}` } });
    if ((response.status === 200) === present) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`a API não ${present ? "voltou a ver" : "deixou de ver"} a tabela`);
}

(async () => {
  resetData();
  const temp = mkdtempSync(join(tmpdir(), "cda-tarefas-"));
  const session = await openPhone(chromium, { timezoneId: "UTC", acceptDownloads: true });
  const { page, dialog, shot, toast, save, noDialog, overflow, more } = session;
  await session.login();
  const uid = psql(`select id from auth.users where email = '${USER.email}'`);
  const token = await login(USER.email, USER.password);
  const fra = psql("select id from public.avatars where name = 'Fra'' Salvio'");
  const today = iso(0);
  const tomorrow = iso(1);

  // só o que está à mostra (as telas visitadas ficam montadas, escondidas, com campos de mesmo nome)
  const control = (label) => page.locator(`[aria-label="${label}"]:visible`);
  const input = () => control("Nova tarefa");
  const understood = () => page.locator('[aria-label="O que o painel entendeu"]:visible');
  const view = (name) => page.getByRole("radiogroup", { name: "Mostrar" }).getByRole("radio", { name, exact: true });
  const edit = (title) => page.getByRole("button", { name: `Editar: ${title}`, exact: true });
  const check = (title) => page.getByRole("checkbox", { name: `Concluir: ${title}`, exact: true });
  const openTasks = async () => {
    await more("Tarefas");
    await input().or(page.getByRole("button", { name: "Já rodei" })).first().waitFor();
  };
  const reloadTasks = async () => {
    await page.goto(`${BASE}/tarefas`);
    await input().waitFor({ timeout: 30000 });
  };

  // ---------------------------------------------------------------
  section("Banco ainda sem a tabela das tarefas: o painel funciona, e a tela ensina a rodar o script");
  psql("alter table public.tasks rename to tasks_desligada; notify pgrst, 'reload schema'");
  // (enquanto a tabela não existe, cada carregamento pergunta por ela e recebe 404 — o navegador anota no console)
  const quietFrom = session.problems.length;
  try {
    await waitForTable(token, false);
    await page.reload();
    await page.getByRole("heading", { name: "Hoje", exact: true }).waitFor({ timeout: 30000 });
    assert((await page.getByText("Falta preparar o banco").count()) === 0, "a tela Hoje abre normalmente (a tabela nova não é obrigatória)");
    await page.getByText("Tarefas (novidade)").waitFor();
    ok("e convida a atualizar o banco para usar as tarefas");
    await page.getByText("Tarefas (novidade)").click();
    await page.getByRole("heading", { name: "Falta atualizar o banco (uma vez só)" }).waitFor();
    await page.getByRole("button", { name: "Copiar script SQL" }).waitFor();
    ok("a tela Tarefas mostra o passo a passo do script, com o botão de copiar");
    await overflow("o passo a passo");
    await shot("k10-falta-o-script");
    await page.getByRole("button", { name: "Já rodei" }).click();
    await toast("Ainda não encontrei a parte nova do banco");
    await page.goto(`${BASE}/avatar?id=${fra}`);
    await page.getByRole("heading", { name: "Estrutura", exact: true }).waitFor({ timeout: 30000 });
    assert((await page.getByRole("heading", { name: "Tarefas", exact: true }).count()) === 0, "a página do avatar não mostra as tarefas enquanto o banco não tem a tabela");
  } finally {
    psql("alter table public.tasks_desligada rename to tasks; notify pgrst, 'reload schema'");
  }
  await waitForTable(token, true);
  await openTasks();
  await page.getByRole("button", { name: "Já rodei" }).click();
  await input().waitFor();
  const expected = session.problems.splice(quietFrom).filter((text) => !/status of 404/.test(text));
  assert(expected.length === 0, `nesse meio-tempo, nenhum outro problema no console${expected.length ? `: ${expected.join(" | ")}` : ""}`);
  ok("rodado o script, “Já rodei” abre a tela de verdade");

  // ---------------------------------------------------------------
  section("Adicionar rápido: a frase vira data, horário, prioridade, avatar e repetição");
  await input().fill("Gravar vídeos amanhã 14h p1 #salvio");
  await understood().getByText("Amanhã", { exact: true }).waitFor();
  await understood().getByText("14:00", { exact: true }).waitFor();
  await understood().getByText("Urgente (P1)", { exact: true }).waitFor();
  await understood().getByText("🇮🇹 Fra' Salvio", { exact: true }).waitFor();
  ok("enquanto escreve, a tela mostra o que entendeu");
  await shot("k20-entendeu");
  await input().press("Enter");
  await toast("Tarefa adicionada: Amanhã 14:00");
  await db(
    task("Gravar vídeos", `due_date || '|' || due_time || '|' || priority || '|' || (avatar_id = '${fra}')`),
    `${tomorrow}|14:00|1|true`,
    "fica guardada com o título limpo, a data, o horário, a prioridade e o avatar",
  );
  assert((await input().inputValue()) === "", "o campo fica vazio para a próxima");

  await input().fill("Ligar para o fornecedor sexta");
  await understood().getByRole("button", { name: "Não usar como data" }).click();
  await understood().getByText("Hoje", { exact: true }).waitFor();
  ok("o X tira a data da frase (fica a de hoje, por estar na lista de hoje)");
  await page.getByRole("button", { name: "Adicionar tarefa" }).click();
  await toast("Tarefa adicionada: Hoje");
  await db(task("Ligar para o fornecedor sexta", "due_date"), today, "e o “sexta” fica no título");

  await input().fill("amanhã");
  await input().press("Enter");
  await toast("Escreva o que fazer (além da data).");
  assert(psql("select count(*) from public.tasks") === "2", "sem o que fazer, nada é guardado");

  // sem internet na hora de gravar: o campo esvaziou na hora, mas a frase volta (com o que foi entendido)
  const offlineFrom = session.problems.length;
  await page.route("**/rest/v1/tasks*", (route) => (route.request().method() === "POST" ? route.abort("internetdisconnected") : route.continue()));
  await input().fill("Comprar o domínio p3");
  await input().press("Enter");
  await toast("Sem conexão com o servidor");
  await page.waitForFunction(() => [...document.querySelectorAll('[aria-label="Nova tarefa"]')].some((element) => element.value === "Comprar o domínio p3"));
  await understood().getByText("Média (P3)", { exact: true }).waitFor();
  ok("sem conexão, nada se perde: a frase volta para o campo");
  await page.unroute("**/rest/v1/tasks*");
  const offlineProblems = session.problems.splice(offlineFrom).filter((text) => !/ERR_INTERNET_DISCONNECTED/.test(text));
  assert(offlineProblems.length === 0, `(nenhum outro problema no console${offlineProblems.length ? `: ${offlineProblems.join(" | ")}` : ""})`);
  await input().fill("");

  await input().fill("Responder directs todo dia p2");
  await understood().getByText("Todo dia", { exact: true }).waitFor();
  await input().press("Enter");
  await toast("Tarefa adicionada: Hoje");
  await db(task("Responder directs", "recurrence || '|' || due_date || '|' || priority"), `diaria|${today}|2`, "“todo dia” vira repetição diária, começando hoje");
  await overflow("a lista de hoje");

  // ---------------------------------------------------------------
  section("As listas: Hoje, Em breve, Todas");
  await edit("Ligar para o fornecedor sexta").waitFor();
  await edit("Responder directs").waitFor();
  assert((await edit("Gravar vídeos").count()) === 0, "a de amanhã não aparece em Hoje");
  await page.getByText("Todo dia", { exact: true }).waitFor();
  ok("a que se repete mostra o “Todo dia”");
  await shot("k30-hoje");
  await view("Em breve").click();
  await page.getByRole("heading", { name: /^Amanhã · / }).waitFor();
  await edit("Gravar vídeos").waitFor();
  ok("Em breve: a de amanhã, embaixo do dia");
  await view("Todas").click();
  await page.getByRole("heading", { name: "Gerais", exact: true }).waitFor();
  await page.getByRole("heading", { name: "🇮🇹 Fra' Salvio", exact: true }).waitFor();
  await edit("Gravar vídeos").waitFor();
  ok("Todas: por avatar (as gerais primeiro)");
  await control("Avatar").selectOption({ label: "Só as gerais" });
  assert((await edit("Gravar vídeos").count()) === 0 && (await edit("Responder directs").count()) === 1, "o filtro “Só as gerais” esconde as do avatar");
  await control("Avatar").selectOption({ label: "Avatar: todos" });

  // ---------------------------------------------------------------
  section("Concluir, desfazer, e a que se repete");
  await view("Hoje").click();
  await check("Ligar para o fornecedor sexta").click();
  await toast("Tarefa concluída");
  await db(task("Ligar para o fornecedor sexta", "completed_at is not null"), "true", "concluir guarda a hora em que foi feita");
  await check("Ligar para o fornecedor sexta").waitFor({ state: "detached" });
  ok("e ela sai da lista de hoje");
  await view("Feitas").click();
  await page.getByText("feita hoje").waitFor();
  await page.getByRole("checkbox", { name: "Desfazer: Ligar para o fornecedor sexta" }).click();
  await toast("Tarefa de volta à lista");
  await db(task("Ligar para o fornecedor sexta", "completed_at is null"), "true", "desfazer devolve a tarefa");
  await view("Hoje").click();
  await check("Responder directs").click();
  await toast("Feita! Próxima vez: Amanhã");
  await db(task("Responder directs", "due_date || '|' || (completed_at is null)"), `${tomorrow}|true`, "a que se repete não fica feita: a data anda para a próxima vez");

  // ---------------------------------------------------------------
  section("Editar, criar com detalhes e apagar");
  await view("Todas").click();
  await edit("Gravar vídeos").click();
  await dialog().getByRole("heading", { name: "Editar tarefa" }).waitFor();
  await dialog().getByRole("radio", { name: "Alta", exact: true }).click();
  await dialog().getByLabel("Repetir").selectOption({ label: "Toda semana" });
  await dialog().getByLabel("Descrição").fill("Três vídeos: horta, chá e bastidores.");
  await save();
  await toast("Tarefa salva");
  await noDialog();
  await db(task("Gravar vídeos", "priority || '|' || recurrence || '|' || notes || '|' || due_time"), "2|semanal|Três vídeos: horta, chá e bastidores.|14:00", "editar guarda prioridade, repetição e descrição (o resto continua)");

  await page.getByRole("button", { name: "Detalhada" }).click();
  await dialog().getByRole("heading", { name: "Nova tarefa" }).waitFor();
  await save();
  await dialog().getByText("Escreva o que fazer.").waitFor();
  ok("sem o que fazer, a janela avisa");
  await dialog().getByLabel("O que fazer").fill("Revisar o checkout");
  await dialog().getByLabel("Avatar").selectOption({ label: "🇮🇹 Fra' Salvio" });
  // a conta de exemplo está aquecendo: hoje é dia de uso e amanhã, de descanso
  await dialog().getByRole("button", { name: /^Descanso da conta \(/ }).click();
  assert((await dialog().getByLabel("Data").inputValue()) === tomorrow, "“Descanso da conta” põe a data no próximo dia de descanso dela");
  await save();
  await toast("Tarefa adicionada");
  await noDialog();
  await db(task("Revisar o checkout", `due_date || '|' || (avatar_id = '${fra}')`), `${tomorrow}|true`, "a tarefa detalhada fica guardada");

  await edit("Revisar o checkout").click();
  await dialog().getByRole("button", { name: "Apagar" }).click();
  await dialog().getByText("Esta ação não pode ser desfeita.").waitFor();
  await dialog().getByRole("button", { name: "Apagar", exact: true }).click();
  await toast("Tarefa apagada");
  await db("select count(*) from public.tasks where title = 'Revisar o checkout'", "0", "apagar tira a tarefa do banco");
  await noDialog();

  // ---------------------------------------------------------------
  section("Atrasadas");
  psql(`insert into public.tasks (user_id, title, due_date, priority) values ('${uid}', 'Pagar o domínio', '${iso(-2)}', 1)`);
  await reloadTasks();
  await page.getByRole("heading", { name: "Atrasadas", exact: true }).waitFor();
  await page.getByText("(atrasada)").waitFor();
  ok("a tarefa de anteontem aparece em Atrasadas");
  await page.getByRole("button", { name: "Passar para hoje" }).click();
  await toast("Atrasadas passadas para hoje");
  await db(task("Pagar o domínio", "due_date"), today, "“Passar para hoje” muda a data");
  assert((await page.getByRole("heading", { name: "Atrasadas", exact: true }).count()) === 0, "e a seção some");

  // ---------------------------------------------------------------
  section("Do painel: o uso do dia e a reposição (concluir aqui marca lá)");
  // dados de exemplo: a conta nova do Fra' Salvio está no dia 5 do aquecimento (dia de uso, 20 min) e o
  // checklist de reposição dela ainda tem dois passos; a estrutura só falta a automação
  await check("Usar @fra.salvio por 20 min").waitFor();
  await check("Reposição: Destaques").waitFor();
  await check("Reposição: Provas sociais").waitFor();
  assert((await check("Montar a automação").count()) === 0, "a estrutura (com prazo no fim do aquecimento) não entra em Hoje num dia de uso");
  await shot("k40-do-painel");
  await check("Usar @fra.salvio por 20 min").click();
  await toast("Feito — marcado no painel");
  await db(
    "select d ->> 'done' from public.warmups w, jsonb_array_elements(w.days) d where (d ->> 'n')::int = 5",
    "true",
    "concluir o uso marca o dia no calendário de aquecimento",
  );
  await check("Usar @fra.salvio por 20 min").waitFor({ state: "detached" });
  await check("Reposição: Destaques").click();
  await toast("Feito — marcado no painel");
  await db(
    "select string_agg(i ->> 'key', ',') from public.accounts a, jsonb_array_elements(a.checklist) i where (i ->> 'done')::boolean is not true",
    "provas",
    "concluir o passo da reposição marca o checklist da conta",
  );
  await view("Em breve").click();
  const end = iso(5);
  await page.getByRole("heading", { name: new RegExp(`${end.slice(8, 10)}/${end.slice(5, 7)}$`) }).waitFor();
  await check("Montar a automação").waitFor();
  ok("a automação aparece em Em breve, no dia em que o aquecimento termina");

  // ---------------------------------------------------------------
  section("Dia de descanso: a dica do dia e a sugestão de data");
  // o calendário anda um dia para trás: hoje passa a ser dia de descanso da conta
  psql(
    "update public.warmups set start_date = start_date - 1, days = (select jsonb_agg(d || jsonb_build_object('date', ((d ->> 'date')::date - 1)::text, 'done', ((d ->> 'use')::boolean and (d ->> 'date')::date - 1 < current_date)) order by (d ->> 'n')::int) from jsonb_array_elements(days) d)",
  );
  await reloadTasks();
  await page.getByText(/Dica do dia:/).waitFor();
  await page.getByText(/Fra' Salvio descansa — bom dia para adiantar a estrutura/).waitFor();
  await check("Montar a automação").waitFor();
  await page.getByText(/@fra\.salvio descansa hoje: bom dia para adiantar/).waitFor();
  ok("num dia de descanso, a estrutura entra em Hoje, com a dica do dia");
  await overflow("a dica do dia");
  await shot("k50-descanso");
  await input().fill("Escrever o e-mail de boas-vindas #salvio");
  await understood().getByRole("button", { name: /^Sugestão: .* \(@fra\.salvio descansa\)$/ }).click();
  await input().press("Enter");
  await toast("Tarefa adicionada");
  // depois do descanso de hoje (dia 6) vem o uso (7) e o próximo descanso (8): depois de amanhã
  await db(task("Escrever o e-mail de boas-vindas", `due_date || '|' || (avatar_id = '${fra}')`), `${iso(2)}|true`, "a sugestão põe a tarefa no próximo dia de descanso da conta");
  await check("Montar a automação").click();
  await toast("Feito — marcado no painel");
  await db(`select kit -> 'structure' ->> 'automacao' from public.avatars where id = '${fra}'`, "true", "concluir marca o passo na estrutura do avatar");
  await page.getByText(/Dica do dia:/).waitFor({ state: "detached" });
  ok("com a estrutura completa, a dica some");

  // ---------------------------------------------------------------
  section("Vídeos para modelar e o atalho para o lugar de cada coisa");
  await view("Todas").click();
  await control("Avatar").selectOption({ label: "🇮🇹 Fra' Salvio" });
  await check("Modelar o vídeo: Receita de chá em 30 segundos").click();
  await toast("Feito — marcado no painel");
  await db(
    `select string_agg(v ->> 'status', ',' order by v ->> 'label') from public.avatars a, jsonb_array_elements(a.model_videos) v where a.id = '${fra}'`,
    "modelado,a_modelar,modelado",
    "concluir o vídeo o marca como modelado",
  );
  await page.getByRole("link", { name: "Abrir: Modelar o vídeo: Frade mostrando a horta (gancho forte nos 3 primeiros segundos)" }).click();
  await page.waitForURL(/\/avatar\?id=.*&aba=videos/);
  ok("o atalho abre a aba de vídeos do avatar");

  // ---------------------------------------------------------------
  section("Tela Hoje e página do avatar");
  await page.goto(`${BASE}/`);
  await page.getByRole("heading", { name: "Minhas tarefas", exact: true }).waitFor({ timeout: 30000 });
  await edit("Pagar o domínio").waitFor();
  await edit("Ligar para o fornecedor sexta").waitFor();
  assert((await edit("Gravar vídeos").count()) === 0, "a tela Hoje mostra as minhas tarefas de hoje (e só elas)");
  await input().fill("Conferir os proxies");
  await input().press("Enter");
  await toast("Tarefa adicionada: Hoje");
  await db(task("Conferir os proxies", "due_date || '|' || coalesce(avatar_id::text, 'geral')"), `${today}|geral`, "o campo da tela Hoje anota para hoje");
  await overflow("a tela Hoje");
  await shot("k60-tela-hoje");
  await page.getByRole("link", { name: /^Ver (a sugestão|as \d+ sugestões) do painel$/ }).click();
  await page.getByRole("heading", { name: "Tarefas", exact: true }).waitFor();
  ok("o atalho “Ver as … sugestões do painel” abre a tela Tarefas");

  await page.goto(`${BASE}/avatar?id=${fra}`);
  await page.getByRole("heading", { name: "Tarefas", exact: true }).waitFor({ timeout: 30000 });
  await edit("Gravar vídeos").waitFor();
  await input().fill("Revisar a bio");
  await input().press("Enter");
  await toast("Tarefa adicionada");
  await db(task("Revisar a bio", `coalesce(due_date::text, 'sem data') || '|' || (avatar_id = '${fra}')`), "sem data|true", "na página do avatar, a tarefa já nasce dele");
  await overflow("a página do avatar");
  await page.getByRole("link", { name: "Ver todas", exact: true }).click();
  await page.waitForURL(`${BASE}/tarefas`);
  await edit("Revisar a bio").waitFor();
  assert((await control("Avatar").inputValue()) === fra, "“Ver todas” leva para a tela Tarefas já filtrada pelo avatar");
  assert((await view("Todas").getAttribute("aria-checked")) === "true", "na lista Todas");

  // ---------------------------------------------------------------
  section("Backup: as tarefas vão no arquivo e voltam ao restaurar");
  await page.goto(`${BASE}/configuracoes`);
  await page.getByRole("heading", { name: "Backup", exact: true }).waitFor({ timeout: 30000 });
  const [backupDownload] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Baixar backup" }).click()]);
  const backup = JSON.parse(readFileSync(await backupDownload.path(), "utf8"));
  const count = Number(psql("select count(*) from public.tasks"));
  assert(backup.tables.tasks.length === count && backup.tables.tasks.every((entry) => !("user_id" in entry)), `o backup leva as ${count} tarefas (sem o dono da linha)`);
  const backupFile = join(temp, "backup.json");
  writeFileSync(backupFile, JSON.stringify(backup));
  await page.getByLabel("Arquivo de backup para restaurar").setInputFiles(backupFile);
  await dialog().getByRole("heading", { name: "Restaurar backup" }).waitFor();
  await dialog().getByText(`${count} tarefas`, { exact: true }).waitFor();
  ok("a janela de restaurar conta as tarefas");
  await dialog().getByRole("button", { name: "Cancelar", exact: true }).click();
  await noDialog();
  const restore = async (file) => {
    const response = await fetch(`${API}/rest/v1/rpc/cda_restore_backup`, {
      method: "POST",
      headers: { apikey: ANON, authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ backup: file }),
    });
    assert(response.status < 300, `(restauração aceita: ${response.status})`);
  };
  // backup sem a lista (feito antes de ela existir): as tarefas de agora ficam, cada uma no seu avatar
  const { tasks: _dropped, ...oldTables } = backup.tables;
  await restore({ ...backup, tables: oldTables });
  assert(psql("select count(*) from public.tasks") === String(count), "backup antigo (sem a lista): as tarefas de agora continuam");
  assert(psql(task("Gravar vídeos", `avatar_id = '${fra}'`)) === "true", "e continuam ligadas ao avatar (que voltou com o backup)");
  // backup com a lista: troca pelo que está nele
  psql("delete from public.tasks where title = 'Pagar o domínio'");
  await restore(backup);
  assert(psql(task("Pagar o domínio", "due_date || '|' || priority")) === `${today}|1`, "backup com a lista: a tarefa apagada volta");
  const [sheetsDownload] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Baixar planilhas" }).click()]);
  const zip = readFileSync(await sheetsDownload.path());
  assert(zip.includes(Buffer.from("tarefas.csv")) && zip.includes(Buffer.from("Pagar o domínio")), "as planilhas têm o tarefas.csv");

  // ---------------------------------------------------------------
  section("Apagar o avatar: as tarefas dele ficam, como gerais");
  await page.goto(`${BASE}/avatar?id=${fra}`);
  await page.getByRole("button", { name: "Apagar avatar" }).click();
  await dialog().getByText(/As tarefas dele continuam guardadas, como gerais\./).waitFor();
  await dialog().getByRole("textbox").fill("Fra' Salvio");
  await dialog().getByRole("button", { name: "Apagar avatar" }).click();
  await page.getByRole("heading", { name: "Países", exact: true }).waitFor({ timeout: 30000 });
  await db("select count(*) from public.tasks where avatar_id is not null", "0", "apagar o avatar deixa as tarefas dele guardadas, como gerais");
  await openTasks();
  await view("Todas").click();
  await edit("Gravar vídeos").waitFor();
  assert((await page.getByRole("heading", { name: "🇮🇹 Fra' Salvio", exact: true }).count()) === 0, "e a tela mostra todas como gerais");

  rmSync(temp, { recursive: true, force: true });
  resetData();
  await finish(session);
})().catch(fail);
