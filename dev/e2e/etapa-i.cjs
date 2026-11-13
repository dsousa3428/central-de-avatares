// Teste de ponta a ponta dos FUNIS PARA MODELAR: a aba do avatar onde ficam os avatares
// modelo e o funil de cada um (página de vendas, captura de e-mail, ebook gratuito, venda,
// e-mails recebidos…).
//
//   node dev/e2e/etapa-i.cjs      (com o app rodando em http://localhost:3000)
const { chromium } = require("playwright");
const { BASE, psql, resetData, ok, section, assert, openPhone, finish, fail } = require("./helpers.cjs");

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

const ofAvatar = (name) => `from public.avatars where name = '${name.replace(/'/g, "''")}'`;
// os modelos de um avatar, e as etapas de um modelo, como texto curto
const models = (avatar = "Fra' Salvio") =>
  `select coalesce((select string_agg(m->>'name', ' | ' order by ord) from jsonb_array_elements(kit->'funnels') with ordinality as t(m, ord)), '') ${ofAvatar(avatar)}`;
const steps = (model, avatar = "Fra' Salvio", field = "s->>'kind'") =>
  `select coalesce((select string_agg(${field}, ',' order by ord) from jsonb_array_elements((select m->'steps' from jsonb_array_elements(kit->'funnels') m where m->>'name' = '${model}')) with ordinality as t(s, ord)), '') ${ofAvatar(avatar)}`;

