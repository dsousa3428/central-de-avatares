// Teste de ponta a ponta da ETAPA (f): busca global, backup (baixar e restaurar),
// troca da senha de login e aplicativo instalável (manifesto, ícones, sem internet).
//
//   node dev/e2e/etapa-f.cjs      (com o app rodando em http://localhost:3000)
const { chromium } = require("playwright");
const { readFileSync } = require("node:fs");
const { BASE, USER, psql, resetData, resetTestPassword, ok, section, assert, openPhone, finish, fail } = require("./helpers.cjs");

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

// Um retrato do banco: quantas linhas em cada tabela e os ids das contas (que precisam ser mantidos).
const SNAPSHOT = `select
  (select count(*) from public.countries) || '|' || (select count(*) from public.avatars) || '|' ||
  (select count(*) from public.accounts) || '|' || (select count(*) from public.phones) || '|' ||
  (select count(*) from public.antidetect_profiles) || '|' || (select count(*) from public.warmups) || '|' ||
  (select count(*) from public.weekly_sales) || '|' || (select count(*) from public.activity_log) || '|' ||
  (select string_agg(id::text, ',' order by id) from public.accounts) || '|' ||
  (select coalesce(sum(amount), 0) from public.weekly_sales) || '|' || (select name from public.avatars order by created_at limit 1)`;

/** Lê os arquivos de um .zip sem compressão (o formato que o painel gera). */
function unzipStored(bytes) {
  const files = {};
  let at = 0;
  while (bytes.readUInt32LE(at) === 0x04034b50) {
    const size = bytes.readUInt32LE(at + 18);
    const nameLength = bytes.readUInt16LE(at + 26);
    const extra = bytes.readUInt16LE(at + 28);
    const name = bytes.subarray(at + 30, at + 30 + nameLength).toString("utf8");
    const start = at + 30 + nameLength + extra;
    files[name] = bytes.subarray(start, start + size).toString("utf8");
    at = start + size;
  }
  return files;
}

