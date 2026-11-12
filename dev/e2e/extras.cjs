// Situações de exceção: banco ainda sem as tabelas e queda de internet ao salvar.
//
//   node dev/e2e/extras.cjs      (com o app rodando em http://localhost:3000)
const { chromium } = require("playwright");
const { BASE, USER, psql, ok, section, assert, openPhone, finish, fail } = require("./helpers.cjs");

const restoreTable = () => {
  try {
    psql("alter table if exists public.countries_tmp rename to countries; notify pgrst, 'reload schema';");
  } catch {
    // já estava no lugar
  }
};

(async () => {
  const session = await openPhone(chromium);
  const { page, dialog, shot, toast, save, clipboard } = session;

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
  await page.getByRole("heading", { name: "Hoje" }).waitFor({ timeout: 30000 });
  ok("com o banco preparado, “Já rodei” abre o painel");

  // ---------------------------------------------------------------
  section("Queda de internet ao salvar");
  await page.getByRole("link", { name: "Países" }).click();
  await page.getByRole("heading", { name: "Países", exact: true }).waitFor();
  await page.getByRole("link", { name: /Fra' Salvio/ }).click();
  await page.getByRole("tab", { name: /^Vídeos/ }).click();
  await page.route("**/rest/v1/**", (route) => route.abort("internetdisconnected"));
  const before = await page.getByRole("button", { name: "Marcar como modelado" }).count();
  await page.getByRole("button", { name: "Marcar como modelado" }).first().click();
  await toast("Sem conexão com o servidor");
  const after = await page.getByRole("button", { name: "Marcar como modelado" }).count();
  assert(before === after, "a mudança que não foi salva é desfeita na tela");
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

  // os erros de rede provocados de propósito aparecem no console: ignorar
  await finish(session, [/Failed to load resource/, /ERR_INTERNET_DISCONNECTED/, /status of 40\d/]);
})().catch((err) => {
  restoreTable();
  fail(err);
});
