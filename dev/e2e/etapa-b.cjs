// Teste de ponta a ponta da ETAPA (b): aquecimento e tarefas do dia na tela Hoje.
//
//   node dev/e2e/etapa-b.cjs      (com o app rodando em http://localhost:3000)
const { chromium } = require("playwright");
const { BASE, psql, resetData, ok, section, assert, openPhone, finish, fail } = require("./helpers.cjs");

// Move todas as datas do calendário de exemplo (dias negativos = para o passado).
const shiftExample = (days) =>
  psql(
    `update public.warmups set days = (select jsonb_agg(jsonb_set(d, '{date}', to_jsonb(((d->>'date')::date + (${days}))::text)) order by (d->>'n')::int) from jsonb_array_elements(days) d) where is_example`,
  );
const exampleDay = (n, field) => psql(`select d->>'${field}' from public.warmups w, jsonb_array_elements(w.days) d where w.is_example and (d->>'n')::int = ${n}`);

(async () => {
  resetData(); // o primeiro login recria os exemplos, já com um aquecimento em andamento
  // O navegador do teste usa o fuso UTC, igual ao banco: assim "hoje" é o mesmo dia nos dois lados.
  const session = await openPhone(chromium, { timezoneId: "UTC" });
  const { page, dialog, shot, toast, save, noDialog, overflow, more } = session;
  await session.login();

  // ---------------------------------------------------------------
  section("Hoje: tarefa do dia com botão “feito”");
  await page.getByRole("heading", { name: "Para fazer hoje" }).waitFor();
  const card = page.locator("li", { hasText: "dia 5 de 10" }).first();
  await card.getByText("20 min").waitFor();
  await card.getByText("Celular B (Xiaomi Redmi 13C)").waitFor();
  await card.getByText("Perfil 102 — Fra' Salvio IT — 2ª conta").waitFor();
  ok("mostra a conta, os minutos, o celular e o perfil anti-detect");
  await page.getByText("1 de 1 por fazer").waitFor();
  await overflow("Hoje");
  await shot("b10-hoje");
  await card.getByRole("button", { name: "Feito", exact: true }).click();
  await card.getByRole("button", { name: "Desfazer" }).waitFor();
  await page.getByText("tudo feito").waitFor();
  await page.waitForTimeout(500);
  assert(exampleDay(5, "done") === "true", "“Feito” grava o dia 5 como feito");
  await card.getByRole("button", { name: "Desfazer" }).click();
  await card.getByRole("button", { name: "Feito", exact: true }).waitFor();
  await page.waitForTimeout(500);
  assert(exampleDay(5, "done") === "false", "“Desfazer” desmarca o dia");

  // ---------------------------------------------------------------
  section("Países: barra de progresso no cartão do avatar");
  await page.getByRole("link", { name: "Países" }).click();
  await page.getByRole("heading", { name: "Países", exact: true }).waitFor();
  await page.getByText("Aquecimento · Dia 5 de 10").waitFor();
  assert((await page.getByRole("progressbar").getAttribute("aria-valuenow")) === "40", "barra em 40% (2 de 5 usos feitos)");

  // ---------------------------------------------------------------
  section("Aba Aquecimento: calendário, editar dia e duração");
  await page.getByRole("link", { name: /Fra' Salvio/ }).click();
  await page.getByRole("heading", { name: "Fra' Salvio" }).waitFor();
  await page.getByRole("tab", { name: /^Aquecimento/ }).click();
  await page.getByRole("heading", { name: "Calendário" }).waitFor();
  assert((await page.getByRole("button", { name: /^Editar o dia \d+$/ }).count()) === 10, "o calendário tem 10 dias");
  assert((await page.getByText("Descanso", { exact: true }).count()) === 5, "5 dias de descanso (os pares)");
  await overflow("Aquecimento");
  await page.getByRole("button", { name: "Editar o dia 7" }).click();
  await dialog().getByLabel("Tempo de uso (minutos)").fill("45");
  await dialog().getByLabel("O que fazer").fill("Tarefa combinada para o dia 7");
  await save();
  await toast("Dia 7 atualizado");
  assert(exampleDay(7, "minutes") === "45", "minutos do dia 7 alterados");
  await page.getByText("Tarefa combinada para o dia 7").waitFor();
  await page.getByRole("button", { name: "Editar o dia 6" }).click();
  await dialog().getByRole("radio", { name: "Dia de uso" }).click();
  await dialog().getByLabel("Tempo de uso (minutos)").fill("5");
  await save();
  await toast("Dia 6 atualizado");
  assert(exampleDay(6, "use") === "true", "dia de descanso pode virar dia de uso");
  const endBefore = exampleDay(10, "date");
  await page.getByRole("button", { name: "Editar", exact: true }).click();
  await dialog().getByLabel("Duração (dias)").fill("12");
  await save();
  await toast("Calendário atualizado");
  assert(psql("select jsonb_array_length(days)::text || '|' || total_days from public.warmups where is_example") === "12|12", "duração passou para 12 dias");
  assert(exampleDay(12, "date") > endBefore, "a data de fim prevista foi recalculada");
  await page.getByRole("button", { name: "Marcar o dia 5 como feito" }).click();
  await page.getByRole("button", { name: "Desmarcar o dia 5" }).waitFor();
  assert(await page.getByRole("button", { name: "Marcar o dia 7 como feito" }).isDisabled(), "dias futuros não podem ser marcados");
  await shot("b11-aquecimento");
  // toque duplo no mesmo círculo: só o primeiro vale (o segundo não desfaz a marcação)
  await page.getByRole("button", { name: "Desmarcar o dia 5" }).dblclick();
  await page.waitForTimeout(700);
  assert(exampleDay(5, "done") === "false", "toque duplo no círculo conta como um toque só");
  await page.getByRole("button", { name: "Marcar o dia 5 como feito" }).click();
  await page.getByRole("button", { name: "Desmarcar o dia 5" }).waitFor();
  await page.waitForTimeout(500);
  // um dia já marcado que foi parar no futuro (ex.: depois de empurrar o calendário) pode ser desmarcado
  shiftExample(2);
  await page.reload();
  await page.getByRole("heading", { name: "Calendário" }).waitFor({ timeout: 20000 });
  assert(await page.getByRole("button", { name: "Desmarcar o dia 5" }).isEnabled(), "dia futuro que já estava marcado pode ser desmarcado");

  // ---------------------------------------------------------------
  section("Dia pulado: perguntar e empurrar o calendário");
  shiftExample(-5); // o calendário fica 3 dias para trás: os dias 6 e 7 (de uso, não feitos) passaram
  await page.reload();
  await page.getByRole("heading", { name: "Calendário" }).waitFor({ timeout: 20000 });
  await page.getByText(/Dia 6 .* ficou sem marcar/).waitFor();
  ok("a aba avisa que o dia 6 ficou sem marcar");
  await page.getByRole("link", { name: "Hoje" }).click();
  await page.getByRole("heading", { name: "Atrasados" }).waitFor();
  await shot("b12-hoje-atrasado");
  const oldEnd = exampleDay(12, "date");
  const oldDay6 = exampleDay(6, "date");
  await page.getByRole("button", { name: "Não fiz: empurrar para hoje" }).click();
  await dialog().getByText("Empurrar o calendário?").waitFor();
  await dialog().getByText(/Novo fim previsto/).waitFor();
  ok("pergunta antes de empurrar e mostra a nova data de fim");
  await shot("b13-confirma-empurrar");
  await dialog().getByRole("button", { name: "Empurrar", exact: true }).click();
  await toast("Calendário empurrado");
  const today = psql("select current_date::text");
  assert(exampleDay(6, "date") === today, "o dia pulado veio para hoje");
  assert(exampleDay(5, "date") < oldDay6, "os dias anteriores não mudaram");
  assert(exampleDay(12, "date") > oldEnd, "o fim previsto andou junto");
  await page.waitForFunction(() => !document.body.innerText.includes("Atrasados"));
  await page.locator("li", { hasText: "dia 6 de 12" }).first().getByRole("button", { name: "Feito", exact: true }).waitFor();
  ok("o dia empurrado aparece como tarefa de hoje, e o aviso de atraso some");
  assert(psql("select count(*) from public.activity_log where kind = 'aquecimento_empurrado'") === "1", "a linha do tempo registra o empurrão");

  // "Fiz no dia": só faltou marcar
  shiftExample(-1);
  await page.reload();
  await page.getByRole("heading", { name: "Atrasados" }).waitFor({ timeout: 20000 });
  // "Fiz no dia" (dia 6) e "Feito" (dia 7, a tarefa de hoje) tocados quase juntos: as duas
  // gravações são do mesmo calendário e entram em fila — nenhuma pode apagar a outra.
  const day6 = exampleDay(6, "date");
  await page.evaluate(() => {
    const tap = (label) =>
      [...document.querySelectorAll("button")].find((b) => b.offsetParent !== null && b.innerText.trim() === label).click();
    tap("Fiz no dia");
    tap("Feito");
  });
  await toast("Dia 6 marcado como feito");
  await page.getByRole("button", { name: "Desfazer" }).waitFor();
  await page.waitForTimeout(700);
  assert(exampleDay(6, "done") === "true" && exampleDay(6, "date") === day6, "“Fiz no dia” marca o dia sem mexer nas datas");
  assert(exampleDay(7, "done") === "true", "dois toques quase juntos no mesmo calendário: as duas marcações ficam gravadas");
  await page.getByRole("button", { name: "Desfazer" }).click();
  await page.getByText("1 de 1 por fazer").waitFor();
  await page.waitForTimeout(500);
  assert(exampleDay(7, "done") === "false" && exampleDay(6, "done") === "true", "desfazer um dia não mexe no outro");

  // Proteção: o dia é resolvido em outro aparelho enquanto a pergunta está aberta neste
  shiftExample(-1); // agora é o dia 7 (uso, não feito) que fica para trás
  await page.reload();
  await page.getByRole("heading", { name: "Atrasados" }).waitFor({ timeout: 20000 });
  await page.getByRole("button", { name: "Não fiz: empurrar para hoje" }).click();
  await dialog().getByText("Empurrar o calendário?").waitFor();
  // "outro aparelho" marca o dia 7 como feito…
  psql(
    `update public.warmups set days = (select jsonb_agg(case when (d->>'n')::int = 7 then jsonb_set(d, '{done}', 'true') else d end order by (d->>'n')::int) from jsonb_array_elements(days) d) where is_example`,
  );
  // …e o painel busca os dados de novo sozinho ao voltar para a aba (quando eles têm mais de 15 s)
  await page.waitForTimeout(15500);
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await page.waitForFunction(() => !document.body.innerText.includes("Atrasados"), null, { timeout: 15000 });
  const day7 = exampleDay(7, "date");
  await dialog().getByRole("button", { name: "Empurrar", exact: true }).click();
  await toast("Este dia já tinha sido resolvido");
  assert(exampleDay(7, "done") === "true" && exampleDay(7, "date") === day7, "empurrar não desfaz o que foi marcado em outro aparelho");

  // ---------------------------------------------------------------
  section("Aquecimento concluído: conta pronta para operar");
  psql(
    `update public.warmups set days = (select jsonb_agg(jsonb_set(jsonb_set(d, '{date}', to_jsonb((current_date - 20 + (d->>'n')::int)::text)), '{done}', to_jsonb((d->>'use')::boolean)) order by (d->>'n')::int) from jsonb_array_elements(days) d) where is_example`,
  );
  await page.reload();
  await page.getByRole("heading", { name: "Prontas para operar" }).waitFor({ timeout: 20000 });
  await shot("b14-pronta");
  await page.getByRole("button", { name: "Marcar como ativa" }).click();
  await toast("@fra.salvio marcada como ativa");
  await page.waitForTimeout(600);
  assert(psql("select status from public.accounts where is_example and generation = 2") === "ativa", "a conta passa para “ativa”");
  assert(psql("select (finished_at is not null)::text from public.warmups where is_example") === "true", "o aquecimento é encerrado");
  assert(psql("select count(*) from public.activity_log where kind = 'aquecimento_concluido' and message = 'Aquecimento concluído'") === "1", "a linha do tempo registra a conclusão");
  await page.getByText("Nenhuma conta em aquecimento").waitFor();
  ok("a tela Hoje fica sem tarefas de aquecimento");

  // ---------------------------------------------------------------
  section("Padrão de aquecimento em Configurações");
  await more("Configurações");
  await page.getByText("10 dias · uso nos dias 1, 3, 5, 7 e 9").waitFor();
  await page.getByRole("button", { name: "Editar", exact: true }).click();
  // digitar a duração tecla por tecla (apagar, "1", "12") não pode apagar o que já foi ajustado nos dias
  await dialog().getByLabel("Minutos do dia 3").fill("17");
  const duration = dialog().getByLabel("Duração (dias)");
  await duration.fill("");
  await duration.pressSequentially("12");
  assert((await dialog().getByLabel(/^Minutos do dia \d+$/).count()) === 6, "com 12 dias, o padrão mostra 6 dias de uso");
  assert((await dialog().getByLabel("Minutos do dia 3").inputValue()) === "17", "digitar a duração não apaga os minutos já ajustados");
  await duration.fill("");
  await duration.pressSequentially("4");
  assert((await dialog().getByLabel(/^Minutos do dia \d+$/).count()) === 2, "com 4 dias, sobram 2 dias de uso");
  await dialog().getByLabel("Minutos do dia 1").fill("7");
  await dialog().getByLabel("O que fazer no dia 1").fill("Tarefa padrão do primeiro dia");
  await shot("b15-padrao");
  await save();
  await toast("Padrão de aquecimento salvo");
  await page.getByText("4 dias · uso nos dias 1 e 3").waitFor();
  assert(psql("select jsonb_array_length(warmup_defaults->'days') from public.settings") === "4", "padrão salvo com 4 dias");
  assert(psql("select warmup_defaults->'days'->2->>'minutes' from public.settings") === "17", "o dia 3 foi salvo com os 17 minutos ajustados");

  // ---------------------------------------------------------------
  section("Conta nova já nasce com o calendário (usando o padrão)");
  await page.getByRole("link", { name: "Países" }).click();
  await page.getByRole("heading", { name: "Países", exact: true }).waitFor();
  await page.getByRole("button", { name: "Avatar", exact: true }).click();
  await dialog().getByLabel("Nome do avatar").fill("Nonna Rosa");
  await save();
  await page.getByRole("heading", { name: "Nonna Rosa" }).waitFor();
  await page.getByRole("button", { name: "Nova conta", exact: true }).click();
  await dialog().getByLabel("@ do Instagram").fill("nonna.rosa");
  await dialog().getByText("Criar o calendário de aquecimento").waitFor();
  await dialog().getByText("4 dias · uso nos dias 1 e 3, começando na data de criação").waitFor();
  await save();
  await toast("Conta criada");
  await noDialog();
  assert(
    psql("select w.total_days::text || '|' || (w.days->0->>'minutes') || '|' || (w.days->0->>'task') from public.warmups w join public.accounts a on a.id = w.account_id where a.handle = 'nonna.rosa'") ===
      "4|7|Tarefa padrão do primeiro dia",
    "o calendário da conta nova segue o padrão das Configurações",
  );
  assert(psql("select count(*) from public.activity_log where kind = 'aquecimento_iniciado' and not is_example") === "1", "a linha do tempo registra o início do aquecimento");
  await page.getByRole("link", { name: "Hoje" }).click();
  await page.locator("li", { hasText: "dia 1 de 4" }).first().getByText("7 min").waitFor();
  await page.getByText("Tarefa padrão do primeiro dia").waitFor();
  ok("a conta nova já aparece nas tarefas de hoje");

  // ---------------------------------------------------------------
  section("Sem calendário: aviso na tela Hoje e início manual");
  const nonna = psql("select id from public.accounts where handle = 'nonna.rosa'");
  psql(`delete from public.warmups where account_id = '${nonna}'`);
  await page.reload();
  await page.getByText(/@nonna\.rosa: aquecendo sem calendário/).waitFor({ timeout: 20000 });
  ok("avisa que a conta está aquecendo sem calendário");
  await page.getByRole("link", { name: /Nonna Rosa.*aquecendo sem calendário/ }).click();
  await page.getByRole("button", { name: "Iniciar aquecimento" }).click();
  await dialog().getByLabel("Duração (dias)").fill("6");
  await save("Iniciar");
  await toast("Aquecimento iniciado");
  await noDialog();
  await page.getByRole("heading", { name: "Calendário" }).waitFor();
  assert(psql(`select total_days from public.warmups where account_id = '${nonna}'`) === "6", "aquecimento iniciado à mão com 6 dias");
  await page.getByRole("button", { name: "Marcar o dia 1 como feito" }).click();
  await page.getByRole("button", { name: "Desmarcar o dia 1" }).waitFor();
  await page.waitForTimeout(500);

  // status sai de "aquecendo": o calendário é encerrado e some da tela Hoje
  await page.getByRole("tab", { name: /^Conta atual/ }).click();
  await page.getByLabel("Status da conta").selectOption("restrita");
  await toast("Status alterado para restrita");
  await page.waitForTimeout(600);
  assert(psql(`select (finished_at is not null)::text from public.warmups where account_id = '${nonna}'`) === "true", "trocar o status encerra o aquecimento");

  // voltou para "aquecendo": o calendário continua de onde tinha parado
  await page.getByLabel("Status da conta").selectOption("aquecendo");
  await toast("Status alterado para aquecendo");
  await page.waitForTimeout(700);
  assert(
    psql(`select (finished_at is null)::text || '|' || (days->0->>'done') from public.warmups where account_id = '${nonna}'`) === "true|true",
    "voltar para “aquecendo” retoma o calendário, com o que já estava marcado",
  );
  assert(psql("select count(*) from public.activity_log where message = 'Aquecimento retomado de onde tinha parado'") === "1", "a linha do tempo registra a retomada");
  await page.getByLabel("Status da conta").selectOption("restrita");
  await page.waitForTimeout(900);
  assert(psql(`select (finished_at is not null)::text from public.warmups where account_id = '${nonna}'`) === "true", "…e sair de “aquecendo” de novo encerra outra vez");
  await page.getByRole("tab", { name: /^Aquecimento/ }).click();
  await page.getByText("Para continuar de onde parou").waitFor();
  await page.getByText(/Este aquecimento foi encerrado/).waitFor();
  await page.getByRole("button", { name: "Reiniciar aquecimento" }).click();
  await save("Reiniciar");
  await toast("Aquecimento reiniciado");
  await noDialog();
  await page.waitForTimeout(600);
  assert(
    psql(`select a.status || '|' || (w.finished_at is null)::text from public.accounts a join public.warmups w on w.account_id = a.id where a.id = '${nonna}'`) === "aquecendo|true",
    "reiniciar devolve a conta para “aquecendo” com um calendário novo",
  );

  // ---------------------------------------------------------------
  section("Exemplos antigos (sem aquecimento) são completados sozinhos");
  psql("delete from public.accounts where handle = 'nonna.rosa'; delete from public.avatars where name = 'Nonna Rosa'");
  // (a conta de exemplo foi criada há 40 dias: instalação antiga)
  psql("delete from public.warmups where is_example; update public.accounts set status = 'aquecendo', created_on = current_date - 40 where is_example and generation = 2");
  psql(`update public.settings set prefs = jsonb_set(prefs, '{examples_version}', '1')`);
  await page.goto(BASE + "/");
  await page.locator("li", { hasText: "dia 5 de 10" }).first().getByRole("button", { name: "Feito", exact: true }).waitFor({ timeout: 20000 });
  ok("a tela Hoje mostra a tarefa de exemplo do dia, mesmo com o exemplo criado há muito tempo");
  assert(psql("select count(*) from public.warmups where is_example and finished_at is null") === "1", "o exemplo de versão antiga ganha o calendário de aquecimento");
  assert(psql("select prefs->>'examples_version' from public.settings") === "4", "a versão dos exemplos é atualizada");

  resetData();
  await finish(session);
})().catch(fail);
