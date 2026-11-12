// Situações de exceção: banco ainda sem as tabelas e queda de internet ao salvar.
//
//   node dev/e2e/extras.cjs      (com o app rodando em http://localhost:3000)
const { chromium } = require("playwright");
const { BASE, USER, psql, resetData, ok, section, assert, openPhone, finish, fail } = require("./helpers.cjs");

const restoreTable = () => {
  try {
    psql("alter table if exists public.countries_tmp rename to countries; notify pgrst, 'reload schema';");
  } catch {
    // já estava no lugar
  }
};

(async () => {
  resetData(); // começa do zero: o primeiro login recria os exemplos
  const session = await openPhone(chromium);
  const { page, dialog, shot, toast, save, clipboard, more } = session;

  // ---------------------------------------------------------------
  section("Banco sem as tabelas: tela de ajuda + botão de copiar o script");
  psql("alter table public.countries rename to countries_tmp; notify pgrst, 'reload schema';");
  await page.waitForTimeout(1500);
  try {
    await page.goto(BASE + "/login");
    await page.getByLabel("E-mail").fill(USER.email);
    await page.getByLabel("Senha", { exact: true }).fill(USER.password);
    await page.getByRole("button", { name: "Entrar" }).click();
    await page.getByRole("heading", { name: "Falta preparar o banco de dados" }).waitFor({ timeout: 30000 });
    ok("mostra “Falta preparar o banco de dados”");
    await page.getByRole("button", { name: "Copiar script SQL" }).click();
    const copied = await clipboard();
    assert(
      copied.includes("create table if not exists public.countries") && copied.includes("enable row level security"),
      `o botão copia o script inteiro (${copied.length} caracteres)`,
    );
    await shot("60-falta-banco");
  } finally {
    restoreTable();
  }
  await page.waitForTimeout(1500);
  await page.getByRole("button", { name: "Já rodei" }).click();
  await page.getByRole("heading", { name: "Hoje", exact: true }).waitFor({ timeout: 30000 });
  ok("com o banco preparado, “Já rodei” abre o painel");

  // ---------------------------------------------------------------
  section("Queda de internet ao salvar");
  await page.getByRole("link", { name: "Países" }).click();
  await page.getByRole("heading", { name: "Países", exact: true }).waitFor();
  await page.getByRole("link", { name: /Fra' Salvio/ }).click();
  await page.getByRole("tab", { name: /^Vídeos/ }).click();
  await page.getByRole("heading", { name: "Vídeos para modelar" }).waitFor();
  await page.route("**/rest/v1/**", (route) => route.abort("internetdisconnected"));
  const before = await page.getByRole("button", { name: "Marcar como modelado" }).count();
  await page.getByRole("button", { name: "Marcar como modelado" }).first().click();
  await toast("Sem conexão com o servidor");
  await page.waitForTimeout(300);
  const after = await page.getByRole("button", { name: "Marcar como modelado" }).count();
  assert(before === 2 && after === 2, "a mudança que não foi salva é desfeita na tela");
  await page.getByRole("button", { name: "Adicionar", exact: true }).click();
  await dialog().getByLabel("Rótulo", { exact: true }).fill("Vídeo sem internet");
  await save();
  await dialog().getByText("Sem conexão com o servidor").waitFor({ timeout: 8000 });
  assert(
    (await dialog().getByLabel("Rótulo", { exact: true }).inputValue()) === "Vídeo sem internet",
    "no formulário, o erro aparece na janela e o texto digitado continua lá",
  );
  await page.unroute("**/rest/v1/**");
  await save();
  await toast("Vídeo salvo");

  // ---------------------------------------------------------------
  section("Apagar exemplos nunca apaga o que é do usuário");
  // Coloca dados "reais" dentro dos exemplos: um avatar no país de exemplo, uma conta
  // no avatar de exemplo e essa conta usando um celular de exemplo.
  const uid = psql("select user_id from public.countries where is_example limit 1");
  const italy = psql("select id from public.countries where is_example limit 1");
  const fra = psql("select id from public.avatars where is_example limit 1");
  const phoneA = psql("select id from public.phones where is_example and nickname = 'Celular A'");
  psql(`insert into public.avatars (user_id, country_id, name) values ('${uid}', '${italy}', 'Avatar Real')`);
  psql(
    `insert into public.accounts (user_id, avatar_id, generation, handle, status, phone_id) values ('${uid}', '${fra}', 3, 'conta.real', 'ativa', '${phoneA}')`,
  );
  await page.reload();
  await page.getByRole("heading", { name: "Fra' Salvio" }).waitFor({ timeout: 20000 });
  await more("Configurações");
  await page.getByRole("heading", { name: "Configurações" }).waitFor();
  await page.getByRole("button", { name: "Apagar exemplos" }).click();
  await dialog().getByRole("button", { name: "Apagar exemplos" }).click();
  await toast("Exemplos apagados");
  assert(psql("select count(*) from public.accounts where handle = 'conta.real'") === "1", "a conta real continua existindo");
  assert(psql("select count(*) from public.accounts where is_example") === "0", "as contas de exemplo foram apagadas");
  assert(
    psql("select count(*)::text || '|' || bool_or(is_example)::text from public.avatars where name = 'Fra'' Salvio'") === "1|false",
    "o avatar de exemplo com conta real foi mantido (sem a marca de exemplo)",
  );
  assert(psql("select count(*) from public.avatars where name = 'Avatar Real'") === "1", "o avatar real continua existindo");
  assert(
    psql("select count(*)::text || '|' || bool_or(is_example)::text from public.countries where name = 'Itália'") === "1|false",
    "o país de exemplo com avatares reais foi mantido (sem a marca de exemplo)",
  );
  assert(
    psql("select count(*) from public.phones where nickname = 'Celular A' and not is_example") === "1",
    "o celular de exemplo em uso foi mantido (sem a marca de exemplo)",
  );
  assert(psql("select count(*) from public.phones where nickname = 'Celular B'") === "0", "o celular de exemplo sem uso foi apagado");
  assert(
    psql("select count(*) from public.antidetect_profiles where number in ('101', '102')") === "0",
    "os perfis de exemplo sem uso foram apagados",
  );
  resetData(); // banco limpo: a próxima carga recria os exemplos

  // ---------------------------------------------------------------
  section("“Ficar com este avatar”: o exemplo vira dado do usuário");
  await page.reload();
  await page.getByRole("heading", { name: "Configurações" }).waitFor({ timeout: 30000 });
  await page.getByRole("link", { name: "Países" }).click();
  await page.getByRole("heading", { name: "Países", exact: true }).waitFor();
  await page.getByRole("button", { name: "Ficar com este país" }).waitFor();
  ok("o país de exemplo oferece “Ficar com este país”");
  await page.getByRole("link", { name: /Fra' Salvio/ }).click();
  await page.getByRole("heading", { name: "Fra' Salvio" }).waitFor();
  await page.getByRole("button", { name: "Ficar com este avatar" }).click();
  await shot("63-ficar-com-avatar");
  await dialog().getByRole("button", { name: "Ficar com ele" }).click();
  await toast("Fra' Salvio agora é seu");
  assert(
    psql(
      "select (select count(*) from public.avatars where is_example) + (select count(*) from public.accounts where is_example) + (select count(*) from public.countries where is_example) + (select count(*) from public.phones where is_example) + (select count(*) from public.antidetect_profiles where is_example) + (select count(*) from public.activity_log where is_example) + (select count(*) from public.warmups where is_example)",
    ) === "0",
    "avatar, contas, aquecimento, país, celulares, perfis e histórico deixaram de ser exemplo",
  );
  assert(psql("select count(*) from public.accounts") === "2", "nenhuma conta foi apagada ou criada");
  assert((await page.getByRole("button", { name: "Ficar com este avatar" }).count()) === 0, "o aviso de exemplo some da página");
  await more("Configurações");
  await page.getByText("Não há dados de exemplo no painel.").waitFor();
  ok("Configurações passa a dizer que não há exemplos");
  resetData(); // deixa o banco limpo para a próxima rodada

  // os erros de rede provocados de propósito aparecem no console: ignorar
  await finish(session, [/Failed to load resource/, /ERR_INTERNET_DISCONNECTED/, /status of 40\d/]);
})().catch((err) => {
  restoreTable();
  fail(err);
});