(async () => {
  resetData();
  const session = await openPhone(chromium, { timezoneId: "UTC" });
  const { page, dialog, shot, toast, save, noDialog, overflow, clipboard } = session;
  await session.login();
  const fra = psql(`select id ${ofAvatar("Fra' Salvio")}`);

  const field = (label) => dialog().getByLabel(label, { exact: true });
  // o cartão inteiro de um modelo
  const card = (name) => page.getByRole("heading", { name, exact: true, level: 3 }).locator("xpath=ancestor::div[contains(@class, 'rounded-2xl')][1]");
  const addStep = async (kind, values, position) => {
    await page.getByRole("button", { name: kind, exact: true }).click();
    await dialog().getByRole("heading", { name: "Nova etapa" }).waitFor();
    for (const [label, value] of Object.entries(values)) await field(label).fill(value);
    if (position) await field("Posição no funil").selectOption({ label: position });
    await save();
    await toast("Etapa salva");
    await noDialog();
  };
  // a janela não pode rolar para o lado
  const fits = async (where) => {
    const extra = await dialog().evaluate((element) => {
      const body = element.querySelector(".overflow-y-auto");
      return body ? body.scrollWidth - body.clientWidth : 0;
    });
    assert(extra <= 0, `sem rolagem lateral na janela (${where})`);
  };

  // ---------------------------------------------------------------
  section("A aba nova, ainda vazia");
  await page.goto(`${BASE}/avatar?id=${fra}`);
  await page.getByRole("heading", { name: "Estrutura", exact: true }).waitFor({ timeout: 30000 });
  await page.getByRole("button", { name: "Funis para modelar", exact: true }).click();
  await page.getByRole("heading", { name: "Funis para modelar" }).waitFor();
  assert(new URL(page.url()).searchParams.get("aba") === "funis", "o atalho na Estrutura abre a aba “Funis para modelar”");
  assert(await page.getByRole("tab", { name: "Funis para modelar", exact: true }).getAttribute("aria-selected") === "true", "a aba fica entre “Perfis de exemplo” e “Kit de reposição”");
  await page.getByText("Nenhum funil para modelar").waitFor();
  await page.getByText(/a página de vendas, a\s+captura de e-mail, o ebook gratuito, a venda e os e-mails que chegam/).waitFor();
  ok("vazia, a aba explica para que serve");
  await overflow("a aba vazia");

  // ---------------------------------------------------------------
  section("Cadastrar o avatar modelo");
  await page.getByRole("button", { name: "Adicionar", exact: true }).click();
  await dialog().getByRole("heading", { name: "Novo modelo" }).waitFor();
  await save();
  await dialog().getByText("Diga o nome do avatar modelo.").waitFor();
  ok("sem nome, o modelo não é salvo");
  await field("Nome do avatar modelo").fill("Padre Antonio");
  await field("@ ou link do perfil").fill("@padre.antonio.ricette");
  await field("Nicho ou produto").fill("Receitas de convento · ebook de € 27");
  await field("Observações").fill("Funil simples e direto.");
  await fits("novo modelo");
  await save();
  await toast("Modelo salvo");
  await noDialog();
  await db(models(), "Padre Antonio", "o modelo fica guardado no avatar");
  assert(
    psql(`select (kit->>'bio' is not null) and jsonb_array_length(kit->'highlights') = 3 and (kit->'structure'->>'site') = 'true' ${ofAvatar("Fra' Salvio")}`) === "t",
    "sem mexer no kit de reposição nem na estrutura, que moram no mesmo lugar",
  );
  await page.getByRole("tab", { name: /^Funis para modelar\s*1$/ }).waitFor();
  ok("a aba mostra quantos modelos há");
  await page.getByText("Nenhuma etapa registrada").waitFor();
  await page.getByText("@padre.antonio.ricette").waitFor();
  await card("Padre Antonio").getByRole("button", { name: "Copiar", exact: true }).first().click();
  assert((await clipboard()) === "@padre.antonio.ricette", "o @ do modelo é só para copiar (o painel não abre o Instagram)");
  assert((await page.locator('a[href*="instagram"]').count()) === 0, "nenhum link para o Instagram na tela");

  // ---------------------------------------------------------------
  section("Registrar o funil, etapa por etapa");
  const chips = () => page.getByText("Ainda não registrado neste funil (toque para registrar):");
  await chips().waitFor();
  for (const kind of ["Página de vendas", "Captura de e-mail", "Ebook gratuito", "Venda", "E-mail recebido"]) {
    assert((await page.getByRole("button", { name: kind, exact: true }).count()) === 1, `o painel lembra de registrar: ${kind}`);
  }
  // uma etapa vazia não serve para nada
  await page.getByRole("button", { name: "Página de vendas", exact: true }).click();
  assert((await field("Tipo de etapa").inputValue()) === "pagina_vendas", "tocar numa etapa que falta já abre o formulário com o tipo certo");
  await save();
  await dialog().getByText("Preencha ao menos o título, o link ou as anotações.").waitFor();
  ok("etapa vazia não é salva");
  await field("Título ou promessa da página").fill("A dieta dos monges em 21 dias");
  await field("Link").fill("exemplo.com/dieta-dos-monges");
  await field("Anotações").fill("Promessa no topo, prova social logo abaixo, 3 bônus e garantia de 7 dias.");
  await fits("nova etapa");
  await shot("i10-nova-etapa");
  await save();
  await toast("Etapa salva");
  await noDialog();
  await db(steps("Padre Antonio", "Fra' Salvio", "s->>'kind' || '=' || (s->>'url')"), "pagina_vendas=https://exemplo.com/dieta-dos-monges", "a etapa é gravada (o link ganha o https://)");
  assert((await page.getByRole("button", { name: "Página de vendas", exact: true }).count()) === 0, "e sai da lista do que falta registrar");

  await addStep("Captura de e-mail", { "Chamada da captura": "Receba o guia grátis no seu e-mail", Link: "https://exemplo.com/guia-gratis" });
  await addStep("Ebook gratuito", { "Nome do material": "7 receitas do convento", Anotações: "PDF de 12 páginas, com a oferta na última." });
  // a venda tem o preço; o e-mail, quando chegou
  await page.getByRole("button", { name: "Venda", exact: true }).click();
  await field("Preço").waitFor();
  assert((await dialog().getByLabel("Quando chegou", { exact: true }).count()) === 0, "a venda pede o preço (e não “quando chegou”)");
  await field("Produto").fill("Curso completo + 3 bônus");
  await field("Preço").fill("€ 27");
  await save();
  await toast("Etapa salva");
  await noDialog();
  const longMail = ["Entrega o PDF e já apresenta o curso.", "", "Ciao!", "Ecco la tua guida…", "", "Uma história pessoal, depois o link.", "P.S. com escassez: desconto só até domingo.", "", "Assinatura simples, sem imagem."].join("\n");
  await addStep("E-mail recebido", { "Assunto do e-mail": "Seu guia chegou (e um presente)", "Quando chegou": "na hora", Anotações: longMail });
  await db(steps("Padre Antonio"), "pagina_vendas,captura,isca,venda,email", "as cinco etapas ficam na ordem em que foram registradas");
  await db(steps("Padre Antonio", "Fra' Salvio", "coalesce(nullif(s->>'detail', ''), '-')"), "-,-,-,€ 27,na hora", "o preço fica na venda e o “quando chegou” no e-mail");
  assert((await chips().count()) === 0, "com as cinco etapas registradas, o lembrete do que falta some");
  await page.getByText("5 etapas · 0 modeladas").waitFor();

  // mais e-mails: a posição no funil é escolhida no formulário
  await page.getByRole("button", { name: "Adicionar etapa" }).click();
  assert((await field("Tipo de etapa").inputValue()) === "email", "sem nada faltando, “Adicionar etapa” sugere mais um e-mail");
  await field("Assunto do e-mail").fill("Você viu o guia?");
  await field("Quando chegou").fill("dia 2");
  await save();
  await toast("Etapa salva");
  await noDialog();
  // outra etapa, com nome próprio, colocada logo depois da captura
  await page.getByRole("button", { name: "Adicionar etapa" }).click();
  await field("Tipo de etapa").selectOption({ label: "Outra etapa" });
  await field("Anotações").fill("Agradece e pede para conferir o e-mail.");
  await save();
  await dialog().getByText("Dê um nome para esta etapa.").waitFor();
  ok("a “outra etapa” precisa de um nome");
  await field("Nome da etapa").fill("Página de obrigado");
  await field("Posição no funil").selectOption({ label: "3ª etapa" });
  await save();
  await toast("Etapa salva");
  await noDialog();
  await db(steps("Padre Antonio"), "pagina_vendas,captura,outro,isca,venda,email,email", "a etapa nova entra na posição escolhida (3ª)");
  await page.getByText("3 · Página de obrigado").waitFor();
  ok("a “outra etapa” aparece com o próprio nome");

  // corrigir uma etapa e mudar de lugar
  await page.getByRole("button", { name: "Editar a etapa 7: E-mail recebido: Você viu o guia?" }).click();
  await dialog().getByRole("heading", { name: "Editar etapa" }).waitFor();
  assert((await field("Posição no funil").locator("option").first().innerText()) === "Onde está (7ª etapa)", "ao corrigir, a etapa fica onde está se nada for escolhido");
  await field("Assunto do e-mail").fill("Você viu o guia? (última chance)");
  await field("Posição no funil").selectOption({ label: "6ª etapa" });
  await save();
  await toast("Etapa salva");
  await noDialog();
  await db(steps("Padre Antonio", "Fra' Salvio", "left(s->>'title', 12)"), "A dieta dos ,Receba o gui,Página de ob,7 receitas d,Curso comple,Você viu o g,Seu guia che", "a etapa corrigida muda de lugar (da 7ª para a 6ª)");
  await overflow("a aba com o funil");
  await shot("i20-funil");

  // ---------------------------------------------------------------
  section("Marcar o que já foi modelado, ler e copiar os textos");
  const toggle = page.getByRole("button", { name: "Marcar como modelado: Página de vendas: A dieta dos monges em 21 dias" });
  await toggle.click();
  await db(steps("Padre Antonio", "Fra' Salvio", "s->>'done'"), "true,false,false,false,false,false,false", "um toque marca a etapa como modelada");
  await page.getByText("7 etapas · 1 modelada").waitFor();
  await page.getByRole("button", { name: "Marcar como a modelar: Página de vendas: A dieta dos monges em 21 dias" }).click();
  await db(steps("Padre Antonio", "Fra' Salvio", "s->>'done'"), "false,false,false,false,false,false,false", "outro toque desfaz");
  await toggle.click();
  await page.getByText("7 etapas · 1 modelada").waitFor();
  // um e-mail inteiro colado: aparece o começo, abre no toque e pode ser copiado
  const mail = page.locator("li", { has: page.getByText("Seu guia chegou (e um presente)", { exact: true }) });
  const body = mail.locator("p.whitespace-pre-wrap");
  const clamped = await body.evaluate((element) => element.scrollHeight > element.clientHeight + 1);
  assert(clamped, "texto comprido aparece só com o começo");
  await mail.getByRole("button", { name: "Ver tudo" }).click();
  assert(await body.evaluate((element) => element.scrollHeight <= element.clientHeight + 1), "“Ver tudo” abre o texto inteiro");
  await mail.getByRole("button", { name: "Ver menos" }).click();
  await mail.getByRole("button", { name: "Copiar texto" }).click();
  assert((await clipboard()) === longMail, "“Copiar texto” leva as anotações inteiras, com as quebras de linha");
  assert(await page.getByRole("link", { name: /exemplo\.com\/dieta-dos-monges/ }).getAttribute("rel") === "noopener noreferrer", "o link da etapa abre sem revelar de onde você veio");

  // ---------------------------------------------------------------
  section("Vários modelos, e levar um funil para outro avatar");
  await page.getByRole("button", { name: "Adicionar", exact: true }).click();
  await field("Nome do avatar modelo").fill("Suor Maria");
  await save();
  await toast("Modelo salvo");
  await noDialog();
  await db(models(), "Padre Antonio | Suor Maria", "o segundo modelo entra na lista");
  assert(
    (await page.getByRole("button", { name: "Esconder o funil de Suor Maria" }).count()) === 1 && (await page.getByRole("button", { name: "Mostrar o funil de Padre Antonio" }).count()) === 1,
    "com mais de um modelo, o que acabou de ser criado fica aberto e os outros se fecham",
  );
  await page.getByRole("button", { name: "Mostrar o funil de Padre Antonio" }).click();
  await page.getByText("3 · Página de obrigado").waitFor();
  ok("um toque abre o funil de volta");

  // outro avatar seu, que vai receber a cópia
  const uid = psql("select user_id from public.countries limit 1");
  const italy = psql("select id from public.countries where name = 'Itália'");
  psql(`insert into public.avatars (user_id, country_id, name, status, position) values ('${uid}', '${italy}', 'Nonna Maria', 'ativo', 1)`);
  await page.reload();
  await page.getByRole("heading", { name: "Funis para modelar" }).waitFor({ timeout: 30000 });
  await page.getByRole("button", { name: "Editar o modelo Padre Antonio" }).click();
  await dialog().getByRole("heading", { name: "Editar modelo" }).waitFor();
  await fits("editar modelo");
  await dialog().getByRole("button", { name: "Copiar para outro avatar" }).click();
  await dialog().getByRole("heading", { name: "Copiar para outro avatar" }).waitFor();
  assert((await field("Avatar que recebe a cópia").locator("option").allInnerTexts()).join() === "🇮🇹 Nonna Maria", "a cópia vai para outro avatar seu (este aqui não entra na lista)");
  await dialog().getByRole("button", { name: "Copiar", exact: true }).click();
  await toast("Funil copiado para Nonna Maria");
  await db(steps("Padre Antonio", "Nonna Maria"), "pagina_vendas,captura,outro,isca,venda,email,email", "o outro avatar recebe o modelo com o funil inteiro");
  assert(psql(steps("Padre Antonio", "Nonna Maria", "s->>'done'")) === "false,false,false,false,false,false,false", "sem as marcas de “modelado” (lá ainda está tudo por fazer)");
  assert(psql(steps("Padre Antonio", "Fra' Salvio", "s->>'done'")).startsWith("true,"), "o original continua como estava");
  assert(
    psql(`select count(distinct id) from (select m->>'id' as id from public.avatars, jsonb_array_elements(kit->'funnels') m where m->>'name' = 'Padre Antonio') t`) === "2",
    "a cópia tem identificador próprio",
  );
  // a janela de edição continua aberta por baixo: corrigir o nome depois de copiar
  await dialog().getByRole("heading", { name: "Editar modelo" }).waitFor();
  await field("Nome do avatar modelo").fill("Padre Antonio (Itália)");
  await save();
  await toast("Modelo salvo");
  await noDialog();
  await db(models(), "Padre Antonio (Itália) | Suor Maria", "corrigir os dados do modelo não mexe nas etapas dele");
  assert(psql(steps("Padre Antonio (Itália)")).split(",").length === 7, "(as sete etapas continuam)");

  // ---------------------------------------------------------------
  section("Mexer no resto do avatar não apaga os funis");
  await page.getByRole("tab", { name: "Visão geral" }).click();
  await page.getByRole("button", { name: "Funis para modelar (2)" }).waitFor();
  ok("a Estrutura mostra quantos funis para modelar o avatar tem");
  await page.getByRole("checkbox", { name: "Automação", exact: true }).click();
  await db(`select (kit->'structure'->>'automacao') || '|' || jsonb_array_length(kit->'funnels') ${ofAvatar("Fra' Salvio")}`, "true|2", "marcar a estrutura não mexe nos funis");
  await page.getByRole("tab", { name: "Kit de reposição" }).click();
  await page.getByRole("heading", { name: "Perfil", exact: true }).waitFor();
  await page.getByRole("button", { name: "Editar", exact: true }).first().click();
  await dialog().getByRole("heading", { name: "Perfil do kit de reposição" }).waitFor();
  await field("Bio").fill("Bio nova, escrita depois dos funis.");
  await save();
  await noDialog();
  await db(`select (kit->>'bio') || '|' || jsonb_array_length(kit->'funnels') ${ofAvatar("Fra' Salvio")}`, "Bio nova, escrita depois dos funis.|2", "editar o kit de reposição também não");

  // ---------------------------------------------------------------
  section("Apagar etapa e modelo");
  await page.getByRole("tab", { name: /^Funis para modelar/ }).click();
  await page.getByRole("button", { name: "Mostrar o funil de Padre Antonio (Itália)" }).click();
  await page.getByRole("button", { name: "Editar a etapa 3: Página de obrigado" }).click();
  await dialog().getByRole("button", { name: "Apagar" }).click();
  await dialog().getByText("Apagar esta etapa?").waitFor();
  await dialog().getByRole("button", { name: "Apagar", exact: true }).click();
  await toast("Etapa apagada");
  await noDialog();
  await db(steps("Padre Antonio (Itália)"), "pagina_vendas,captura,isca,venda,email,email", "a etapa apagada sai do funil");
  await page.getByRole("button", { name: "Editar o modelo Suor Maria" }).click();
  await dialog().getByRole("button", { name: "Apagar" }).click();
  await dialog().getByText("Apagar este modelo?").waitFor();
  await dialog().getByRole("button", { name: "Apagar", exact: true }).click();
  await toast("Modelo apagado");
  await noDialog();
  await db(models(), "Padre Antonio (Itália)", "o modelo apagado sai da lista");
  await page.getByRole("button", { name: "Editar o modelo Padre Antonio (Itália)" }).click();
  await dialog().getByRole("button", { name: "Apagar" }).click();
  await dialog().getByText(/As 6 etapas do funil dele são apagadas junto/).waitFor();
  ok("apagar um modelo com etapas avisa que o funil vai junto");
  await dialog().getByRole("button", { name: "Cancelar", exact: true }).last().click();
  await dialog().getByRole("heading", { name: "Editar modelo" }).waitFor();
  await dialog().getByRole("button", { name: "Cancelar", exact: true }).click();
  await noDialog();

  // ---------------------------------------------------------------
  section("Dois aparelhos: o modelo foi apagado no outro");
  await page.getByRole("button", { name: "Adicionar etapa" }).click();
  await field("Assunto do e-mail").fill("E-mail escrito enquanto o modelo era apagado");
  psql(`update public.avatars set kit = kit - 'funnels', updated_at = now() ${ofAvatar("Fra' Salvio").replace("from public.avatars ", "")}`);
  await save();
  await dialog().getByText(/alterado em outro aparelho/).waitFor();
  ok("a gravação por cima de dados mais novos é recusada, e a tela se atualiza");
  await save();
  await dialog().getByText("Este modelo foi apagado em outro aparelho. Feche esta janela e confira a lista.").waitFor();
  ok("tentando de novo, a janela diz que o modelo não existe mais (em vez de fingir que salvou)");
  await dialog().getByRole("button", { name: "Cancelar", exact: true }).click();
  await noDialog();
  await page.getByText("Nenhum funil para modelar").waitFor();
  assert(psql(`select coalesce(kit->'funnels', 'null'::jsonb)::text ${ofAvatar("Fra' Salvio")}`) === "null", "nada foi gravado");

  resetData();
  await finish(session);
})().catch(fail);