(async () => {
  resetData();
  await resetTestPassword();
  // (este é o único teste com o service worker ligado: é ele que mostra a página "Sem internet")
  const session = await openPhone(chromium, { timezoneId: "UTC", serviceWorkers: "allow", acceptDownloads: true });
  const { page, dialog, shot, toast, save, noDialog, overflow, more } = session;
  await session.login();

  const field = (label) => dialog().getByLabel(label, { exact: true });
  const results = () => dialog().getByRole("list", { name: "Resultados da busca" }).getByRole("listitem");
  const search = async (text) => {
    await field("O que você procura?").fill(text);
    await page.waitForTimeout(150);
  };
  const MASTER = "frase mestra do teste de backup 2026";

  // ---------------------------------------------------------------
  section("Busca global");
  await page.getByRole("button", { name: "Buscar", exact: true }).click();
  await dialog().getByRole("heading", { name: "Buscar" }).waitFor();
  await dialog().getByText(/Digite um @, o nome de um avatar/).waitFor();
  await search("salvio");
  const found = await results().allInnerTexts();
  assert(found.length === 6 && /^Fra' Salvio\s*Avatar/.test(found[0].replace(/\n+/g, " ")), "“salvio” acha o avatar primeiro");
  assert(/@fra\.salvio/.test(found[1]) && /2ª geração/.test(found[1]) && /1ª geração · caída/.test(found[2]), "depois as contas dele: a viva antes da que caiu");
  assert(/Perfil 10[12]/.test(found[3]) && /Perfil 10[12]/.test(found[4]), "e os perfis anti-detect que levam o nome dele");
  assert(/Celular A/.test(found[5]) && /observação: .*Fra' Salvio/.test(found[5]), "por último, o celular que cita o nome numa observação (mostrando onde bateu)");
  await overflow("busca");
  await shot("f10-busca");
  await search("conta1@exemplo");
  assert((await results().count()) === 1 && /e-mail: frasalvio\.conta1@exemplo\.com/.test(await results().first().innerText()), "busca por e-mail mostra onde bateu");
  await results().first().getByRole("link").click();
  await noDialog();
  await page.getByRole("heading", { name: "Fra' Salvio" }).waitFor();
  await page.getByRole("tab", { name: /^Histórico/, selected: true }).waitFor();
  ok("a conta que caiu abre no histórico do avatar");
  // pelo menu "Mais", por número de perfil
  await page.getByRole("button", { name: "Mais", exact: true }).click();
  await page.locator("dialog[open]").getByRole("button", { name: "Buscar", exact: true }).click();
  await dialog().getByRole("heading", { name: "Buscar" }).waitFor();
  await search("102");
  assert(/Perfil 102/.test(await results().first().innerText()), "busca pelo número do perfil anti-detect");
  await results().first().getByRole("link").click();
  await noDialog();
  await page.getByRole("heading", { name: "Infraestrutura", exact: true }).waitFor();
  await page.getByRole("tab", { name: /^Perfis anti-detect/, selected: true }).waitFor();
  ok("o perfil abre a Infraestrutura já na aba de perfis");
  // atalho de teclado, sem acento, e Enter abre o primeiro resultado
  await page.keyboard.press("Control+k");
  await dialog().getByRole("heading", { name: "Buscar" }).waitFor();
  await search("xyzxyz");
  await dialog().getByText("Nada encontrado para “xyzxyz”.").waitFor();
  await search("ITALIA");
  assert(/Itália/.test(await results().first().innerText()), "a busca ignora acentos e maiúsculas");
  await page.keyboard.press("Enter");
  await noDialog();
  await page.getByRole("heading", { name: "Países", exact: true }).waitFor();
  ok("Ctrl+K abre a busca e Enter vai para o primeiro resultado");

  // ---------------------------------------------------------------
  section("Backup: baixar");
  // um cofre com uma senha guardada, para conferir que ela sobrevive à restauração
  await more("Configurações");
  await page.getByRole("button", { name: "Criar senha-mestra" }).click();
  await field("Senha-mestra").fill(MASTER);
  await field("Repita a senha-mestra").fill(MASTER);
  await dialog().getByRole("checkbox").check();
  await save("Criar cofre");
  await page.waitForFunction(() => !document.querySelector("dialog[open]"), null, { timeout: 30000 });
  const avatarId = psql("select id from public.avatars where name = 'Fra'' Salvio'");
  await page.goto(`${BASE}/avatar?id=${avatarId}&aba=conta`);
  await page.getByText("Cofre trancado").waitFor({ timeout: 30000 });
  await page.getByRole("button", { name: "Destrancar" }).click();
  await field("Senha-mestra").fill(MASTER);
  await save("Destrancar");
  await page.waitForFunction(() => !document.querySelector("dialog[open]"), null, { timeout: 30000 });
  await page.getByRole("button", { name: "Adicionar senhas" }).click();
  await field("Senha do Instagram").fill("senha-do-insta-123");
  await save();
  await toast("Senhas guardadas no cofre");
  await noDialog();
  const before = psql(SNAPSHOT);
  const blob = psql("select secrets_enc from public.accounts where secrets_enc is not null");

  await more("Configurações");
  await page.getByRole("heading", { name: "Backup", exact: true }).waitFor();
  const [backupDownload] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Baixar backup" }).click()]);
  assert(/^central-de-avatares-\d{4}-\d{2}-\d{2}-\d{4}\.json$/.test(backupDownload.suggestedFilename()), `o backup baixa como ${backupDownload.suggestedFilename()}`);
  const backupPath = await backupDownload.path();
  const backup = JSON.parse(readFileSync(backupPath, "utf8"));
  assert(backup.app === "central-de-avatares" && backup.format === 1 && typeof backup.exported_at === "string", "o arquivo se identifica como backup do painel");
  const counts = Object.fromEntries(Object.entries(backup.tables).map(([name, rows]) => [name, rows.length]));
  assert(
    [counts.countries, counts.avatars, counts.accounts, counts.phones, counts.antidetect_profiles, counts.warmups, counts.weekly_sales, counts.activity_log].join("|") === before.split("|").slice(0, 8).join("|"),
    "com todas as tabelas, linha por linha",
  );
  assert(!readFileSync(backupPath, "utf8").includes("user_id"), "sem o dono das linhas");
  assert(backup.settings.vault && backup.tables.accounts.some((row) => row.secrets_enc === blob), "o cofre vai junto, cifrado");
  assert(!readFileSync(backupPath, "utf8").includes("senha-do-insta-123") && !readFileSync(backupPath, "utf8").includes(MASTER), "nenhuma senha em texto claro no arquivo");

  const [sheetsDownload] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Baixar planilhas" }).click()]);
  assert(/^central-de-avatares-planilhas-.*\.zip$/.test(sheetsDownload.suggestedFilename()), `as planilhas baixam como ${sheetsDownload.suggestedFilename()}`);
  const files = unzipStored(readFileSync(await sheetsDownload.path()));
  assert(
    ["LEIA-ME.txt", "paises.csv", "avatares.csv", "contas.csv", "aquecimentos.csv", "vendas.csv", "celulares.csv", "perfis-anti-detect.csv", "historico.csv"].every((name) => name in files),
    "o .zip tem uma planilha por assunto e um LEIA-ME",
  );
  const contas = files["contas.csv"].replace(/^﻿/, "").split("\r\n");
  assert(contas[0].startsWith("Avatar;País;Conta;Geração;Status;E-mail") && contas.length === 3, "contas.csv: cabeçalho e uma linha por conta");
  assert(contas.some((line) => /Fra' Salvio;Itália;" @fra\.salvio";2;Aquecendo;/.test(line) && line.includes(";No cofre;")), "com nomes no lugar de códigos, e as senhas só como “No cofre”");
  assert(!Object.values(files).some((content) => content.includes(blob) || content.includes("senha-do-insta-123")), "nenhuma planilha leva senha (nem cifrada)");
  assert(files["vendas.csv"].split("\r\n").length === 9, "vendas.csv tem as 8 semanas de exemplo");
  await overflow("Configurações");
  await shot("f11-backup");

  // ---------------------------------------------------------------
  section("Backup: restaurar");
  const picker = page.getByLabel("Arquivo de backup para restaurar");
  await picker.setInputFiles({ name: "nota.txt", mimeType: "text/plain", buffer: Buffer.from("isto não é um backup") });
  await toast("não é um backup do painel");
  await picker.setInputFiles({ name: "outro.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify({ app: "outro-app" })) });
  await toast("não é um backup da Central de Avatares");
  const broken = JSON.parse(JSON.stringify(backup));
  broken.tables.avatars = [];
  await picker.setInputFiles({ name: "quebrado.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(broken)) });
  await toast("Este backup está danificado");
  assert((await page.locator("dialog[open]").count()) === 0, "arquivo errado ou danificado é recusado antes de qualquer coisa");

  // o painel muda depois do backup…
  const uid = psql("select user_id from public.countries limit 1");
  psql(`update public.avatars set name = 'Nome trocado depois do backup' where id = '${avatarId}'`);
  psql(`delete from public.weekly_sales where week_start = (select min(week_start) from public.weekly_sales)`);
  psql(`insert into public.countries (user_id, name, currency, position) values ('${uid}', 'País criado depois', 'EUR', 5)`);
  psql(`update public.settings set brl_rates = '{"EUR": 9.99}'::jsonb`);
  assert(psql(SNAPSHOT) !== before, "(o painel foi alterado depois do backup)");

  // banco ainda sem a função de restaurar (script antigo): a janela ensina a atualizar
  psql("create or replace function public.cda_schema_version() returns integer language sql immutable set search_path = '' as $f$ select 2 $f$; notify pgrst, 'reload schema'");
  await page.waitForTimeout(1500);
  await picker.setInputFiles(backupPath);
  await dialog().getByRole("heading", { name: "Falta atualizar o banco (uma vez)" }).waitFor();
  await dialog().getByRole("button", { name: "Copiar script SQL" }).waitFor();
  ok("com o banco desatualizado, a janela explica como rodar o script (e nada é alterado)");
  psql("create or replace function public.cda_schema_version() returns integer language sql immutable set search_path = '' as $f$ select 3 $f$; notify pgrst, 'reload schema'");
  await page.waitForTimeout(1500);
  await dialog().getByRole("button", { name: "Já rodei" }).click();
  await dialog().getByRole("heading", { name: "Restaurar backup" }).waitFor();
  await dialog().getByText("1 país").waitFor();
  await dialog().getByText("2 contas").waitFor();
  await dialog().getByText("8 lançamentos de vendas").waitFor();
  await dialog().getByText("senhas no cofre de 1 conta (cifradas)").waitFor();
  ok("antes de restaurar, a janela mostra o que o arquivo tem");
  await shot("f12-restaurar");
  await save("Restaurar");
  await dialog().getByRole("alert").filter({ hasText: "digite RESTAURAR" }).waitFor();
  assert(psql("select name from public.avatars where id = '" + avatarId + "'") === "Nome trocado depois do backup", "sem a confirmação, nada é restaurado");
  await field("Para confirmar, digite RESTAURAR").fill("restaurar");
  const [safety] = await Promise.all([page.waitForEvent("download"), save("Restaurar")]);
  assert(/^central-de-avatares-antes-de-restaurar-.*\.json$/.test(safety.suggestedFilename()), "antes de trocar, o painel baixa um backup do que existia");
  const safetyFile = JSON.parse(readFileSync(await safety.path(), "utf8"));
  assert(safetyFile.tables.countries.some((row) => row.name === "País criado depois"), "e esse backup de segurança tem o estado de antes da restauração");
  await toast("Backup restaurado");
  await noDialog();
  await db(SNAPSHOT, before, "o banco volta exatamente ao que era no backup (mesmas linhas, mesmos ids)");
  assert(psql("select brl_rates::text from public.settings") === "{}", "as configurações também voltam");
  assert(psql("select secrets_enc from public.accounts where secrets_enc is not null") === blob, "o bloco cifrado das senhas volta igual");
  assert(psql("select count(*) from public.countries where name = 'País criado depois'") === "0", "o que foi criado depois do backup deixa de existir");

  // as senhas continuam abrindo com a mesma senha-mestra
  await page.goto(`${BASE}/avatar?id=${avatarId}&aba=conta`);
  await page.getByRole("heading", { name: "Fra' Salvio" }).waitFor({ timeout: 30000 });
  await page.getByText("Cofre trancado").waitFor();
  ok("depois de restaurar, o cofre fica trancado");
  await page.getByRole("button", { name: "Destrancar" }).click();
  await field("Senha-mestra").fill(MASTER);
  await save("Destrancar");
  await page.waitForFunction(() => !document.querySelector("dialog[open]"), null, { timeout: 30000 });
  await page.getByRole("button", { name: "Mostrar a senha do Instagram" }).click();
  await page.getByText("senha-do-insta-123", { exact: true }).waitFor();
  ok("a senha guardada abre com a mesma senha-mestra (os ids das contas foram mantidos)");

  // restaurar num painel vazio (aparelho novo, banco novo)
  psql("truncate public.activity_log, public.weekly_sales, public.warmups, public.accounts, public.avatars, public.countries, public.phones, public.antidetect_profiles cascade; update public.settings set vault = null, prefs = '{\"examples_version\": 4}'::jsonb");
  await more("Configurações");
  await page.reload();
  await page.getByRole("heading", { name: "Configurações" }).waitFor({ timeout: 30000 });
  await page.getByLabel("Arquivo de backup para restaurar").setInputFiles(backupPath);
  await dialog().getByRole("heading", { name: "Restaurar backup" }).waitFor();
  await field("Para confirmar, digite RESTAURAR").fill("RESTAURAR");
  await Promise.all([page.waitForEvent("download"), save("Restaurar")]);
  await toast("Backup restaurado");
  await db(SNAPSHOT, before, "num painel vazio, o backup traz tudo de volta");

  // ---------------------------------------------------------------
  section("Trocar a senha de login");
  const NEW_PASSWORD = "nova-senha-de-login-456";
  try {
    await page.getByRole("button", { name: "Trocar senha de login" }).click();
    await dialog().getByRole("heading", { name: "Trocar a senha de login" }).waitFor();
    await field("Senha atual").fill("senha-errada");
    await field("Nova senha").fill(NEW_PASSWORD);
    await field("Repita a nova senha").fill(NEW_PASSWORD);
    await save("Trocar senha");
    await dialog().getByRole("alert").filter({ hasText: "A senha atual não confere." }).waitFor();
    await field("Senha atual").fill(USER.password);
    await field("Nova senha").fill("curta");
    await field("Repita a nova senha").fill("curta");
    await save("Trocar senha");
    await dialog().getByRole("alert").filter({ hasText: "pelo menos 8 caracteres" }).waitFor();
    await field("Nova senha").fill(NEW_PASSWORD);
    await field("Repita a nova senha").fill(NEW_PASSWORD + "x");
    await save("Trocar senha");
    await dialog().getByRole("alert").filter({ hasText: "não são iguais" }).waitFor();
    ok("senha atual errada, senha curta e repetição diferente são recusadas");
    await shot("f13-senha-de-login");
    await field("Repita a nova senha").fill(NEW_PASSWORD);
    await save("Trocar senha");
    await toast("Senha de login trocada");
    await noDialog();
    // sair e entrar: a senha antiga não vale mais, a nova vale
    // "Sair" recarrega a página inteira: espera a recarga terminar antes de digitar o login
    await Promise.all([page.waitForEvent("load", { timeout: 30000 }), page.getByRole("button", { name: "Sair", exact: true }).click()]);
    await page.getByRole("button", { name: "Entrar" }).waitFor({ timeout: 20000 });
    await page.goto(BASE + "/login");
    await page.getByLabel("E-mail").fill(USER.email);
    await page.getByLabel("Senha", { exact: true }).fill(USER.password);
    await page.getByRole("button", { name: "Entrar" }).click();
    await page.getByText("E-mail ou senha incorretos.").waitFor();
    ok("a senha antiga deixa de valer");
    await page.getByLabel("Senha", { exact: true }).fill(NEW_PASSWORD);
    await page.getByRole("button", { name: "Entrar" }).click();
    await page.getByRole("heading", { name: "Hoje", exact: true }).waitFor({ timeout: 30000 });
    ok("a senha nova entra");
  } finally {
    await resetTestPassword(); // os outros testes usam a senha padrão
  }

  // ---------------------------------------------------------------
  section("Aplicativo instalável");
  const manifestHref = await page.locator('link[rel="manifest"]').getAttribute("href");
  const manifest = await page.evaluate(async (href) => (await fetch(href)).json(), manifestHref);
  assert(manifest.name === "Central de Avatares" && manifest.display === "standalone" && manifest.start_url === "/" && manifest.lang === "pt-BR", "o manifesto diz o nome e que o painel abre como aplicativo");
  const icons = await page.evaluate(async (list) => Promise.all(list.map(async (icon) => { const r = await fetch(icon.src); return `${icon.sizes}:${icon.purpose}:${r.status}:${r.headers.get("content-type")}`; })), manifest.icons);
  assert(icons.join(",") === "192x192:any:200:image/png,512x512:any:200:image/png,512x512:maskable:200:image/png", "com os três ícones (192, 512 e o que se adapta ao formato do aparelho)");
  await more("Configurações");
  await page.getByRole("heading", { name: "Instalar no celular" }).waitFor();
  await page.getByText(/Adicionar à Tela de Início/).waitFor();
  await page.getByText(/Instalar app/).waitFor();
  ok("Configurações explica como instalar no iPhone e no Android");
  // o service worker: guarda só arquivos do próprio aplicativo e mostra a página "Sem internet"
  // (ele só existe no painel publicado: com "npm run dev" não é registrado, e este trecho é pulado)
  const registered = await page.evaluate(async () => {
    for (let i = 0; i < 20; i++) {
      if (await navigator.serviceWorker.getRegistration()) return true;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    return false;
  });
  if (!registered) {
    console.log("  (modo de desenvolvimento: sem service worker — conferência do “Sem internet” pulada)");
    resetData();
    await finish(session, [/the server responded with a status of 400/]);
    return;
  }
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await page.reload();
  await page.getByRole("heading", { name: "Configurações" }).waitFor({ timeout: 30000 });
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 15000 });
  const cached = await page.evaluate(async () => {
    const urls = [];
    for (const key of await caches.keys()) for (const request of await (await caches.open(key)).keys()) urls.push(new URL(request.url));
    return { keys: await caches.keys(), paths: urls.map((url) => (url.origin === location.origin ? url.pathname : url.href)) };
  });
  assert(cached.keys.length === 1 && /^cda-app-\d{14}$/.test(cached.keys[0]), "um armário só, com o carimbo da publicação");
  assert(cached.paths.includes("/offline.html") && cached.paths.every((path) => path === "/offline.html" || path.startsWith("/_next/static/")), "nele ficam só a página “Sem internet” e arquivos do próprio aplicativo (nada do Supabase)");
  await session.page.context().setOffline(true);
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "Sem internet" }).waitFor();
  ok("sem internet, abrir o painel mostra a página “Sem internet” (e não um erro do navegador)");
  await shot("f14-sem-internet");
  await session.page.context().setOffline(false);
  await page.getByRole("button", { name: "Tentar de novo" }).click();
  await page.getByRole("heading", { name: "Hoje", exact: true }).waitFor({ timeout: 30000 });
  ok("com a internet de volta, “Tentar de novo” abre o painel");

  resetData();
  // (os erros de rede são do trecho sem internet; o 400 é a senha de login errada, de propósito)
  await finish(session, [/net::ERR_INTERNET_DISCONNECTED/, /Failed to load resource/, /the server responded with a status of 400/]);
})().catch(async (error) => {
  await resetTestPassword().catch(() => {});
  fail(error);
});
