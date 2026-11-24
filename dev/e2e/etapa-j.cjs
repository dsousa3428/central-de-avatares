// Teste de ponta a ponta de ARQUIVOS E PROMPTS: prompts para copiar e arquivos guardados no
// armazenamento do Supabase (bucket privado "arquivos", uma pasta por usuário).
//
//   node dev/e2e/etapa-j.cjs      (com o app rodando em http://localhost:3000)
const { chromium } = require("playwright");
const { mkdtempSync, readFileSync, rmSync, writeFileSync, truncateSync } = require("node:fs");
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
const SERVICE = stackEnv.SERVICE_ROLE_KEY;

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

// (o valor sempre como texto: verdadeiro/falso vira "true"/"false")
const item = (title, column) => `select coalesce((select (${column})::text from public.library_items where title = '${title.replace(/'/g, "''")}'), 'nada')`;
const objectsOf = (title) =>
  `select coalesce((select string_agg(regexp_replace(o.name, '^.*/[a-z0-9]+-', ''), ',' order by o.name) from storage.objects o, public.library_items l where l.title = '${title.replace(/'/g, "''")}' and o.bucket_id = 'arquivos' and o.name like l.user_id::text || '/' || l.id::text || '/%'), '')`;

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
    const response = await fetch(`${API}/rest/v1/library_items?select=id&limit=1`, { headers: { apikey: ANON, authorization: `Bearer ${token}` } });
    if ((response.status === 200) === present) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`a API não ${present ? "voltou a ver" : "deixou de ver"} a tabela`);
}

