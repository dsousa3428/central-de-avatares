// Teste de ponta a ponta da ETAPA (a): login, países, avatares, contas,
// infraestrutura, exemplos e configurações — no tamanho de um celular.
//
// Como rodar (ver dev/README.md):
//   node dev/local.mjs up && npm run build && npm start   (em outro terminal)
//   node dev/e2e/etapa-a.cjs
const { chromium } = require("playwright");
const { BASE, USER, psql, resetData, ok, section, assert, openPhone, finish, fail } = require("./helpers.cjs");

(async () => {
  resetData();
  const session = await openPhone(chromium);
  const { page, dialog, shot, toast, save, noDialog, overflow, clipboard, more } = session;

  // ---------------------------------------------------------------
  section('Proteção de rota + login');
  await page.goto(BASE + '/paises');
  await page.waitForURL('**/login');
  ok('visitante sem login é mandado para /login');
  await page.getByLabel('E-mail').fill(USER.email);
  await page.getByLabel('Senha', { exact: true }).fill('senha-errada');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.getByText('E-mail ou senha incorretos.').waitFor();
  ok('senha errada mostra mensagem clara');
  await shot('20-login-erro');
  await page.getByLabel('Senha', { exact: true }).fill(USER.password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.getByRole('heading', { name: 'Hoje', exact: true }).waitFor({ timeout: 30000 });
  ok('login correto abre a tela Hoje');
  assert(psql("select count(*) from public.countries where is_example") === '1', 'exemplo Itália criado no banco');
  assert(psql("select count(*) from public.accounts where is_example") === '2', 'duas contas de exemplo criadas');
  assert(psql("select (prefs->>'examples_version') from public.settings") === '5', 'configurações registram a versão dos exemplos');
  await overflow('Hoje');

  // ---------------------------------------------------------------
  section('Países: criar com preset, tags e copiar');
  await page.getByRole('link', { name: 'Países' }).click();
  await page.getByRole('heading', { name: 'Países', exact: true }).waitFor();
  await overflow('Países');
  await page.getByRole('button', { name: 'País', exact: true }).click();
  await dialog().getByLabel('Escolher da lista').selectOption('Espanha');
  assert((await dialog().getByLabel('Nome', { exact: true }).inputValue()) === 'Espanha', 'preset preenche o nome');
  assert((await dialog().getByLabel('Moeda padrão').inputValue()) === 'EUR', 'preset preenche a moeda');
  assert((await dialog().getByLabel('Fuso horário').inputValue()) === 'Europe/Madrid', 'preset preenche o fuso');
  await dialog().getByLabel('Tags de aquecimento').fill('#recetas, #abuela\ncocina casera\n#recetas');
  await shot('21-form-pais');
  await save();
  await toast('País adicionado');
  await page.getByRole('tab', { name: /Espanha/ }).waitFor();
  assert((await page.getByRole('tab', { name: /Espanha/ }).getAttribute('aria-selected')) === 'true', 'aba do novo país fica selecionada');
  assert(psql("select array_to_string(warmup_tags, '|') from public.countries where name='Espanha'") === '#recetas|#abuela|cocina casera', 'tags salvas sem repetidas');
  await page.getByRole('button', { name: 'Copiar todas' }).click();
  await toast('Tags copiadas');
  assert((await clipboard()) === '#recetas #abuela cocina casera', 'copiar todas coloca as tags na área de transferência');
  await page.getByRole('button', { name: 'cocina casera' }).click();
  assert((await clipboard()) === 'cocina casera', 'tocar numa tag copia só ela');

  // validação
  await page.getByRole('button', { name: 'País', exact: true }).click();
  await save();
  await dialog().getByText('Informe o nome do país.').waitFor();
  ok('formulário vazio mostra o erro dentro da janela');
  await dialog().getByRole('button', { name: 'Cancelar', exact: true }).click();
  await noDialog();

  // ---------------------------------------------------------------
  section('Avatar: criar e abrir a página dele');
  await page.getByRole('button', { name: 'Criar avatar' }).click();
  await dialog().getByLabel('Nome do avatar').fill('Abuela Carmen');
  await dialog().getByLabel('Nicho', { exact: true }).fill('Receitas caseiras');
  await dialog().getByLabel('Produto', { exact: true }).fill('Recetario de la Abuela');
  await dialog().getByLabel('Preço', { exact: true }).fill('19,90');
  await shot('22-form-avatar');
  await save();
  await page.waitForURL(/\/avatar\?id=/);
  await page.getByRole('heading', { name: 'Abuela Carmen' }).waitFor();
  ok('depois de criar, abre a página do avatar');
  assert(psql("select product_price::text || ' ' || product_currency from public.avatars where name='Abuela Carmen'") === '19.90 EUR', 'preço 19,90 salvo como 19.90 EUR');
  await page.getByText('€ 19,90').waitFor();
  await page.getByText('Sem conta ativa').first().waitFor();
  ok('avatar novo aparece como “Sem conta ativa”');
  await overflow('Avatar');

  // ---------------------------------------------------------------
  section('Conta: criar com celular e perfil cadastrados na hora');
  await page.getByRole('button', { name: 'Nova conta', exact: true }).click();
  await dialog().getByLabel('@ do Instagram').fill(' @Abuela.Carmen ');
  await dialog().getByLabel('E-mail da conta').fill('Abuela1@Exemplo.com');
  await dialog().getByLabel('Celular', { exact: true }).selectOption({ label: '＋ Cadastrar novo celular…' });
  await dialog().getByRole('heading', { name: 'Novo celular' }).waitFor();
  await dialog().getByLabel('Apelido', { exact: true }).fill('Celular C');
  await dialog().getByLabel('Modelo', { exact: true }).fill('Moto G54');
  await shot('23-form-celular-sobre-conta');
  await save();
  await toast('Celular cadastrado');
  await dialog().getByRole('heading', { name: 'Nova conta' }).waitFor();
  const phoneSel = await dialog().getByLabel('Celular', { exact: true }).evaluate((el) => el.options[el.selectedIndex].text);
  assert(phoneSel.startsWith('Celular C'), 'celular novo já vem selecionado na conta');
  await dialog().getByLabel('Perfil no anti-detect').selectOption({ label: '＋ Cadastrar novo perfil…' });
  await dialog().getByLabel('Número do perfil').fill('201');
  await dialog().getByLabel('Proxy', { exact: true }).fill('es-res-01.exemplo.net:9000');
  await save();
  await toast('Perfil cadastrado');
  await dialog().getByRole('heading', { name: 'Nova conta' }).waitFor();
  assert((await dialog().getByLabel('Proxy / IP usado').inputValue()) === 'es-res-01.exemplo.net:9000', 'proxy do perfil preenche o proxy da conta');
  await dialog().getByLabel('Seguidores', { exact: true }).fill('12');
  await shot('24-form-conta');
  await save();
  await toast('Conta criada');
  await noDialog();
  assert(psql("select handle || '|' || email || '|' || generation || '|' || status from public.accounts where email='abuela1@exemplo.com'") === 'abuela.carmen|abuela1@exemplo.com|1|aquecendo', '@ e e-mail normalizados, geração 1, aquecendo');
  assert(psql("select count(*) from public.activity_log where kind='conta_criada' and not is_example") === '1', 'linha do tempo registrou “conta criada”');

  // ---------------------------------------------------------------
  section('Conta atual: status, seguidores e queda');
  await page.getByRole('tab', { name: /^Conta atual/ }).click();
  await page.getByRole('heading', { name: '@abuela.carmen' }).waitFor();
  await shot('25-conta-atual');
  await overflow('Conta atual');
  await page.getByLabel('Status da conta').selectOption('ativa');
  await toast('Status alterado para ativa');
  await page.getByRole('button', { name: 'Atualizar', exact: true }).click();
  await dialog().getByLabel('Seguidores hoje').fill('1.250');
  await save();
  await toast('Seguidores atualizados');
  await page.getByText('1.250').first().waitFor();
  assert(psql("select followers::text || '|' || status from public.accounts where handle='abuela.carmen'") === '1250|ativa', 'seguidores 1.250 e status ativa gravados');

  // "Caída" no seletor abre o "Conta caiu": passo 1 (data e motivo) e, em seguida, a conta nova
  await page.getByLabel('Status da conta').selectOption('caida');
  await dialog().getByLabel('Data da queda').waitFor();
  await dialog().getByRole('button', { name: 'Denúncias' }).click();
  await shot('26-form-conta-caida');
  await save('Confirmar queda');
  await toast('Conta marcada como caída');
  await dialog().getByRole('heading', { name: 'Nova conta' }).waitFor();
  ok('depois de confirmar a queda, abre sozinha a criação da nova geração');
  await dialog().getByRole('button', { name: 'Cancelar' }).click();
  await noDialog();
  await page.getByText('Nenhuma conta ativa').waitFor();
  ok('deixando para depois, a aba mostra “Nenhuma conta ativa” (com o botão para subir a nova)');
  assert(psql("select status || '|' || fall_reason || '|' || (fell_on is not null) from public.accounts where handle='abuela.carmen'") === 'caida|Denúncias|true', 'queda gravada com data e motivo');
  assert(psql("select count(*) from public.activity_log where kind='caiu' and not is_example") === '1', 'linha do tempo registrou a queda');

  // ---------------------------------------------------------------
  section('Nova geração: mesmo @ e aviso de reuso');
  await page.getByRole('button', { name: /Nova conta \(2ª geração\)/ }).click();
  assert((await dialog().getByLabel('@ do Instagram').inputValue()) === 'abuela.carmen', 'nova geração já vem com o mesmo @');
  assert((await dialog().getByLabel('Geração', { exact: true }).inputValue()) === '2', 'geração sugerida é a 2');
  await dialog().getByLabel('Celular', { exact: true }).selectOption({ label: 'Celular C (Moto G54) · usado por conta caída' });
  await dialog().getByText('Este celular foi usado por conta que caiu').waitFor();
  ok('avisa que o celular foi usado por conta caída');
  await dialog().getByLabel('Perfil no anti-detect').selectOption({ label: 'Perfil 201 · usado por conta caída' });
  await dialog().getByText('Este perfil foi usado por conta que caiu').waitFor();
  await dialog().getByText('Este proxy foi usado por conta que caiu').waitFor();
  ok('avisa também sobre o perfil e o proxy');
  await dialog().getByText('Este proxy foi usado por conta que caiu').scrollIntoViewIfNeeded();
  await shot('27-avisos-reuso');
  // geração repetida é barrada
  await dialog().getByLabel('Geração', { exact: true }).fill('1');
  await save();
  await dialog().getByText('Este avatar já tem uma conta na 1ª geração').waitFor();
  ok('não deixa repetir o número da geração');
  await dialog().getByLabel('Geração', { exact: true }).fill('2');
  await dialog().getByLabel('Celular', { exact: true }).selectOption({ label: 'Celular B (Xiaomi Redmi 13C) · em uso' });
  await dialog().getByText('Este celular já está em uso').waitFor();
  ok('avisa quando o celular está em uso por outra conta viva');
  await dialog().getByLabel('Celular', { exact: true }).selectOption('');
  await dialog().getByLabel('Perfil no anti-detect').selectOption('');
  await dialog().getByLabel('Proxy / IP usado').fill('');
  await save();
  await toast('Conta criada');
  await noDialog();
  await page.getByRole('heading', { name: '@abuela.carmen' }).waitFor();
  ok('a 2ª geração vira a conta atual');

  // ---------------------------------------------------------------
  section('Histórico');
  await page.getByRole('tab', { name: /^Histórico/ }).click();
  await page.getByText('2 contas').waitFor();
  await page.getByText('Linha do tempo (5)').click();
  await page.getByText('Conta caiu — Denúncias').waitFor();
  ok('histórico lista as duas gerações e a linha do tempo');
  await shot('28-historico');

  // ---------------------------------------------------------------
  section('Links, vídeos, perfis de exemplo, kit e anotações');
  await page.getByRole('tab', { name: /^Links/ }).click();
  await page.getByRole('button', { name: 'Editar', exact: true }).click();
  await dialog().getByLabel('Site de vendas').fill('exemplo.com/abuela');
  await dialog().getByLabel('Checkout', { exact: true }).fill('https://exemplo.com/abuela/checkout');
  await save();
  await toast('Links salvos');
  assert(psql("select sales_site_url from public.avatars where name='Abuela Carmen'") === 'https://exemplo.com/abuela', 'link sem https:// é completado ao salvar');
  await page.getByRole('button', { name: 'Adicionar', exact: true }).click();
  await dialog().getByLabel('Rótulo', { exact: true }).fill('Grupo VIP');
  await dialog().getByLabel('Link', { exact: true }).fill('t.me/grupo');
  await save();
  await toast('Link salvo');
  await page.getByText('Grupo VIP').waitFor();
  const href = await page.getByRole('link', { name: /exemplo\.com\/abuela$/ }).first().getAttribute('rel');
  assert(href === 'noopener noreferrer', 'links abrem sem revelar a origem (noreferrer)');

  await page.getByRole('tab', { name: /^Vídeos/ }).click();
  await page.getByRole('button', { name: 'Adicionar', exact: true }).click();
  await dialog().getByLabel('Rótulo', { exact: true }).fill('Receita em 30s');
  await dialog().getByLabel('Link do vídeo').fill('exemplo.com/v/1');
  await save();
  await toast('Vídeo salvo');
  await page.getByRole('button', { name: 'Marcar como modelado' }).click();
  await page.getByRole('button', { name: 'Marcar como a modelar' }).waitFor();
  assert(psql("select model_videos->0->>'status' from public.avatars where name='Abuela Carmen'") === 'modelado', 'vídeo marcado como modelado no banco');
  await page.getByRole('radio', { name: 'A modelar' }).click();
  await page.getByText('Nenhum vídeo nesta situação.').waitFor();
  ok('filtro de vídeos funciona');

  await page.getByRole('tab', { name: /^Perfis de exemplo/ }).click();
  await page.getByRole('button', { name: 'Adicionar', exact: true }).click();
  await dialog().getByLabel('@ ou link do perfil').fill('@cocina.de.la.abuela');
  await dialog().getByLabel('Observação', { exact: true }).fill('Formato dos reels');
  await save();
  await toast('Perfil salvo');

  await page.getByRole('tab', { name: /^Kit de reposição/ }).click();
  await page.getByRole('button', { name: 'Editar', exact: true }).click();
  await dialog().getByLabel('Nome de exibição').fill('Abuela Carmen 👵');
  await dialog().getByLabel('Bio', { exact: true }).fill('Recetas de siempre\nDescarga el recetario 👇');
  await dialog().getByLabel('Link da bio').fill('exemplo.com/abuela');
  await save();
  await toast('Kit atualizado');
  await page.getByRole('button', { name: 'Adicionar', exact: true }).first().click();
  await dialog().getByLabel('Título do destaque').fill('Recetas');
  await dialog().getByLabel('Texto', { exact: true }).fill('Las más queridas');
  await save();
  await toast('Destaque salvo');
  await page.getByRole('button', { name: 'Copiar', exact: true }).nth(1).click();
  assert((await clipboard()) === 'Recetas de siempre\nDescarga el recetario 👇', 'copiar bio mantém as quebras de linha');
  await shot('29-kit');
  await overflow('Kit');

  await page.getByRole('tab', { name: /^Anotações/ }).click();
  await page.getByLabel('Anotações do avatar').fill('Rascunho que não salvei');
  await page.getByRole('tab', { name: /^Visão geral/ }).click();
  await page.getByRole('tab', { name: /^Anotações/ }).click();
  assert((await page.getByLabel('Anotações do avatar').inputValue()) === 'Rascunho que não salvei', 'rascunho das anotações sobrevive à troca de aba');
  await page.getByRole('button', { name: 'Salvar', exact: true }).click();
  await toast('Anotações salvas');

  // ---------------------------------------------------------------
  section('Infraestrutura');
  await more("Infraestrutura");
  await page.getByRole('heading', { name: 'Infraestrutura' }).waitFor();
  await page.getByText('3 de 3 celulares livres').waitFor().catch(() => {});
  await overflow('Infraestrutura');
  await shot('30-infra');
  await page.getByRole('tab', { name: /Perfis anti-detect/ }).click();
  await page.getByText('Perfil 201').waitFor();
  await page.getByRole('button', { name: 'Perfil', exact: true }).click();
  await dialog().getByLabel('Número do perfil').fill('201');
  await save();
  await dialog().getByText('Já existe um perfil com o número 201.').waitFor();
  ok('não deixa cadastrar dois perfis com o mesmo número');
  await dialog().getByLabel('Número do perfil').fill('202');
  await save();
  await toast('Perfil cadastrado');
  await page.getByRole('button', { name: 'Editar Perfil 202' }).click();
  await dialog().getByRole('button', { name: 'Apagar', exact: true }).click();
  await dialog().getByRole('button', { name: 'Apagar perfil' }).click();
  await toast('Perfil apagado');
  await noDialog();
  assert(psql("select count(*) from public.antidetect_profiles where number='202'") === '0', 'perfil apagado do banco');

  // ---------------------------------------------------------------
  section('Sessão persiste ao recarregar');
  await page.reload();
  await page.getByRole('heading', { name: 'Infraestrutura' }).waitFor({ timeout: 20000 });
  ok('recarregar a página mantém o login e os dados');

  // ---------------------------------------------------------------
  section('Configurações: tema escuro e exemplos');
  await more("Configurações");
  await page.getByRole('radio', { name: 'Escuro' }).click();
  assert((await page.evaluate(() => document.documentElement.dataset.theme)) === 'dark', 'tema escuro aplicado');
  await shot('31-config-escuro');
  await page.getByRole('link', { name: 'Hoje' }).click();
  await page.getByRole('heading', { name: 'Hoje', exact: true }).waitFor();
  await shot('32-hoje-escuro');
  await page.getByRole('link', { name: 'Países' }).click();
  await page.getByRole('tab', { name: /Itália/ }).click();
  await page.getByRole('link', { name: /Fra' Salvio/ }).click();
  await page.getByRole('heading', { name: "Fra' Salvio" }).waitFor();
  await shot('33-avatar-escuro');
  await more("Configurações");
  await page.getByRole('heading', { name: 'Configurações' }).waitFor();
  await page.reload();
  await page.getByRole('heading', { name: 'Configurações' }).waitFor({ timeout: 20000 });
  assert((await page.evaluate(() => document.documentElement.dataset.theme)) === 'dark', 'tema escuro continua depois de recarregar');
  await page.getByRole('radio', { name: 'Claro' }).click();

  await page.getByRole('button', { name: 'Apagar exemplos' }).click();
  await shot('34-confirma-apagar-exemplos');
  await dialog().getByRole('button', { name: 'Apagar exemplos' }).click();
  await toast('Exemplos apagados');
  await page.getByText('Não há dados de exemplo no painel.').waitFor();
  assert(psql("select count(*) from public.countries where name='Itália'") === '0', 'Itália de exemplo apagada');
  assert(psql("select count(*) from public.avatars") === '1', 'avatar do usuário preservado');
  assert(psql("select count(*) from public.accounts") === '2', 'contas do usuário preservadas');
  assert(psql("select count(*) from public.phones") === '1', 'celular do usuário preservado (os 2 de exemplo saíram)');
  await page.getByRole('button', { name: 'Criar exemplos de novo' }).click();
  await toast('Exemplos criados');
  assert(psql("select count(*) from public.countries where is_example") === '1', 'exemplos recriados');

  // ---------------------------------------------------------------
  section('Apagar avatar (com confirmação digitada) e país');
  await page.getByRole('link', { name: 'Países' }).click();
  await page.getByRole('tab', { name: /Espanha/ }).click();
  await page.getByRole('link', { name: /Abuela Carmen/ }).click();
  await page.getByRole('button', { name: 'Apagar avatar' }).click();
  assert(await dialog().getByRole('button', { name: 'Apagar avatar' }).isDisabled(), 'botão de apagar fica travado até digitar o nome');
  await shot('35-confirma-apagar-avatar');
  await dialog().getByRole('textbox').fill('abuela carmen');
  await dialog().getByRole('button', { name: 'Apagar avatar' }).click();
  await toast('Avatar apagado');
  await page.waitForURL('**/paises');
  assert(psql("select count(*) from public.avatars where name='Abuela Carmen'") === '0', 'avatar apagado');
  assert(psql("select count(*) from public.accounts where handle='abuela.carmen'") === '0', 'contas do avatar apagadas junto');
  await page.getByRole('tab', { name: /Espanha/ }).click();
  await page.getByRole('button', { name: 'Editar', exact: true }).click();
  await dialog().getByRole('button', { name: 'Apagar', exact: true }).click();
  await dialog().getByRole('button', { name: 'Apagar país' }).click();
  await toast('País apagado');
  await noDialog();
  assert(psql("select count(*) from public.countries where name='Espanha'") === '0', 'país apagado');

  // ---------------------------------------------------------------
  section('Sair');
  await more("Configurações");
  // "Sair" recarrega a página inteira de propósito: espera esse recarregamento terminar
  await Promise.all([page.waitForEvent('load'), page.getByRole('button', { name: 'Sair', exact: true }).click()]);
  await page.waitForURL('**/login');
  await page.getByRole('heading', { name: 'Central de Avatares' }).waitFor();
  await page.goto(BASE + '/', { waitUntil: 'commit' }); // o painel redireciona sozinho para /login
  await page.waitForURL('**/login');
  ok('depois de sair, o painel volta a pedir login');

  // o 400 é a resposta esperada do servidor para a senha errada do primeiro bloco
  await finish(session, [/status of 400/]);
})().catch(fail);
