// Teste de ponta a ponta da ETAPA (c): cofre de senhas.
//
//   node dev/e2e/etapa-c.cjs      (com o app rodando em http://localhost:3000)
//
// Confere o comportamento na tela E o que realmente sai do aparelho: nenhuma
// requisição pode levar a senha-mestra ou uma senha em texto claro, e o banco
// só pode ter texto cifrado.
const { chromium } = require("playwright");
const { execFileSync } = require("node:child_process");
const { join } = require("node:path");
const { BASE, psql, resetData, ok, section, assert, openPhone, finish, fail } = require("./helpers.cjs");

// Roda de novo o supabase/schema.sql no banco local (como o dono faz no SQL Editor do Supabase).
const applySchema = () => execFileSync("node", [join(__dirname, "..", "local.mjs"), "schema"], { stdio: "ignore" });

const MASTER = "frase mestra de teste 2026";
const MASTER2 = "outra frase mestra 9876";
const IG = "Insta#Senha!42";
const IG2 = "NovaSenha-Insta-77";
const MAIL = "senha-do-email-çã";
const RECOVERY = "recupera.frasalvio@exemplo.com";
const CODES = "1111 2222\n3333 4444";
const OLD_IG = "senha-da-conta-antiga";
const PLAINTEXTS = [MASTER, MASTER2, IG, IG2, MAIL, RECOVERY, "1111 2222", OLD_IG];

const vaultJson = () => psql("select coalesce(vault::text, '') from public.settings");
const secretsOf = (generation) => psql(`select coalesce(secrets_enc, '') from public.accounts where generation = ${generation}`);