(async () => {
  resetData();
  const temp = mkdtempSync(join(tmpdir(), "cda-arquivos-"));
  const session = await openPhone(chromium, { timezoneId: "UTC", acceptDownloads: true });
  const { page, dialog, shot, toast, save, noDialog, overflow, clipboard, more } = session;
  await session.login();
  const uid = psql(`select id from auth.users where email = '${USER.email}'`);
  const token = await login(USER.email, USER.password);
  const fra = psql("select id from public.avatars where name = 'Fra'' Salvio'");

  const field = (label) => dialog().getByLabel(label, { exact: true });
  // os filtros da tela (só os visíveis: as telas visitadas ficam montadas, escondidas, e também têm campos "Avatar")
  const control = (label) => page.locator(`[aria-label="${label}"]:visible`);
  const row = (title) => page.getByRole("list", { name: "Arquivos e prompts" }).locator(":scope > li", { has: page.getByText(title, { exact: true }) });
  const openLibrary = async () => {
    await more("Arquivos e prompts");
    await page.getByRole("button", { name: "Novo prompt" }).or(page.getByRole("button", { name: "Já rodei" })).first().waitFor();
  };
  // a janela não pode rolar para o lado
  const fits = async (where) => {
    const extra = await dialog().evaluate((element) => {
      const body = element.querySelector(".overflow-y-auto");
      return body ? body.scrollWidth - body.clientWidth : 0;
    });
    assert(extra <= 0, `sem rolagem lateral na janela (${where})`);
  };
  // imagens de verdade para enviar: prints da própria tela
  const pngA = await page.screenshot();
  const pngB = await page.screenshot({ clip: { x: 0, y: 0, width: 200, height: 120 } });
  const pdf = Buffer.from("%PDF-1.4\n% ebook de teste\n");

  // ---------------------------------------------------------------
  section("Banco ainda sem a parte nova: o resto do painel funciona, e a tela ensina a rodar o script");
  psql("alter table public.library_items rename to library_items_desligada; notify pgrst, 'reload schema'");
  // (enquanto a tabela não existe, cada carregamento pergunta por ela e recebe 404 — o navegador anota no console)
  const quietFrom = session.problems.length;
  try {
    await waitForTable(token, false);
    await page.reload();
    await page.getByRole("heading", { name: "Hoje", exact: true }).waitFor({ timeout: 30000 });
    assert((await page.getByText("Falta preparar o banco").count()) === 0, "a tela Hoje abre normalmente (a tabela nova não é obrigatória)");
    await openLibrary();
    await page.getByRole("heading", { name: "Falta atualizar o banco (uma vez só)" }).waitFor();
    await page.getByRole("button", { name: "Copiar script SQL" }).waitFor();
    ok("Arquivos e prompts mostra o passo a passo do script, com o botão de copiar");
    await overflow("o passo a passo");
    await shot("j10-falta-o-script");
    await page.getByRole("button", { name: "Já rodei" }).click();
    await toast("Ainda não encontrei a parte nova do banco");
    await page.goto(`${BASE}/avatar?id=${fra}`);
    await page.getByRole("heading", { name: "Estrutura", exact: true }).waitFor({ timeout: 30000 });
    assert((await page.getByRole("heading", { name: "Arquivos e prompts" }).count()) === 0, "a página do avatar não mostra o atalho enquanto o banco não tem a parte nova");
  } finally {
    psql("alter table public.library_items_desligada rename to library_items; notify pgrst, 'reload schema'");
  }
  await waitForTable(token, true);
  await openLibrary();
  await page.getByRole("button", { name: "Já rodei" }).click();
  await page.getByRole("button", { name: "Novo prompt" }).waitFor();
  const expected = session.problems.splice(quietFrom).filter((text) => !/status of 404/.test(text));
  assert(expected.length === 0, `nesse meio-tempo, nenhum outro problema no console${expected.length ? `: ${expected.join(" | ")}` : ""}`);
  ok("rodado o script, “Já rodei” abre a tela de verdade");
  await page.getByText("Nada guardado ainda").waitFor();
  await overflow("a tela vazia");

  // ---------------------------------------------------------------
  section("Novo prompt");
  await page.getByRole("button", { name: "Novo prompt" }).click();
  await dialog().getByRole("heading", { name: "Novo prompt" }).waitFor();
  await save();
  await dialog().getByText("Dê um título ao item (ex.: “Rosto do Fra' Salvio”).").waitFor();
  await field("Título").fill("Rosto do Fra' Salvio");
  await save();
  await dialog().getByText("Escreva o prompt ou anexe um arquivo.").waitFor();
  ok("sem título, ou sem prompt e sem arquivo, nada é salvo");
  const prompt = "Retrato de um frade franciscano de 70 anos, barba branca curta, hábito marrom,\nluz natural de janela --ar 4:5 --style raw";
  await field("Prompt").fill(prompt);
  await field("Avatar").selectOption({ label: "🇮🇹 Fra' Salvio" });
  await field("Anotações").fill("Midjourney v7. Usar a foto de referência com --cref.");
  assert((await field("Tipo").inputValue()) === "imagem", "o tipo sugerido para um prompt é Imagem");
  await fits("novo prompt");
  await save();
  await toast("Prompt guardado");
  await noDialog();
  await db(item("Rosto do Fra' Salvio", "content || '|' || category || '|' || (avatar_id = '" + fra + "')::text"), `${prompt}|imagem|true`, "o prompt fica guardado, ligado ao avatar, com as quebras de linha");
  await row("Rosto do Fra' Salvio").getByRole("button", { name: "Copiar prompt" }).click();
  await toast("Prompt copiado");
  assert((await clipboard()) === prompt, "“Copiar prompt” leva o texto exato");
  await row("Rosto do Fra' Salvio").getByText("🇮🇹 Fra' Salvio · Imagem", { exact: true }).waitFor();
  ok("a linha diz de qual avatar é e o tipo");

  // ---------------------------------------------------------------
  section("Enviar arquivos (vários de uma vez)");
  // arquivo grande demais: aparece recusado antes de enviar (51 MB num arquivo vazio no disco: o Playwright não
  // aceita um conteúdo desse tamanho em memória)
  const big = join(temp, "video-grande.mp4");
  writeFileSync(big, "");
  truncateSync(big, 51 * 1024 * 1024);
  await page.getByLabel("Arquivos para enviar").setInputFiles(big);
  await dialog().getByRole("heading", { name: "Enviar arquivos" }).waitFor();
  await dialog().getByText(/O arquivo tem 51 MB: o limite é 50 MB por arquivo/).waitFor();
  assert(await dialog().getByRole("button", { name: "Enviar", exact: true }).isDisabled(), "arquivo acima de 50 MB já aparece recusado, antes de enviar (e não há o que enviar)");
  await dialog().getByRole("button", { name: "Cancelar", exact: true }).click();
  await noDialog();
  // dois de uma vez (com acento no nome)
  await page.getByLabel("Arquivos para enviar").setInputFiles([
    { name: "referência do rosto.png", mimeType: "image/png", buffer: pngA },
    { name: "Ebook 7 receitas.pdf", mimeType: "application/pdf", buffer: pdf },
  ]);
  await dialog().getByRole("heading", { name: "Enviar arquivos" }).waitFor();
  await field("De qual avatar").selectOption({ label: "🇮🇹 Fra' Salvio" });
  await fits("enviar arquivos");
  await shot("j20-enviar");
  await dialog().getByRole("button", { name: "Enviar 2" }).click();
  await toast("2 arquivos guardados");
  await noDialog();
  await db(item("referência do rosto", "file_name || '|' || file_size || '|' || category || '|' || file_type || '|' || (avatar_id = '" + fra + "')::text"), `referência do rosto.png|${pngA.length}|imagem|image/png|true`, "cada arquivo vira um item com o nome do arquivo (sem a extensão) como título, o tipo e o avatar");
  await db(item("Ebook 7 receitas", "category || '|' || (thumb_path is null)::text"), "texto|true", "o PDF vira um item de Texto (sem miniatura)");
  assert(psql("select count(*) from public.library_items where file_name = 'video-grande.mp4'") === "0", "(o arquivo grande não foi guardado)");
  await db(objectsOf("referência do rosto"), "miniatura.jpg,referencia-do-rosto.png", "no armazenamento: o arquivo (com o nome sem acento) e a miniatura");
  assert(psql(item("referência do rosto", `split_part(file_path, '/', 1) = '${uid}'`)) === "true", "dentro da pasta do próprio usuário");

  const photo = row("referência do rosto");
  await photo.locator("img").waitFor();
  assert(await photo.locator("img").evaluate((img) => img.complete && img.naturalWidth > 0 && img.naturalWidth <= 320), "a miniatura (até 320 px, feita no aparelho) aparece na lista");
  const openHref = await photo.getByRole("link", { name: "Abrir referência do rosto" }).getAttribute("href");
  const opened = await fetch(openHref);
  assert(opened.status === 200 && Buffer.from(await opened.arrayBuffer()).equals(pngA), "“Abrir” mostra a imagem guardada, igualzinha");
  assert(/\/storage\/v1\/object\/sign\/arquivos\//.test(openHref) && /token=/.test(openHref), "pelo link temporário assinado (o bucket é privado)");
  const unsigned = await fetch(openHref.replace("/object/sign/", "/object/public/").replace(/\?.*$/, ""));
  assert(unsigned.status >= 400, "sem a assinatura, o mesmo arquivo não abre (o bucket não é público)");
  const [download] = await Promise.all([page.waitForEvent("download"), row("Ebook 7 receitas").getByRole("link", { name: "Baixar Ebook 7 receitas" }).click()]);
  assert(download.suggestedFilename() === "Ebook 7 receitas.pdf", `“Baixar” usa o nome original (${download.suggestedFilename()})`);
  assert(readFileSync(await download.path()).equals(pdf), "e baixa o arquivo igualzinho");
  await page.getByText("1 prompt · 2 arquivos").waitFor();
  ok("a tela soma o que está guardado");
  await overflow("a lista");
  await shot("j30-lista");

  // ---------------------------------------------------------------
  section("Busca e filtros");
  const titles = async () => page.getByRole("list", { name: "Arquivos e prompts" }).locator(":scope > li p.font-medium").allInnerTexts();
  await page.getByRole("radio", { name: "Prompts" }).click();
  assert((await titles()).join("|") === "Rosto do Fra' Salvio", "“Prompts” mostra só os prompts");
  await page.getByRole("radio", { name: "Arquivos" }).click();
  assert((await titles()).join("|") === "Ebook 7 receitas|referência do rosto", "“Arquivos” mostra só os arquivos (os mais novos primeiro)");
  await page.getByRole("radio", { name: "Tudo" }).click();
  await control("Tipo").selectOption("texto");
  assert((await titles()).join("|") === "Ebook 7 receitas", "filtro por tipo");
  await control("Tipo").selectOption("todas");
  await control("Buscar em arquivos e prompts").fill("FRANCISCANO");
  assert((await titles()).join("|") === "Rosto do Fra' Salvio", "a busca olha dentro do texto do prompt, sem diferença de maiúsculas");
  await control("Buscar em arquivos e prompts").fill("receitas pdf");
  assert((await titles()).join("|") === "Ebook 7 receitas", "e no nome do arquivo");
  await control("Buscar em arquivos e prompts").fill("nada disso existe");
  await page.getByText("Nada encontrado").waitFor();
  await page.getByRole("button", { name: "Limpar filtros" }).click();
  assert((await titles()).length === 3, "“Limpar filtros” volta a mostrar tudo");
  await control("Avatar").selectOption("geral");
  await page.getByText("Nada encontrado").waitFor();
  ok("“Só os gerais”: nenhum item sem avatar por enquanto");
  await control("Avatar").selectOption("todos");

  // ---------------------------------------------------------------
  section("Editar: título, avatar, anexar, trocar e tirar o arquivo");
  await page.getByRole("button", { name: "Editar Ebook 7 receitas" }).click();
  await dialog().getByRole("heading", { name: "Editar item" }).waitFor();
  await field("Título").fill("Ebook gratuito: 7 receitas do convento");
  await field("Avatar").selectOption({ label: "Geral (todos os avatares)" });
  await save();
  await toast("Item salvo");
  await noDialog();
  await db(item("Ebook gratuito: 7 receitas do convento", "(avatar_id is null)::text || '|' || file_name"), "true|Ebook 7 receitas.pdf", "título e avatar corrigidos; o arquivo continua o mesmo");

  // anexar uma imagem ao prompt (a imagem que ele gerou)
  await page.getByRole("button", { name: "Editar Rosto do Fra' Salvio" }).click();
  await dialog().getByLabel("Escolher o arquivo do item").setInputFiles({ name: "resultado.png", mimeType: "image/png", buffer: pngB });
  await dialog().getByText("vai ser enviado ao salvar").waitFor();
  await fits("anexar arquivo");
  await shot("j40-anexar");
  await save();
  await toast("Item salvo");
  await noDialog();
  await db(item("Rosto do Fra' Salvio", "file_name || '|' || (thumb_path is not null)::text || '|' || (content is not null)::text"), "resultado.png|true|true", "o prompt ganha a imagem (com miniatura) e continua com o texto");
  await row("Rosto do Fra' Salvio").getByText("resultado.png", { exact: true }).waitFor();
  await row("Rosto do Fra' Salvio").getByRole("button", { name: "Copiar prompt" }).waitFor();
  await row("Rosto do Fra' Salvio").getByRole("link", { name: "Abrir Rosto do Fra' Salvio" }).waitFor();
  ok("a linha mostra o prompt (com Copiar) e o arquivo (com Abrir e Baixar)");

  // trocar o arquivo: o antigo sai do armazenamento
  const before = psql(item("referência do rosto", "file_path"));
  await page.getByRole("button", { name: "Editar referência do rosto" }).click();
  await dialog().getByRole("button", { name: "Trocar" }).waitFor();
  await dialog().getByLabel("Escolher o arquivo do item").setInputFiles({ name: "rosto novo.png", mimeType: "image/png", buffer: pngB });
  await save();
  await toast("Item salvo");
  await noDialog();
  await db(item("referência do rosto", "file_name"), "rosto novo.png", "trocar o arquivo guarda o novo");
  await db(`select count(*) from storage.objects where name = '${before}'`, "0", "e o antigo sai do armazenamento");
  await db(objectsOf("referência do rosto"), "miniatura.jpg,rosto-novo.png", "(sobram só o arquivo novo e a miniatura dele)");

  // tirar o arquivo do prompt
  await page.getByRole("button", { name: "Editar Rosto do Fra' Salvio" }).click();
  await dialog().getByRole("button", { name: "Tirar" }).click();
  await dialog().getByText("O arquivo sai do item ao salvar.").waitFor();
  await save();
  await toast("Item salvo");
  await noDialog();
  await db(item("Rosto do Fra' Salvio", "coalesce(file_path, 'sem arquivo') || '|' || left(content, 7)"), "sem arquivo|Retrato", "“Tirar” deixa só o prompt");
  await db(objectsOf("Rosto do Fra' Salvio"), "", "e apaga a imagem (e a miniatura) do armazenamento");
  // um item só com arquivo não pode perder o arquivo sem ganhar um prompt
  await page.getByRole("button", { name: "Editar Ebook gratuito: 7 receitas do convento" }).click();
  await dialog().getByRole("button", { name: "Tirar" }).click();
  await save();
  await dialog().getByText("Escreva o prompt ou anexe um arquivo.").waitFor();
  ok("item só com arquivo não fica vazio");
  await dialog().getByRole("button", { name: "Cancelar", exact: true }).click();
  await noDialog();
  assert(psql(item("Ebook gratuito: 7 receitas do convento", "file_name")) === "Ebook 7 receitas.pdf", "(nada mudou)");

  // ---------------------------------------------------------------
  section("A partir da página do avatar");
  await page.goto(`${BASE}/avatar?id=${fra}`);
  const shortcut = page.locator("div", { has: page.getByRole("heading", { name: "Arquivos e prompts", exact: true }) }).last();
  await page.getByRole("heading", { name: "Arquivos e prompts", exact: true }).waitFor({ timeout: 30000 });
  await page.getByText("1 prompt · 1 arquivo deste avatar.").waitFor();
  ok("a Visão geral do avatar resume o que está guardado dele");
  await page.getByRole("link", { name: "Abrir", exact: true }).last().click();
  await page.getByRole("heading", { name: "Arquivos e prompts", exact: true }).waitFor();
  await page.waitForFunction(() => location.pathname === "/arquivos" && location.search === "");
  assert((await control("Avatar").inputValue()) === fra, "“Abrir” chega com o filtro do avatar (e o endereço fica limpo)");
  assert((await titles()).join("|") === "referência do rosto|Rosto do Fra' Salvio", "só os itens dele");
  await page.getByRole("button", { name: "Novo prompt" }).click();
  assert((await field("Avatar").inputValue()) === fra, "um prompt novo daqui já vem com o avatar escolhido");
  await dialog().getByRole("button", { name: "Cancelar", exact: true }).click();
  await noDialog();
  void shortcut;

  // ---------------------------------------------------------------
  section("Outro usuário do mesmo Supabase não vê nem mexe em nada");
  const other = { email: "outra.pessoa@exemplo.com", password: "outra-senha-de-teste-456" };
  const created = await fetch(`${API}/auth/v1/admin/users`, {
    method: "POST",
    headers: { authorization: `Bearer ${SERVICE}`, apikey: SERVICE, "content-type": "application/json" },
    body: JSON.stringify({ ...other, email_confirm: true }),
  });
  const otherId = (await created.json()).id;
  try {
    const otherToken = await login(other.email, other.password);
    const as = (bearer) => ({ apikey: ANON, authorization: `Bearer ${bearer}`, "content-type": "application/json" });
    const listed = await (await fetch(`${API}/rest/v1/library_items?select=id`, { headers: as(otherToken) })).json();
    assert(Array.isArray(listed) && listed.length === 0, "a lista de arquivos e prompts dele vem vazia (a do dono não aparece)");
    const path = psql(item("referência do rosto", "file_path"));
    const signed = await (await fetch(`${API}/storage/v1/object/sign/arquivos`, { method: "POST", headers: as(otherToken), body: JSON.stringify({ expiresIn: 60, paths: [path] }) })).json();
    assert(Array.isArray(signed) && signed.length === 1 && !signed[0].signedURL, "não consegue gerar link para o arquivo do dono");
    const direct = await fetch(`${API}/storage/v1/object/authenticated/arquivos/${path}`, { headers: as(otherToken) });
    assert(direct.status >= 400, `nem baixar direto (resposta ${direct.status})`);
    const planted = await fetch(`${API}/storage/v1/object/arquivos/${uid}/intruso/nota.txt`, { method: "POST", headers: { ...as(otherToken), "content-type": "text/plain" }, body: "oi" });
    assert(planted.status >= 400, "não consegue pôr arquivo na pasta do dono");
    await fetch(`${API}/storage/v1/object/arquivos`, { method: "DELETE", headers: as(otherToken), body: JSON.stringify({ prefixes: [path] }) });
    assert(psql(`select count(*) from storage.objects where name = '${path}'`) === "1", "nem apagar o arquivo do dono");
    const anonymous = await (await fetch(`${API}/storage/v1/object/sign/arquivos`, { method: "POST", headers: as(ANON), body: JSON.stringify({ expiresIn: 60, paths: [path] }) })).json();
    assert(!Array.isArray(anonymous) || !anonymous[0]?.signedURL, "sem login, também não");
    const own = await fetch(`${API}/storage/v1/object/arquivos/${otherId}/teste/nota.txt`, { method: "POST", headers: { ...as(otherToken), "content-type": "text/plain" }, body: "na minha pasta" });
    assert(own.status === 200, "(na pasta dele mesmo, ele consegue: a regra é por pasta de usuário)");
  } finally {
    await fetch(`${API}/auth/v1/admin/users/${otherId}`, { method: "DELETE", headers: { authorization: `Bearer ${SERVICE}`, apikey: SERVICE } });
  }

  // ---------------------------------------------------------------
  section("Restaurar um backup");
  assert(psql("select public.cda_schema_version()") === "4", "(o banco de testes está na versão atual do script: 4)");
  await page.goto(`${BASE}/configuracoes`);
  await page.getByRole("heading", { name: "Backup", exact: true }).waitFor({ timeout: 30000 });
  await page.getByText(/o backup leva os prompts inteiros e só\s+o nome de cada arquivo/).waitFor();
  const [backupDownload] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Baixar backup" }).click()]);
  const backup = JSON.parse(readFileSync(await backupDownload.path(), "utf8"));
  assert(backup.tables.library_items.length === 3 && backup.tables.library_items.every((entry) => !("user_id" in entry)), "o backup leva os 3 itens (sem o dono da linha)");
  // o que o painel mostra antes de restaurar
  const backupFile = join(temp, "backup.json");
  writeFileSync(backupFile, JSON.stringify(backup));
  await page.getByLabel("Arquivo de backup para restaurar").setInputFiles(backupFile);
  await dialog().getByRole("heading", { name: "Restaurar backup" }).waitFor();
  await dialog().getByText("3 itens em Arquivos e prompts").waitFor();
  {
    const listed = (await dialog().locator("li").allInnerTexts()).join(" | ");
    assert(/o nome de 2 arquivos \(os arquivos em si continuam no Supabase/.test(listed), `a lista diz quantos arquivos o backup cita (${listed})`);
  }
  ok("a janela de restaurar conta os itens e explica que os arquivos ficam no Supabase");
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
  // um backup sem a lista (feito antes de ela existir): os itens de agora ficam, cada um no seu avatar
  const { library_items: _dropped, ...oldTables } = backup.tables;
  await restore({ ...backup, tables: oldTables });
  assert(psql("select count(*) from public.library_items") === "3", "backup antigo (sem a lista): os itens de agora continuam");
  assert(psql(item("referência do rosto", `avatar_id = '${fra}'`)) === "true", "e continuam ligados ao avatar (que voltou com o backup)");
  // um backup com a lista: troca pelo que está nele
  psql("delete from public.library_items where title = 'referência do rosto'");
  await restore(backup);
  assert(psql("select count(*) from public.library_items") === "3" && psql(item("referência do rosto", "file_name")) === "rosto novo.png", "backup com a lista: o item apagado volta (com o nome do arquivo)");
  // um item cujo arquivo já não existe no armazenamento (ex.: backup antigo de um arquivo apagado depois)
  psql(`insert into public.library_items (user_id, title, category, content, file_path, file_name, file_size, file_type) values ('${uid}', 'Arquivo que sumiu', 'imagem', 'o prompt continua', '${uid}/nao-existe/abc-sumiu.png', 'sumiu.png', 10, 'image/png')`);
  await page.reload();
  await openLibrary();
  await row("referência do rosto").locator("img").waitFor();
  ok("e o arquivo dele abre normalmente (ele nunca saiu do armazenamento)");
  await row("Arquivo que sumiu").getByText(/Arquivo não encontrado no armazenamento/).waitFor();
  await row("Arquivo que sumiu").getByRole("button", { name: "Copiar prompt" }).waitFor();
  ok("item de um arquivo que não existe mais diz isso (e o prompt continua copiável)");
  psql("delete from public.library_items where title = 'Arquivo que sumiu'");

  // ---------------------------------------------------------------
  section("Apagar");
  const ebookPath = psql(item("Ebook gratuito: 7 receitas do convento", "file_path"));
  await page.getByRole("button", { name: "Editar Ebook gratuito: 7 receitas do convento" }).click();
  await dialog().getByRole("button", { name: "Apagar" }).click();
  await dialog().getByText("O item e o arquivo guardado nele são apagados de vez. Esta ação não pode ser desfeita.").waitFor();
  await dialog().getByRole("button", { name: "Apagar", exact: true }).click();
  await toast("Item apagado");
  await noDialog();
  await db("select count(*) from public.library_items where title like 'Ebook%'", "0", "o item sai da lista");
  await db(`select count(*) from storage.objects where name = '${ebookPath}'`, "0", "e o arquivo sai do armazenamento");

  // apagar o avatar: os itens dele ficam, como gerais
  await page.goto(`${BASE}/avatar?id=${fra}`);
  await page.getByRole("button", { name: "Apagar avatar" }).click();
  await dialog().getByText(/Os arquivos e prompts dele continuam guardados, como gerais\./).waitFor();
  await dialog().getByRole("textbox").fill("Fra' Salvio");
  await dialog().getByRole("button", { name: "Apagar avatar" }).click();
  await page.getByRole("heading", { name: "Países", exact: true }).waitFor({ timeout: 30000 });
  await db("select string_agg(title || '=' || coalesce(avatar_id::text, 'geral'), ',' order by title) from public.library_items", "referência do rosto=geral,Rosto do Fra' Salvio=geral", "apagar o avatar deixa os itens dele guardados, como gerais");
  await openLibrary();
  await row("referência do rosto").getByText("Geral · Imagem", { exact: false }).waitFor();
  ok("e a tela mostra os dois como gerais");

  rmSync(temp, { recursive: true, force: true });
  resetData();
  await finish(session);
})().catch(fail);
