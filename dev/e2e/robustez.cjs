// Robustez: dois aparelhos ao mesmo tempo, falhas de internet no meio de um
// salvamento, toques rápidos, abas pelo endereço e validações de digitação.
//
//   node dev/e2e/robustez.cjs      (com o app rodando em http://localhost:3000)
const { chromium } = require("playwright");
const { BASE, USER, psql, resetData, ok, section, assert, openPhone, finish, fail } = require("./helpers.cjs");

const REST = "**/rest/v1/**";

(async () => {
  resetData(); // o primeiro login recria os exemplos
  const session = await openPhone(chromium);
  const { page, dialog, toast, save, noDialog } = session;
  const offline = () => page.route(REST, (route) => route.abort("internetdisconnected"));
  const online = () => page.unroute(REST);
  const pendingVideos = () => page.getByRole("button", { name: "Marcar como modelado" }).count();

  await session.login();
  await page.getByRole("link", { name: "Países" }).click();
  await page.getByRole("heading", { name: "Países", exact: true }).waitFor();
  await page.getByRole("link", { name: /Fra' Salvio/ }).click();
  await page.getByRole("heading", { name: "Fra' Salvio" }).waitFor();
  const avatarId = psql("select id from public.avatars where name = 'Fra'' Salvio'");

  // ---------------------------------------------------------------
  section("Dois aparelhos: uma tela desatualizada não apaga o que foi salvo no outro");
  await page.getByRole("tab", { name: /^Vídeos/ }).click();
  await page.getByRole("heading", { name: "Vídeos para modelar" }).waitFor();
  assert((await pendingVideos()) === 2, "a tela começa com 2 vídeos a modelar");
  // "no celular": chega um vídeo novo direto no banco (esta tela ainda não sabe)
  psql(
    `update public.avatars set model_videos = model_videos || '[{"id":"cel-1","label":"Vídeo salvo no celular","url":"","status":"a_modelar","note":""}]'::jsonb where id = '${avatarId}'`,
  );
  await page.getByRole("button", { name: "Marcar como modelado" }).first().click();
  await toast("alterado em outro aparelho");
  await page.getByText("Vídeo salvo no celular").waitFor();
  ok("a tela se atualiza e mostra o vídeo que veio do outro aparelho");
  assert(
    psql(`select jsonb_array_length(model_videos) from public.avatars where id = '${avatarId}'`) === "4",
    "o vídeo salvo no outro aparelho continua no banco",
  );
  assert(
    psql(`select count(*) from public.avatars a, jsonb_array_elements(a.model_videos) v where a.id = '${avatarId}' and v->>'status' = 'modelado'`) === "1",
    "a marcação feita com dados velhos não foi gravada",
  );
  await page.getByRole("button", { name: "Marcar como modelado" }).first().click();
  await page.waitForFunction(() => document.querySelectorAll('button[aria-label="Marcar como modelado"]').length === 2);
  await page.waitForTimeout(600);
  assert(
    psql(`select count(*) from public.avatars a, jsonb_array_elements(a.model_videos) v where a.id = '${avatarId}' and v->>'status' = 'modelado'`) === "2",
    "tentando de novo (já com os dados em dia), a marcação é gravada",
  );
  assert(
    psql(`select jsonb_array_length(model_videos) from public.avatars where id = '${avatarId}'`) === "4",
    "…e nenhum vídeo se perdeu",
  );

  // ---------------------------------------------------------------
  section("Toques rápidos");
  await page.getByRole("button", { name: "Marcar como modelado" }).nth(1).click();
  await page.getByRole("button", { name: "Marcar como modelado" }).first().click();
  await page.waitForFunction(() => document.querySelectorAll('button[aria-label="Marcar como modelado"]').length === 0);
  await page.waitForTimeout(800);
  assert(
    psql(`select count(*) from public.avatars a, jsonb_array_elements(a.model_videos) v where a.id = '${avatarId}' and v->>'status' = 'modelado'`) === "4",
    "dois toques seguidos: as duas marcações chegam ao banco",
  );
  await offline();
  await page.getByRole("button", { name: "Marcar como a modelar" }).first().click();
  await page.getByRole("button", { name: "Marcar como a modelar" }).first().click();
  await toast("Sem conexão com o servidor");
  await page.waitForFunction(() => document.querySelectorAll('button[aria-label="Marcar como a modelar"]').length === 4);
  ok("dois toques seguidos sem internet: a tela volta exatamente ao que está salvo");
  await online();

  // ---------------------------------------------------------------
  section("Anotações: erro ao salvar não apaga o que foi digitado");
  await page.getByRole("tab", { name: /^Anotações/ }).click();
  await page.getByLabel("Anotações do avatar").fill("Texto importante que não pode sumir");
  await offline();
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await toast("Sem conexão com o servidor");
  assert(
    (await page.getByLabel("Anotações do avatar").inputValue()) === "Texto importante que não pode sumir",
    "o rascunho continua na tela depois da falha",
  );
  await online();
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await toast("Anotações salvas");
  assert(
    psql(`select notes from public.avatars where id = '${avatarId}'`) === "Texto importante que não pode sumir",
    "com a internet de volta, o texto é salvo",
  );

  // ---------------------------------------------------------------
  section("A aba aberta segue o endereço");
  await page.getByRole("tab", { name: /^Kit de reposição/ }).click();
  await page.getByRole("link", { name: "Hoje" }).click();
  await page.getByRole("heading", { name: "Hoje" }).waitFor();
  await page.getByRole("link", { name: /Fra' Salvio/ }).click(); // este link leva para a aba "Conta atual"
  await page.getByRole("heading", { name: "@fra.salvio" }).waitFor();
  assert(
    (await page.getByRole("tab", { name: /^Conta atual/ }).getAttribute("aria-selected")) === "true",
    "vindo da tela Hoje, o avatar abre em “Conta atual” (mesmo tendo ficado em “Kit”)",
  );

  // ---------------------------------------------------------------
  section("Validações de digitação na conta");
  await page.getByRole("button", { name: "Atualizar", exact: true }).click();
  await dialog().getByLabel("Seguidores hoje").fill("1840.5");
  await save();
  await dialog().getByText("Não entendi o número").waitFor();
  ok("“1840.5” seguidores é recusado com explicação");
  await dialog().getByLabel("Seguidores hoje").fill("12,3 mil");
  await save();
  await toast("Seguidores atualizados");
  assert(psql("select followers from public.accounts where generation = 2") === "12300", "“12,3 mil” vira 12300");

  await page.getByRole("button", { name: "Editar", exact: true }).click();
  const tomorrow = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
  await dialog().getByLabel("Criada em").fill(tomorrow);
  await save();
  await dialog().getByText("A data de criação não pode ser no futuro.").waitFor();
  ok("data de criação no futuro é recusada");
  await dialog().getByLabel("Criada em").fill("0026-11-12");
  await save();
  await dialog().getByText("Informe uma data de criação válida.").waitFor();
  ok("ano digitado pela metade (0026) é recusado");
  await dialog().getByLabel("@ do Instagram").fill("https://www.instagram.com/Fra.Salvio/?igsh=abc");
  await dialog().getByLabel("Criada em").fill(psql("select created_on from public.accounts where generation = 2"));
  await dialog().getByLabel("Anotações", { exact: true }).fill("Anotação nova");
  await save();
  await toast("Conta atualizada");
  assert(
    psql("select handle || '|' || notes from public.accounts where generation = 2") === "fra.salvio|Anotação nova",
    "link do perfil colado no campo @ vira só o nome da conta",
  );

  // ---------------------------------------------------------------
  section("“Conta caiu” sem internet: o formulário continua aberto, com o motivo digitado");
  await page.getByLabel("Status da conta").selectOption("caida");
  await dialog().getByLabel("Motivo provável").fill("Motivo digitado com cuidado");
  await offline();
  await save();
  await dialog().getByText("Sem conexão com o servidor").waitFor({ timeout: 8000 });
  assert(
    (await dialog().getByLabel("Motivo provável").inputValue()) === "Motivo digitado com cuidado",
    "o erro aparece na janela e o motivo digitado continua lá",
  );
  assert(psql("select status from public.accounts where generation = 2") === "aquecendo", "nada foi gravado no banco");
  await online();
  await save();
  await toast("Conta atualizada");
  await noDialog();
  await page.getByText("Nenhuma conta ativa").waitFor();
  assert(
    psql("select status || '|' || fall_reason from public.accounts where generation = 2") === "caida|Motivo digitado com cuidado",
    "com a internet de volta, a queda é gravada com o motivo",
  );

  // ---------------------------------------------------------------
  section("Janela não fecha no meio de um salvamento lento");
  await page.getByRole("tab", { name: /^Links/ }).click();
  await page.getByRole("button", { name: "Adicionar", exact: true }).click();
  await dialog().getByLabel("Rótulo", { exact: true }).fill("Link lento");
  await dialog().getByLabel("Link", { exact: true }).fill("exemplo.com/lento");
  await page.route(REST, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await route.continue();
  });
  await save();
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  assert((await page.locator("dialog[open]").count()) === 1, "Esc (duas vezes) durante o salvamento não fecha a janela");
  await toast("Link salvo");
  await noDialog();
  await online();
  await page.getByText("Link lento").waitFor();
  ok("quando o salvamento termina, a janela fecha e o link aparece");

  // ---------------------------------------------------------------
  section("Sair em outra aba: a tela de entrada volta limpa e utilizável");
  const other = await page.context().newPage();
  await other.goto(BASE + "/configuracoes");
  await other.getByRole("button", { name: "Sair", exact: true }).click();
  await other.waitForURL("**/login");
  await other.close();
  await page.waitForURL("**/login", { timeout: 15000 });
  await page.getByRole("button", { name: "Entrar" }).waitFor();
  assert((await page.getByLabel("Senha", { exact: true }).inputValue()) === "", "a senha não ficou guardada no formulário");
  assert(await page.getByRole("button", { name: "Entrar" }).isEnabled(), "o botão Entrar está liberado");
  await page.getByLabel("E-mail").fill(USER.email);
  await page.getByLabel("Senha", { exact: true }).fill(USER.password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.getByRole("heading", { name: "Hoje" }).waitFor({ timeout: 30000 });
  ok("dá para entrar de novo normalmente");

  resetData();
  // falhas de rede provocadas de propósito aparecem no console: ignorar
  await finish(session, [/Failed to load resource/, /ERR_INTERNET_DISCONNECTED/, /status of 40\d/]);
})().catch(fail);