(async () => {
  resetData();
  const session = await openPhone(chromium, { timezoneId: "UTC" });
  const { page, dialog, shot, toast, save, noDialog, overflow, clipboard, more } = session;

  // Tudo que sai do navegador (endereço + corpo) fica anotado para a conferência final.
  const sent = [];
  const watch = (context) => context.on("request", (request) => sent.push(`${request.url()}\n${request.postData() || ""}`));
  watch(page.context());

  await session.login();
  const avatarId = psql("select id from public.avatars where name = 'Fra'' Salvio'");
  const accountTab = async (p = page) => {
    await p.goto(`${BASE}/avatar?id=${avatarId}&aba=conta`);
    await p.getByRole("heading", { name: "Senhas e códigos" }).waitFor({ timeout: 30000 });
  };
  const field = (label) => dialog().getByLabel(label, { exact: true });
  const inPage = async (text) => (await page.content()).includes(text);
  // mensagem de erro dentro da janela aberta
  const formError = (text) => dialog().getByRole("alert").filter({ hasText: text }).waitFor();

  // ---------------------------------------------------------------
  section("Sem cofre: criar a senha-mestra (com o aviso bem claro)");
  await accountTab();
  await page.getByText("Ainda sem cofre").waitFor();
  await page.getByRole("button", { name: "Criar senha-mestra" }).click();
  await dialog().getByText("as senhas guardadas não podem ser recuperadas").waitFor();
  ok("avisa que, sem a senha-mestra, as senhas guardadas não podem ser recuperadas");
  await shot("c10-criar-senha-mestra");
  await overflow("criar senha-mestra");
  await field("Senha-mestra").fill("onze letras");
  await field("Repita a senha-mestra").fill("onze letras");
  await save("Criar cofre");
  await formError("pelo menos 12 caracteres");
  ok("senha-mestra curta é recusada");
  for (const weak of ["senhasenhasenha", "password12345678", "123456789012"]) {
    await field("Senha-mestra").fill(weak);
    await field("Repita a senha-mestra").fill(weak);
    await save("Criar cofre");
    await formError("fácil de adivinhar");
  }
  ok("senhas-mestras óbvias (repetição, sequência, “password…”) são recusadas");
  await field("Senha-mestra").fill(MASTER);
  await dialog().getByText(/Força: forte/).waitFor();
  await field("Repita a senha-mestra").fill(MASTER + "x");
  await save("Criar cofre");
  await formError("As duas senhas não são iguais");
  ok("senhas diferentes são recusadas");
  await field("Repita a senha-mestra").fill(MASTER);
  await save("Criar cofre");
  await formError("Marque a caixa");
  ok("exige marcar “Entendi” no aviso");
  assert(vaultJson() === "", "nada foi gravado enquanto o formulário não estava correto");
  const hidden = (el) => el.type === "password" || getComputedStyle(el).getPropertyValue("-webkit-text-security") === "disc";
  assert(await field("Senha-mestra").evaluate(hidden), "o campo da senha-mestra fica escondido");
  assert(
    (await field("Senha-mestra").getAttribute("type")) === "text" && (await field("Senha-mestra").getAttribute("autocomplete")) === "off",
    "…e não é um campo de senha do navegador (ele não oferece “salvar senha” nem preenche sozinho)",
  );
  await dialog().getByRole("checkbox").check();
  await save("Criar cofre");
  await toast("Cofre criado e aberto");
  await noDialog();
  const vault = JSON.parse(vaultJson());
  assert(
    Object.keys(vault).sort().join(",") === "check,iterations,kdf,salt,v" && vault.kdf === "PBKDF2-SHA256" && vault.iterations === 600000,
    "o banco guarda só o sal, as rodadas (PBKDF2, 600 mil) e o teste de conferência",
  );
  assert(!vaultJson().includes(MASTER), "a senha-mestra não está no banco");

  // ---------------------------------------------------------------
  section("Guardar as senhas de uma conta");
  await page.getByText("Nenhuma senha guardada para esta conta.").waitFor();
  await page.getByRole("button", { name: "Adicionar senhas" }).click();
  await field("Senha do Instagram").fill(IG);
  await field("Senha do e-mail").fill(MAIL);
  await field("E-mail de recuperação").fill(RECOVERY);
  await field("Códigos de backup / 2FA").fill(CODES);
  const masked = await field("Senha do Instagram").evaluate(
    (el) => el.type === "password" || getComputedStyle(el).getPropertyValue("-webkit-text-security") === "disc",
  );
  assert(masked, "o que é digitado no formulário fica coberto");
  await dialog().getByRole("button", { name: "Mostrar a senha do Instagram" }).click();
  const unmasked = await field("Senha do Instagram").evaluate(
    (el) => el.type === "text" && getComputedStyle(el).getPropertyValue("-webkit-text-security") !== "disc",
  );
  assert(unmasked, "o botão de mostrar revela o que foi digitado");
  await shot("c11-senhas-form");
  await overflow("formulário de senhas");
  await save();
  await toast("Senhas guardadas no cofre");
  await noDialog();
  const stored = secretsOf(2);
  assert(/^v1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{300,}$/.test(stored), "o banco recebeu um bloco cifrado");
  assert(
    PLAINTEXTS.every((text) => !stored.includes(text)) && !stored.includes(Buffer.from(IG).toString("base64url")),
    "o bloco cifrado não contém nenhuma senha em texto claro",
  );
  assert(psql("select count(*) from public.activity_log where message = 'Senhas atualizadas no cofre'") === "1", "a linha do tempo registra (sem o conteúdo)");

  // ---------------------------------------------------------------
  section("Escondidas por padrão; mostrar e copiar");
  await page.getByText("Cofre aberto").waitFor();
  assert((await page.getByText("••••••••••").count()) === 4, "os quatro campos aparecem escondidos");
  assert(!(await inPage(IG)) && !(await inPage(MAIL)), "as senhas não estão escritas na página");
  await shot("c12-senhas-escondidas");
  await page.getByRole("button", { name: "Mostrar a senha do Instagram" }).click();
  await page.getByText(IG, { exact: true }).waitFor();
  ok("“mostrar” revela a senha do Instagram");
  assert((await page.getByText("••••••••••").count()) === 3, "os outros campos continuam escondidos");
  await shot("c13-senha-a-mostra");
  await page.getByRole("button", { name: "Esconder a senha do Instagram" }).click();
  await page.waitForFunction((text) => !document.body.innerText.includes(text), IG);
  ok("“esconder” cobre de novo");
  await page.getByRole("button", { name: "Copiar a senha do Instagram" }).click();
  await toast("Senha do Instagram copiada");
  assert((await clipboard()) === IG, "copiar leva a senha certa (sem precisar mostrar)");
  await page.getByRole("button", { name: "Copiar os códigos de backup" }).click();
  await toast("Códigos copiados");
  assert((await clipboard()) === CODES, "os códigos de backup são copiados com as quebras de linha");
  await page.getByRole("button", { name: "Copiar a senha do e-mail" }).click();
  assert((await clipboard()) === MAIL, "senha com acentos volta idêntica");

  // À mostra, o campo se esconde sozinho depois de 30 segundos.
  await page.getByRole("button", { name: "Mostrar o e-mail de recuperação" }).click();
  await page.getByText(RECOVERY, { exact: true }).waitFor();
  await page.waitForFunction((text) => !document.body.innerText.includes(text), RECOVERY, { timeout: 45000 });
  ok("um campo à mostra se esconde sozinho depois de alguns segundos");

  // Trocar de aba dentro do avatar esconde o que estava à mostra.
  await page.getByRole("button", { name: "Mostrar a senha do Instagram" }).click();
  await page.getByText(IG, { exact: true }).waitFor();
  await page.getByRole("tab", { name: /^Aquecimento/ }).click();
  await page.getByRole("heading", { name: "Calendário" }).waitFor();
  await page.getByRole("tab", { name: /^Conta atual/ }).click();
  await page.getByRole("heading", { name: "Senhas e códigos" }).waitFor();
  assert((await page.getByText("••••••••••").count()) === 4 && !(await inPage(IG)), "trocar de aba esconde o que estava à mostra");

  // Trocar de tela também esconde.
  await page.getByRole("button", { name: "Mostrar a senha do Instagram" }).click();
  await page.getByText(IG, { exact: true }).waitFor();
  await page.getByRole("link", { name: "Hoje" }).click();
  await page.getByRole("heading", { name: "Para fazer hoje" }).waitFor();
  await page.waitForTimeout(400);
  assert(!(await inPage(IG)), "trocar de tela esconde o que estava à mostra (nem a tela guardada fica com a senha)");

  // ---------------------------------------------------------------
  section("Trancar e destrancar");
  await accountTab();
  await page.getByText("Cofre trancado").waitFor();
  ok("recarregar a página tranca o cofre (a chave não é guardada no aparelho)");
  const storage = await page.evaluate(async () => {
    const dump = JSON.stringify([Object.entries(localStorage), Object.entries(sessionStorage), document.cookie]);
    const dbs = indexedDB.databases ? (await indexedDB.databases()).map((d) => d.name) : [];
    return { dump, dbs };
  });
  assert(PLAINTEXTS.every((text) => !storage.dump.includes(text)), "nada do cofre fica no armazenamento do navegador");
  assert(storage.dbs.length === 0, "nenhum banco local é criado no navegador");
  await page.getByText("Esta conta tem senhas guardadas. Destranque o cofre para ver.").waitFor();
  await shot("c14-trancado");
  await page.getByRole("button", { name: "Destrancar" }).click();
  await field("Senha-mestra").fill("senha errada 123");
  await save("Destrancar");
  await formError("Senha-mestra incorreta.");
  ok("senha-mestra errada é recusada");
  await field("Senha-mestra").fill(MASTER);
  await save("Destrancar");
  await toast("Cofre aberto");
  await noDialog();
  await page.getByText("••••••••••").first().waitFor();
  await page.getByRole("button", { name: "Copiar a senha do Instagram" }).click();
  assert((await clipboard()) === IG, "(senha copiada)");
  await page.getByRole("button", { name: "Trancar o cofre" }).click();
  await toast("Cofre trancado");
  assert((await clipboard()) === "", "trancar também tira a senha copiada da área de transferência");
  await page.getByText("Esta conta tem senhas guardadas. Destranque o cofre para ver.").waitFor();
  assert((await page.getByText("••••••••••").count()) === 0, "trancar tira as senhas da tela na hora");

  // ---------------------------------------------------------------
  section("Trancar sozinho por falta de uso");
  await more("Configurações");
  await page.getByText("1 conta com senhas guardadas").waitFor();
  await page.getByLabel("Tempo sem uso até o cofre trancar sozinho").selectOption("1");
  await toast("O cofre vai trancar depois de 1 minuto sem uso");
  assert(psql("select prefs->>'vault_lock_minutes' from public.settings") === "1", "o tempo escolhido fica salvo");
  await page.getByRole("button", { name: "Destrancar" }).click();
  await field("Senha-mestra").fill(MASTER);
  await save("Destrancar");
  await toast("Cofre aberto");
  await noDialog();
  await page.getByText("Aberto neste aparelho.").waitFor();
  await shot("c15-config-cofre");
  await overflow("Configurações");
  // uma janela com a senha-mestra digitada (e não enviada) fica esquecida aberta
  await page.getByRole("button", { name: "Trocar senha-mestra" }).click();
  await field("Senha-mestra atual").fill(MASTER);
  console.log("  … esperando 1 minuto sem tocar em nada");
  await Promise.all([
    page.locator(".cda-toast", { hasText: "Cofre trancado por falta de uso" }).waitFor({ timeout: 80000 }),
    page.locator(".cda-toast", { hasText: "Janela fechada por falta de uso" }).waitFor({ timeout: 80000 }),
  ]);
  ok("depois de 1 minuto sem uso, o cofre tranca sozinho e avisa");
  await noDialog();
  assert(!(await inPage(MASTER)), "a janela esquecida aberta é fechada, e a senha-mestra digitada nela some");
  await page.getByText("Trancado.", { exact: true }).waitFor();
  await page.getByLabel("Tempo sem uso até o cofre trancar sozinho").selectOption("5");
  await toast("O cofre vai trancar depois de 5 minutos sem uso");

  // ---------------------------------------------------------------
  section("Trocar a senha-mestra");
  const before = JSON.parse(vaultJson());
  // (com o cofre aberto neste aparelho)
  await page.getByRole("button", { name: "Destrancar" }).click();
  await field("Senha-mestra").fill(MASTER);
  await save("Destrancar");
  await toast("Cofre aberto");
  await noDialog();

  // Banco com o script antigo (sem a função que grava a troca de uma vez): o painel explica o que fazer.
  psql("drop function public.cda_vault_rekey(text, jsonb, jsonb); drop function public.cda_schema_version(); notify pgrst, 'reload schema'");
  await page.waitForTimeout(1500);
  await page.getByRole("button", { name: "Trocar senha-mestra" }).click();
  await dialog().getByText("o banco de dados precisa de uma atualização").waitFor();
  await dialog().getByRole("button", { name: "Copiar script SQL" }).click();
  await toast("Script copiado");
  assert((await clipboard()).includes("cda_vault_rekey"), "sem a função no banco, a janela ensina a atualizar e entrega o script");
  await shot("c18-atualizar-banco");
  applySchema();
  await page.waitForTimeout(1500);
  await dialog().getByRole("button", { name: "Já rodei" }).click();
  await field("Senha-mestra atual").waitFor();
  ok("depois de rodar o script, a troca fica disponível");

  await field("Senha-mestra atual").fill("não é essa a senha");
  await field("Nova senha-mestra").fill(MASTER2);
  await field("Repita a nova senha-mestra").fill(MASTER2);
  await save("Trocar senha");
  await formError("Senha-mestra incorreta.");
  assert(JSON.stringify(JSON.parse(vaultJson())) === JSON.stringify(before), "com a senha atual errada, nada muda");
  assert(secretsOf(2) === stored, "…nem as senhas guardadas");

  // A troca é "tudo ou nada": se a lista de senhas recifradas não bate com o banco, nem a configuração muda.
  const uid = psql("select user_id from public.settings");
  let refused = false;
  try {
    psql(
      `begin; select set_config('request.jwt.claims', '{"sub":"${uid}"}', true); ` +
        `select public.cda_vault_rekey('${before.salt}', '{"v":1}'::jsonb, '{}'::jsonb); commit;`,
    );
  } catch {
    refused = true;
  }
  assert(refused && JSON.parse(vaultJson()).salt === before.salt && secretsOf(2) === stored, "o banco desfaz a troca inteira se faltar a senha de alguma conta");

  await field("Senha-mestra atual").fill(MASTER);
  await save("Trocar senha");
  await toast("Senha-mestra trocada");
  await noDialog();
  const after = JSON.parse(vaultJson());
  assert(after.salt !== before.salt && after.check !== before.check, "o cofre passa a ter outro sal e outro teste de conferência");
  const moved = secretsOf(2);
  assert(moved !== stored && moved.length === stored.length, "as senhas guardadas foram cifradas de novo, com a chave da senha nova");
  assert(PLAINTEXTS.every((text) => !moved.includes(text)), "…e continuam sem nada em texto claro");
  // o cofre estava aberto: continua aberto, já com a chave nova, e as senhas seguem abrindo
  await page.getByText("Aberto neste aparelho.").waitFor();
  await page.waitForTimeout(600);
  assert((await page.locator(".cda-toast", { hasText: "mudou em outro aparelho" }).count()) === 0, "a troca feita aqui não é confundida com uma mudança em outro aparelho");
  await page.goBack(); // volta para a conta, sem recarregar
  await page.getByRole("heading", { name: "Senhas e códigos" }).waitFor();
  await page.getByRole("button", { name: "Copiar a senha do Instagram" }).click();
  assert((await clipboard()) === IG, "com o cofre aberto durante a troca, as senhas continuam abrindo (agora com a chave nova)");
  await page.goForward();
  await page.getByRole("heading", { name: "Configurações", exact: true }).waitFor();
  await page.getByRole("button", { name: "Trancar agora" }).click();
  await toast("Cofre trancado");
  await page.getByRole("button", { name: "Destrancar" }).click();
  await field("Senha-mestra").fill(MASTER);
  await save("Destrancar");
  await formError("Senha-mestra incorreta.");
  ok("a senha-mestra antiga para de valer");
  await field("Senha-mestra").fill(MASTER2);
  await save("Destrancar");
  await toast("Cofre aberto");
  await noDialog();
  await accountTab(); // (recarrega: tranca de novo)
  await page.getByRole("button", { name: "Destrancar" }).click();
  await field("Senha-mestra").fill(MASTER2);
  await save("Destrancar");
  await noDialog();
  await page.getByRole("button", { name: "Mostrar a senha do Instagram" }).click();
  await page.getByText(IG, { exact: true }).waitFor();
  ok("com a senha nova, as senhas guardadas antes continuam abrindo");

  // ---------------------------------------------------------------
  section("Outro aparelho: mesma senha-mestra, mesmas senhas");
  // (este aparelho fica com a janela de edição aberta, mostrando a versão atual)
  await page.getByRole("button", { name: "Editar", exact: true }).last().click();
  await field("Senha do Instagram").waitFor();
  const other = await openPhone(chromium, { timezoneId: "UTC" });
  watch(other.page.context());
  await other.login();
  await accountTab(other.page);
  await other.page.getByText("Cofre trancado").waitFor();
  await other.page.getByRole("button", { name: "Destrancar" }).click();
  await other.dialog().getByLabel("Senha-mestra", { exact: true }).fill(MASTER2);
  await other.save("Destrancar");
  await other.noDialog();
  await other.page.getByRole("button", { name: "Copiar a senha do Instagram" }).click();
  assert((await other.clipboard()) === IG, "o segundo aparelho abre as mesmas senhas com a senha-mestra");
  await other.page.getByRole("button", { name: "Editar", exact: true }).last().click();
  assert((await other.dialog().getByLabel("Senha do Instagram", { exact: true }).inputValue()) === IG, "editar começa com o que já estava guardado");
  await other.dialog().getByLabel("Senha do Instagram", { exact: true }).fill(`  ${IG2}  `);
  await other.save();
  await other.toast("Senhas guardadas no cofre");
  await other.noDialog();
  assert(secretsOf(2) !== moved && secretsOf(2).length === moved.length, "editar regrava o bloco (com outro IV e o mesmo tamanho)");
  // O primeiro aparelho continua com a janela aberta (versão antiga) e recebe os dados novos em
  // segundo plano, como acontece ao voltar para a aba: salvar ali não pode apagar a versão mais nova.
  const fromOther = secretsOf(2);
  await page.waitForTimeout(15500);
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await page.waitForTimeout(1500);
  await field("Senha do e-mail").fill("digitado em cima da versão antiga");
  await save();
  await formError("As senhas desta conta foram alteradas em outro aparelho");
  assert(secretsOf(2) === fromOther, "uma janela aberta com a versão antiga não grava por cima da mais nova");
  await dialog().getByRole("button", { name: "Cancelar" }).click();
  await noDialog();
  // de volta ao primeiro aparelho, recarregado
  await accountTab();
  await page.getByRole("button", { name: "Destrancar" }).click();
  await field("Senha-mestra").fill(MASTER2);
  await save("Destrancar");
  await noDialog();
  await page.getByRole("button", { name: "Copiar a senha do Instagram" }).click();
  assert((await clipboard()) === IG2, "o primeiro aparelho vê a senha alterada no outro (sem os espaços digitados em volta)");
  await other.browser.close();

  // ---------------------------------------------------------------
  section("Contas antigas (Histórico) e proteção contra troca de blocos");
  await page.getByRole("tab", { name: /^Histórico/ }).click();
  await page.getByRole("button", { name: "Senhas da conta" }).last().click(); // a 1ª geração (caída) é a última da lista
  await dialog().getByText("Nenhuma senha guardada para esta conta.").waitFor();
  await dialog().getByRole("button", { name: "Adicionar senhas" }).click();
  await field("Senha do Instagram").fill(OLD_IG);
  await save();
  await toast("Senhas guardadas no cofre");
  await page.waitForFunction(() => document.querySelectorAll("dialog[open]").length === 1);
  await dialog().getByRole("button", { name: "Copiar a senha do Instagram" }).click();
  assert((await clipboard()) === OLD_IG, "contas antigas também guardam senhas (pelo Histórico)");
  await shot("c16-historico-senhas");
  await page.keyboard.press("Escape");
  await noDialog();
  assert(secretsOf(1).startsWith("v1."), "a conta caída também tem o seu bloco cifrado");
  // alguém com acesso ao banco copia o bloco de uma conta para outra: o painel não aceita
  const good = secretsOf(2);
  psql("update public.accounts set secrets_enc = (select secrets_enc from public.accounts where generation = 1) where generation = 2");
  await accountTab();
  await page.getByRole("button", { name: "Destrancar" }).click();
  await field("Senha-mestra").fill(MASTER2);
  await save("Destrancar");
  await noDialog();
  await page.getByText("Não consegui abrir as senhas desta conta com o cofre atual.").waitFor();
  assert(!(await inPage(OLD_IG)), "o bloco de uma conta não abre se for colocado em outra");
  psql(`update public.accounts set secrets_enc = '${good}' where generation = 2`);

  // ---------------------------------------------------------------
  section("Planilha: mostra só se há senhas, nunca o conteúdo");
  await page.goto(BASE + "/planilha");
  await page.getByRole("table").waitFor({ timeout: 30000 });
  const header = await page.evaluate(() => [...document.querySelectorAll("thead th")].map((th) => th.innerText.trim()));
  const column = header.indexOf("Senhas");
  const cells = await page.evaluate((index) => [...document.querySelectorAll("tbody tr")].map((tr) => tr.querySelectorAll("td")[index].innerText.trim()), column);
  assert(column > 0 && cells.length === 2 && cells.every((text) => text === "No cofre"), "a coluna “Senhas” diz “No cofre”");
  await page.getByRole("button", { name: "Copiar", exact: true }).click();
  await toast("2 linhas copiadas");
  const copied = await clipboard();
  assert(!copied.includes("v1.") && PLAINTEXTS.every((text) => !copied.includes(text)), "a exportação não leva senhas nem o texto cifrado");

  // ---------------------------------------------------------------
  section("Remover as senhas de uma conta");
  await accountTab();
  await page.getByRole("button", { name: "Destrancar" }).click();
  await field("Senha-mestra").fill(MASTER2);
  await save("Destrancar");
  await noDialog();
  await page.getByRole("button", { name: "Editar", exact: true }).last().click();
  for (const label of ["Senha do Instagram", "Senha do e-mail", "E-mail de recuperação", "Códigos de backup / 2FA"]) await field(label).fill("");
  await save();
  await toast("Senhas removidas do cofre");
  await noDialog();
  assert(secretsOf(2) === "", "com tudo vazio, o bloco cifrado é apagado do banco");
  await page.getByText("Nenhuma senha guardada para esta conta.").waitFor();

  // ---------------------------------------------------------------
  section("Sair da conta tranca o cofre");
  await more("Configurações");
  await page.getByText("Aberto neste aparelho.").waitFor();
  // "Sair" recarrega a página inteira: espera a recarga terminar antes de entrar de novo
  await Promise.all([page.waitForEvent("load", { timeout: 30000 }), page.getByRole("button", { name: "Sair", exact: true }).click()]);
  await page.getByRole("button", { name: "Entrar" }).waitFor({ timeout: 20000 });
  await session.login();
  await more("Configurações");
  await page.getByText("Trancado.", { exact: true }).waitFor();
  ok("depois de sair e entrar de novo, o cofre está trancado");

  // ---------------------------------------------------------------
  section("Esqueci a senha-mestra: apagar o cofre e começar de novo");
  const kept = vaultJson();
  await page.getByRole("button", { name: "Esqueci a senha-mestra" }).click();
  await dialog().getByText("Apagar o cofre e começar de novo?").waitFor();
  await dialog().getByText(/todas as senhas e códigos guardados/).waitFor();
  const confirmButton = dialog().getByRole("button", { name: "Apagar o cofre", exact: true });
  assert(await confirmButton.isDisabled(), "só libera depois de digitar APAGAR");
  await shot("c17-esqueci");
  await dialog().getByRole("textbox").fill("APAGAR");
  await confirmButton.click();
  await toast("Cofre apagado");
  assert(vaultJson() === "" && secretsOf(1) === "" && secretsOf(2) === "", "o cofre e todas as senhas cifradas são apagados");
  assert(psql("select count(*) from public.accounts") === "2", "as contas continuam no painel");
  await page.getByRole("button", { name: "Criar senha-mestra" }).waitFor();
  ok("o painel volta a oferecer “Criar senha-mestra”");

  // ---------------------------------------------------------------
  section("Dois aparelhos criando o cofre ao mesmo tempo");
  // "outro aparelho" cria o cofre enquanto esta tela ainda acha que ele não existe
  psql(`update public.settings set vault = '${kept}'::jsonb`);
  await page.getByRole("button", { name: "Criar senha-mestra" }).click();
  await field("Senha-mestra").fill(MASTER);
  await field("Repita a senha-mestra").fill(MASTER);
  await dialog().getByRole("checkbox").check();
  await save("Criar cofre");
  await formError("O cofre já existe");
  assert(vaultJson() === kept, "o cofre que já existia não é substituído");
  await dialog().getByRole("button", { name: "Cancelar" }).click();
  await noDialog();
  await page.getByText("Trancado.", { exact: true }).waitFor();
  ok("a tela passa a mostrar o cofre existente, trancado");

  // ---------------------------------------------------------------
  section("O cofre muda em outro aparelho enquanto este está aberto");
  await page.getByRole("button", { name: "Destrancar" }).click();
  await field("Senha-mestra").fill(MASTER2);
  await save("Destrancar");
  await toast("Cofre aberto");
  await noDialog();
  await page.getByRole("link", { name: "Países" }).click();
  await page.getByRole("heading", { name: "Países", exact: true }).waitFor();
  await page.getByRole("link", { name: /Fra' Salvio/ }).click();
  await page.getByRole("heading", { name: "Fra' Salvio" }).waitFor();
  await page.getByRole("tab", { name: /^Conta atual/ }).click();
  await page.getByRole("button", { name: "Adicionar senhas" }).click();
  await field("Senha do Instagram").fill(IG);
  // "outro aparelho" troca a senha-mestra (o cofre no banco passa a ter outro sal)
  const changed = { ...JSON.parse(kept), salt: Buffer.alloc(16, 7).toString("base64url") };
  psql(`update public.settings set vault = '${JSON.stringify(changed)}'::jsonb`);
  await save();
  await toast("O cofre mudou em outro aparelho");
  await noDialog();
  assert(secretsOf(2) === "", "nada é gravado com a chave que deixou de valer");
  await page.getByText("Cofre trancado").waitFor();
  ok("este aparelho tranca e passa a exigir a senha-mestra atual");

  // ---------------------------------------------------------------
  section("Apagar exemplos não apaga conta com senhas no cofre");
  // (a conta caída de exemplo tem um bloco cifrado guardado; a outra, não)
  psql("update public.accounts set secrets_enc = 'v1.AAAAAAAAAAAAAAAA.AAAAAAAAAAAAAAAAAAAAAAAAAAAA' where generation = 1");
  await page.goto(BASE + "/configuracoes");
  await page.getByRole("button", { name: "Apagar exemplos" }).click({ timeout: 30000 });
  await dialog().getByText("senhas guardadas no cofre").waitFor();
  await dialog().getByRole("button", { name: "Apagar exemplos", exact: true }).click();
  await toast("Exemplos apagados");
  assert(
    psql("select generation::text || '|' || is_example::text || '|' || (secrets_enc is not null)::text from public.accounts") === "1|false|true",
    "a conta com senhas guardadas fica (deixa de ser exemplo); a outra conta de exemplo é apagada",
  );
  assert(
    psql("select count(*)::text || '|' || bool_or(is_example)::text from public.avatars") === "1|false" &&
      psql("select count(*)::text || '|' || bool_or(is_example)::text from public.countries") === "1|false",
    "o avatar e o país dela também ficam",
  );

  // ---------------------------------------------------------------
  section("O que saiu do aparelho");
  const leaks = PLAINTEXTS.filter((text) => sent.some((entry) => entry.includes(text) || entry.includes(encodeURIComponent(text))));
  assert(sent.length > 50 && leaks.length === 0, `nenhuma das ${sent.length} requisições levou a senha-mestra ou uma senha em texto claro`);
  const hosts = [...new Set(sent.map((entry) => new URL(entry.split("\n")[0]).host))].sort();
  assert(hosts.every((host) => host === new URL(BASE).host || host === "localhost:54321"), `o painel só falou com ele mesmo e com o Supabase (${hosts.join(", ")})`);

  resetData();
  // (o 404 é esperado: é a pergunta "o banco tem a função nova?" feita enquanto ela estava removida de propósito)
  await finish(session, [/the server responded with a status of 404/]);
})().catch(fail);
