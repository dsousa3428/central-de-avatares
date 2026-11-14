// Fluxos principais do Jornada 60, de ponta a ponta, no navegador (arquivo aberto do disco).
// Uso: node dev/jornada-60/testes/fluxos.cjs
const fs = require('fs');
const A = require('./apoio.cjs');
const { confere } = A;

const TRILHA = '#trilha ul[aria-label="Trilha da sequência atual"] > li';
// texto como a pessoa lê (respeita quebras entre blocos)
const txt = async (p, sel) => ((await p.locator(sel).last().innerText()) || '').replace(/\s+/g, ' ').trim();
// clica em um botão da janela que está por cima
const naJanela = (p, nome) => p.locator('dialog').last().getByRole('button', { name: nome, exact: true }).click();
const semJanela = (p) => p.waitForSelector('dialog', { state: 'detached' });
async function abrirNoDia(p, dia) { await p.goto(A.url(dia)); await p.waitForFunction(() => window.JORNADA60_OK === true); }
async function continuarMensagem(p) { await p.click('#b-continuar'); await p.waitForSelector('#checkin'); }
async function venci(p) { await p.click('#b-venci'); }

async function primeiraAbertura(nav) {
  console.log('\n1. Primeira abertura (configuração guiada)');
  const { contexto, pagina: p, registro } = await A.novaPagina(nav);
  await abrirNoDia(p, '2026-12-01');
  confere(await p.title() === 'Jornada 60', 'título da aba é só “Jornada 60”');
  confere(await p.isVisible('#g-comecar'), 'abre na configuração guiada');
  confere(await p.isVisible('.faixa.teste'), 'faixa do modo de teste aparece');
  await p.click('#g-comecar');

  // passo 1: nome obrigatório, Enter avança
  await p.click('#g-proximo');
  confere((await txt(p, '#g-erro')).includes('como você quer ser chamado'), 'passo 1: nome é obrigatório');
  await p.fill('#g-nome', 'Davi');
  await p.press('#g-nome', 'Enter');
  // passo 2: compromisso opcional
  confere(await p.isVisible('#g-compromisso'), 'Enter avança para o passo 2');
  await p.click('#g-proximo');
  // passo 3: data
  confere(await p.inputValue('#g-inicio') === '2026-12-01', 'passo 3: a data padrão é hoje');
  confere((await txt(p, '#g-dia60')).includes('sexta-feira, 29 de janeiro de 2027'), 'mostra em que data cai o dia 60', await txt(p, '#g-dia60'));
  await p.fill('#g-inicio', '2026-11-28');
  confere((await txt(p, '#g-dia60')).includes('26 de janeiro de 2027') && (await txt(p, '#g-dia60')).includes('há 3 dias'), 'a prévia do dia 60 acompanha a data escolhida', await txt(p, '#g-dia60'));
  await p.fill('#g-inicio', '2025-01-01');
  await p.click('#g-proximo');
  confere((await txt(p, '#g-erro')).includes('um ano atrás'), 'não aceita início com mais de um ano');
  await p.fill('#g-inicio', '2026-12-01');
  await p.click('#g-proximo');
  // passo 4: motivos (1 a 5)
  await p.click('#g-proximo');
  confere((await txt(p, '#g-erro')).includes('pelo menos um motivo'), 'passo 4: exige ao menos um motivo');
  await p.fill('#g-motivo-0', 'Quero estar inteiro para a minha família');
  for (let i = 1; i < 5; i++) { await p.click('#g-motivo-mais'); await p.fill('#g-motivo-' + i, 'Motivo ' + (i + 1)); }
  confere(!(await p.isVisible('#g-motivo-mais')), 'no máximo 5 motivos');
  await p.click('[data-acao="motivo-menos"][data-i="4"]');
  confere((await p.$$('.g-motivo')).length === 4, 'dá para remover um motivo');
  await p.click('#g-proximo');
  // passo 5: pessoa de confiança
  await p.fill('#g-conf-nome', 'João');
  await p.fill('#g-conf-whats', '12345');
  await p.click('#g-proximo');
  confere((await txt(p, '#g-erro')).includes('WhatsApp'), 'passo 5: WhatsApp inválido é recusado');
  await p.fill('#g-conf-whats', '(11) 91234-5678');
  await p.click('#g-proximo');
  // passo 6: marcos sugeridos
  const marcos = await p.$$eval('.marco-linha .dia', (els) => els.map((e) => e.textContent.trim()));
  confere(JSON.stringify(marcos) === JSON.stringify(['Dia 3', 'Dia 7', 'Dia 14', 'Dia 21', 'Dia 30', 'Dia 45', 'Dia 60']), 'passo 6: marcos vazios nos dias 3, 7, 14, 21, 30, 45 e 60', marcos);
  await p.click('.marco-linha >> nth=0');
  confere(await p.inputValue('#p-dia') === '3', 'tocar no marco abre a recompensa já com o dia');
  await p.click('#p-salvar');
  confere((await txt(p, '#p-erro')).includes('o que você vai ganhar'), 'recompensa: nome obrigatório');
  await p.fill('#p-nome', 'Mouse pad novo');
  await p.fill('#p-link', 'javascript:alert(1)');
  await p.click('#p-salvar');
  confere((await txt(p, '#p-erro')).includes('link'), 'recompensa: link perigoso ou inválido é recusado');
  await p.fill('#p-link', 'exemplo.com/mousepad');
  await p.fill('#p-preco', '49,90');
  await p.click('[data-acao="emoji"][data-e="🖱️"]');
  await p.click('#p-salvar');
  await semJanela(p);
  confere((await txt(p, '.marco-linha.cheio .oque')).includes('Mouse pad novo'), 'a recompensa aparece no marco do dia 3');
  // outra recompensa em um dia fora dos marcos, depois mudada de dia e apagada
  await p.click('#g-premio-outro');
  await p.fill('#p-dia', '5'); await p.fill('#p-nome', 'Sorvete'); await p.click('#p-salvar'); await semJanela(p);
  await p.click('.marco-linha.cheio >> text=Sorvete');
  await p.fill('#p-dia', '9'); await p.click('#p-salvar'); await semJanela(p);
  confere((await p.$$eval('.marco-linha .dia', (els) => els.map((e) => e.textContent.trim()))).includes('Dia 9'), 'dá para mudar a recompensa de dia');
  await p.click('.marco-linha.cheio >> text=Sorvete');
  await p.click('[data-acao="premio-apagar"]');
  await naJanela(p, 'Apagar');
  await semJanela(p);
  confere(!(await p.isVisible('text=Sorvete')), 'dá para apagar a recompensa');
  // recompensa do dia 7, sem link
  await p.click('.marco-linha >> text=Dia 7');
  await p.fill('#p-nome', 'Fone de ouvido'); await p.fill('#p-preco', '199'); await p.fill('#p-emoji', '🎧');
  await p.click('#p-salvar'); await semJanela(p);
  // o rascunho sobrevive a um recarregamento no meio da configuração
  await p.reload(); await p.waitForFunction(() => window.JORNADA60_OK === true);
  confere((await p.$$('.marco-linha.cheio')).length === 2, 'recarregar no meio da configuração não perde o que foi preenchido');
  confere(!(await p.isVisible('#b-sos')), 'durante a configuração o botão de tentação ainda não aparece');
  await p.click('#g-proximo');

  // mensagem do dia em tela cheia
  await p.waitForSelector('#b-continuar');
  confere(await txt(p, '#msg-dia') === 'Dia 1 de 60', 'mensagem do dia: “Dia 1 de 60”');
  confere(/^(Bom dia|Boa tarde|Boa noite), Davi\.$/.test(await txt(p, '#titulo')), 'saudação pelo horário, com o nome', await txt(p, '#titulo'));
  const ref1 = await txt(p, '.versiculo cite');
  confere(/\d+:\d+/.test(ref1) && (await txt(p, '.versiculo p')).length > 20, 'versículo com referência', ref1);
  confere((await txt(p, '.texto-msg')).length > 40 && (await txt(p, '.missao p')).length > 15, 'mensagem e missão do dia');
  confere(await p.isVisible('#b-sos'), 'botão “Estou sendo tentado” visível na mensagem do dia');
  let e = await A.estado(p);
  confere(e.mensagens.dia.conjunto === 'fase1', 'a mensagem do dia 1 vem da fase 1');
  await p.reload(); await p.waitForFunction(() => window.JORNADA60_OK === true);
  confere(await p.isVisible('#b-continuar') && await txt(p, '.versiculo cite') === ref1, 'reabrir antes de continuar mostra a mesma mensagem em tela cheia');
  await continuarMensagem(p);

  // tela inicial
  confere(await txt(p, '#num-seq') === '0', 'tela inicial: sequência 0');
  confere((await txt(p, '.cabecalho .sub')).startsWith('Dia 1 de 60'), 'cabeçalho mostra “Dia 1 de 60”');
  confere((await txt(p, '.marca span')) === 'meu compromisso', 'compromisso em branco vira “meu compromisso”');
  confere(await txt(p, '#mensagem-do-dia .versiculo cite') === ref1, 'a mesma mensagem fica em um card na tela inicial');
  confere((await p.$$(TRILHA)).length === 60, 'trilha com 60 dias');
  confere((await p.$$(TRILHA + '.tem-premio, ' + TRILHA + ' .tem-premio')).length === 2, 'trilha marca os 2 dias com recompensa');
  confere((await p.$$(TRILHA + '.hoje')).length === 1, 'trilha marca o dia de hoje');
  confere((await p.$$('.premio-card.bloq')).length === 2, 'duas recompensas bloqueadas');
  confere((await txt(p, '.premio-card.bloq >> nth=0')).includes('Faltam 3 dias'), 'recompensa bloqueada com contagem regressiva');
  confere((await txt(p, '#proxima')).includes('Faltam 3 dias para') && (await txt(p, '#proxima')).includes('Mouse pad novo'), 'anel: faltam 3 dias para a próxima recompensa');
  confere((await txt(p, '#numeros')).includes('sexta-feira, 29 de janeiro de 2027'), 'números: data prevista do dia 60');
  e = await A.estado(p);
  confere(e.recompensas[0].link === 'https://exemplo.com/mousepad', 'link sem “https://” é completado', e.recompensas[0].link);
  confere(e.perfil.motivos.length === 4 && e.perfil.confianca.whatsapp === '(11) 91234-5678', 'perfil guardado como preenchido');
  const chaves = await p.evaluate(() => Object.keys(localStorage));
  confere(JSON.stringify(chaves) === JSON.stringify(['jornada60:teste']), 'tudo em uma única chave, separada da de verdade', chaves);
  confere((await p.evaluate(() => JSON.parse(localStorage.getItem('jornada60:teste')).versao)) === 1, 'os dados guardam a versão do formato');

  console.log('\n2. Check-in');
  await venci(p);
  await p.waitForSelector('#b-corrigir-hoje');
  confere(await txt(p, '#num-seq') === '1', '“Venci hoje” leva a sequência para 1');
  confere(!(await p.isVisible('#b-venci')) && !(await p.isVisible('#b-recai')), 'um check-in por dia: os botões somem');
  await p.reload(); await p.waitForFunction(() => window.JORNADA60_OK === true);
  confere(await txt(p, '#num-seq') === '1' && !(await p.isVisible('#b-continuar')), 'recarregar mantém o check-in e não repete a tela cheia');
  confere(await p.isVisible('#mensagem-do-dia'), 'reabrindo no mesmo dia, a mensagem fica no card');
  // dias futuros não podem ser marcados: a trilha só tem botão em dia já respondido
  confere((await p.$$(TRILHA + ' button')).length === 1, 'na trilha, só o dia já marcado é clicável (futuro não)');
  // missão cumprida
  await p.click('#b-missao');
  confere((await A.estado(p)).mensagens.dia.missaoFeita === true, 'missão do dia pode ser marcada como cumprida');

  console.log('\n3. Dia seguinte');
  await abrirNoDia(p, '2026-12-02');
  confere(await txt(p, '#msg-dia') === 'Dia 2 de 60', 'no dia seguinte a mensagem volta em tela cheia: “Dia 2 de 60”');
  confere(await txt(p, '.versiculo cite') !== ref1, 'a mensagem do dia 2 é diferente da do dia 1');
  await continuarMensagem(p); await venci(p);
  await p.waitForSelector('#b-corrigir-hoje');
  confere(await txt(p, '#num-seq') === '2', 'sequência 2');

  console.log('\n4. Liberação de recompensa (dia 3)');
  await abrirNoDia(p, '2026-12-03');
  e = await A.estado(p);
  confere(e.mensagens.dia.conjunto === 'recompensa', 'dia de recompensa usa as mensagens especiais');
  confere((await txt(p, '.selo-premio')).includes('Mouse pad novo'), 'a mensagem avisa qual recompensa está em jogo hoje');
  await continuarMensagem(p);
  confere((await txt(p, '#proxima')).includes('Vencendo hoje, você libera'), 'anel avisa que hoje libera a recompensa');
  await venci(p);
  await p.waitForSelector('dialog .festa');
  confere((await txt(p, 'dialog .festa')).includes('Mouse pad novo') && /recompensa liberada/i.test(await txt(p, 'dialog .festa')), 'celebração maior ao liberar a recompensa', await txt(p, 'dialog .festa'));
  const linkFesta = await p.$eval('dialog .festa a.btn', (a) => ({ href: a.href, target: a.target, rel: a.rel }));
  confere(linkFesta.href === 'https://exemplo.com/mousepad' && linkFesta.target === '_blank' && /noopener/.test(linkFesta.rel), 'link da recompensa abre em nova aba', linkFesta);
  await p.click('#b-festa-ok'); await semJanela(p);
  confere((await p.$$('.premio-card.lib')).length === 1, 'card da recompensa passa para “liberada”');
  const linkCard = await p.$eval('.premio-card.lib a.btn', (a) => ({ href: a.href, target: a.target, rel: a.rel }));
  confere(linkCard.target === '_blank' && /noopener/.test(linkCard.rel) && /noreferrer/.test(linkCard.rel), 'botão do card abre o link em nova aba', linkCard);
  await p.click('.premio-card.lib [data-acao="premio-resgatar"]');
  confere((await p.$$('.premio-card.resg')).length === 1, '“Já resgatei” marca a recompensa como resgatada');
  await p.reload(); await p.waitForFunction(() => window.JORNADA60_OK === true);
  confere((await p.$$('.premio-card.resg')).length === 1 && await txt(p, '#num-seq') === '3', 'persistência após recarregar (resgatada, sequência 3)');
  confere((await txt(p, '#numeros')).includes('Recompensas liberadas 1 de 2'), 'números: 1 de 2 liberadas', await txt(p, '#numeros'));

  console.log('\n5. Dias pendentes');
  await abrirNoDia(p, '2026-12-06');
  confere(await p.isVisible('#pend-salvar') && !(await p.isVisible('#b-venci')), 'ao voltar depois de dias sem abrir, o app pergunta antes de liberar o check-in');
  confere((await p.$$('.pend')).length === 2 && (await txt(p, '#titulo')) === 'Como foram estes 2 dias?', 'lista os 2 dias pendentes (04/12 e 05/12)');
  confere(await p.isDisabled('#pend-salvar'), 'não deixa salvar sem responder');
  confere(await p.isVisible('#b-sos'), 'botão de tentação visível também aqui');
  await p.click('input[name="p-2026-12-04"][value="v"]');
  confere(await p.isDisabled('#pend-salvar') && (await txt(p, '#pend-falta')) === 'Falta 1 resposta.', 'conta as respostas que faltam');
  e = await A.estado(p);
  confere(!e.checkins['2026-12-04'] && !e.checkins['2026-12-05'], 'dia sem resposta não vira vitória nem recaída sozinho');
  await p.click('[data-acao="pend-todos"][data-v="v"]');
  confere(!(await p.isDisabled('#pend-salvar')), '“Venci em todos” responde vários de uma vez');
  await p.click('#pend-salvar');
  await p.waitForSelector('#b-continuar');
  confere(await txt(p, '#msg-dia') === 'Dia 6 de 60', 'depois dos pendentes: mensagem do “Dia 6 de 60”');
  await continuarMensagem(p);
  confere(await txt(p, '#num-seq') === '5' && await p.isVisible('#b-venci'), 'sequência 5 e check-in de hoje liberado');
  // três dias fora, com uma recaída no meio (06 venci, 07 recaí, 08 venci)
  await abrirNoDia(p, '2026-12-09');
  confere((await p.$$('.pend')).length === 3, 'três dias pendentes (06, 07 e 08/12)');
  await p.click('input[name="p-2026-12-06"][value="v"]');
  await p.click('input[name="p-2026-12-07"][value="r"]');
  await p.click('input[name="p-2026-12-08"][value="v"]');
  await p.click('#pend-salvar');
  await p.waitForSelector('#b-continuar');
  let c = await A.contas(p);
  confere(c.seqAtual === 1 && c.recorde === 6 && c.diaX === 2, 'recaída no meio: sequência recalculada (1), recorde guardado (6), hoje é o dia 2', c);
  e = await A.estado(p);
  confere(e.mensagens.dia.conjunto === 'fase1', 'ontem foi vitória: mensagem normal da fase');
  confere(e.recompensas.find((r) => r.dia === 7).liberadaEm === null, 'recompensa do dia 7 continua bloqueada (o pico foi 6)');
  await continuarMensagem(p);
  confere((await p.$$('.anteriores .cel.r')).length === 1, 'trilha mostra a recaída nos dias anteriores');

  console.log('\n6. Recaída hoje');
  await p.click('#b-recai');
  await p.waitForSelector('dialog');
  confere((await txt(p, 'dialog')).includes('continuam suas'), 'pede confirmação, sem tom de culpa');
  await naJanela(p, 'Cancelar'); await semJanela(p);
  confere(!(await A.estado(p)).checkins['2026-12-09'], 'cancelar não registra nada');
  await p.click('#b-recai');
  await naJanela(p, 'Registrar recaída');
  await p.waitForSelector('#b-graca-ok');
  const graca = await txt(p, 'dialog');
  confere(graca.includes('Graça para recomeçar') && /\d+:\d+/.test(await txt(p, 'dialog .versiculo cite')), 'mensagem de graça e recomeço, com versículo');
  confere(graca.includes('recorde de 6 dias') && graca.includes('recompensa que você liberou continua sua'), 'lembra que recorde e recompensas continuam');
  const whats = await p.$eval('dialog a.btn', (a) => a.href);
  confere(whats.startsWith('https://wa.me/5511912345678?text='), 'botão de WhatsApp para a pessoa de confiança', whats);
  await p.click('#b-graca-ok'); await semJanela(p);
  c = await A.contas(p); e = await A.estado(p);
  confere(c.seqAtual === 0 && c.recorde === 6 && e.checkins['2026-12-09'] === 'r', 'sequência volta a zero e o recorde fica');
  confere(!!e.recompensas.find((r) => r.dia === 3).liberadaEm, 'recompensa já liberada continua liberada');
  confere((await txt(p, '.cabecalho .sub')).startsWith('Amanhã: Dia 1 de 60'), 'cabeçalho: amanhã é o Dia 1');
  confere(c.previsao === '2027-02-07', 'dia 60 previsto recalculado (amanhã + 59)', c.previsao);
  await abrirNoDia(p, '2026-12-10');
  e = await A.estado(p);
  confere(e.mensagens.dia.conjunto === 'recomeco' && await txt(p, '#msg-dia') === 'Dia 1 de 60', 'no dia seguinte à recaída: mensagem de recomeço, Dia 1 de 60');
  await continuarMensagem(p);

  console.log('\n7. Correções');
  await venci(p); await p.waitForSelector('#b-corrigir-hoje');
  await p.click('#b-corrigir-hoje');
  confere((await txt(p, 'dialog')).includes('Corrigir o check-in de hoje'), 'corrigir pede confirmação');
  await naJanela(p, 'Mudar para “Recaí”');
  await p.waitForSelector('#b-graca-ok'); await p.click('#b-graca-ok'); await semJanela(p);
  confere((await A.estado(p)).checkins['2026-12-10'] === 'r', 'check-in de hoje corrigido para recaída');
  await p.click('#b-corrigir-hoje');
  await naJanela(p, 'Mudar para “Venci”'); await semJanela(p);
  c = await A.contas(p);
  confere(c.seqAtual === 1 && c.hojeSt === 'v', 'e corrigido de volta para vitória (sequência 1)', c);
  // dia passado, pelo histórico: 09/12 de recaída para vitória → 08, 09 e 10 seguidos = 3
  await p.click('#b-historico');
  await p.waitForSelector('#hist-lista');
  confere((await p.$$('#hist-lista li')).length === 10, 'histórico lista os 10 dias desde o início');
  await p.click('#hist-lista [data-data="2026-12-09"]');
  await naJanela(p, 'Mudar para “Venci”');
  await p.waitForFunction(() => window.__j60.calc().seqAtual === 3);
  c = await A.contas(p);
  confere(c.seqAtual === 3 && c.recorde === 6, 'corrigir um dia passado recalcula a sequência (3) e mantém o recorde (6)', c);
  // 07/12 de recaída para vitória → 10 dias seguidos → libera a recompensa do dia 7
  await p.click('#hist-lista [data-data="2026-12-07"]');
  await naJanela(p, 'Mudar para “Venci”');
  await p.waitForSelector('dialog .festa');
  confere((await txt(p, 'dialog .festa')).includes('Fone de ouvido'), 'a correção que junta as sequências libera a recompensa do dia 7');
  confere(!(await p.isVisible('dialog .festa a.btn')), 'recompensa sem link não mostra botão de link');
  await p.click('#b-festa-ok');
  await p.keyboard.press('Escape'); await semJanela(p);
  c = await A.contas(p);
  confere(c.seqAtual === 10 && c.recorde === 10 && await txt(p, '#num-seq') === '10', 'sequência 10 depois das correções', c);
  // clicar em um dia vencido na trilha também abre a correção
  await p.click(TRILHA + ' button >> nth=4');
  confere((await txt(p, 'dialog')).includes('Corrigir o dia 05/12/2026'), 'tocar em um dia vencido na trilha abre a correção daquele dia');
  await naJanela(p, 'Cancelar'); await semJanela(p);

  console.log('\n8. Virada da meia-noite com o app aberto');
  await p.evaluate(() => window.__j60.definirHoje('2026-12-11'));
  confere(!(await p.isVisible('#b-continuar')), 'sem voltar ao foco, a tela ainda é a de ontem');
  await p.evaluate(() => window.dispatchEvent(new Event('focus')));
  await p.waitForSelector('#b-continuar');
  confere(await txt(p, '#msg-dia') === 'Dia 11 de 60', 'ao voltar ao foco, o app percebe o novo dia e mostra a mensagem do Dia 11');
  await continuarMensagem(p);
  // dia vira e a pessoa toca em "Venci hoje" sem a aba ter perdido o foco: não pode gravar no dia errado
  await p.evaluate(() => window.__j60.definirHoje('2026-12-12'));
  await p.click('#b-venci');
  await p.waitForSelector('#pend-salvar');
  e = await A.estado(p);
  confere(!e.checkins['2026-12-12'] && !e.checkins['2026-12-11'], 'tocar em “Venci hoje” depois da virada não grava no dia errado: o app pergunta pelo dia que passou');
  await p.click('input[name="p-2026-12-11"][value="v"]');
  await p.click('#pend-salvar');
  await p.waitForSelector('#b-continuar'); await continuarMensagem(p);
  await venci(p); await p.waitForSelector('#b-corrigir-hoje');
  confere((await A.contas(p)).seqAtual === 12, 'sequência 12');
  // com a aba escondida e depois visível (troca de aba)
  await p.evaluate(() => window.__j60.definirHoje('2026-12-13'));
  await p.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await p.waitForSelector('#b-continuar');
  confere(await txt(p, '#msg-dia') === 'Dia 13 de 60', 'voltar para a aba (visibilitychange) também percebe o novo dia');
  await continuarMensagem(p);
  // os botões da faixa de teste andam o dia
  await p.click('#teste-mais');
  await p.waitForSelector('#pend-salvar');
  confere((await txt(p, '#teste-hoje')) === '14/12/2026', 'botão “+1 dia” do modo de teste avança a data');
  await p.click('#teste-menos');
  await p.waitForSelector('#b-venci');
  await venci(p); await p.waitForSelector('#b-corrigir-hoje');

  console.log('\n9. Exportar e importar');
  await p.click('#b-ajustes');
  const [download] = await Promise.all([p.waitForEvent('download'), p.click('#a-exportar')]);
  confere(download.suggestedFilename() === 'jornada60-backup-2026-12-13.json', 'exportar baixa um arquivo .json com a data', download.suggestedFilename());
  const caminho = await download.path();
  const backup = JSON.parse(fs.readFileSync(caminho, 'utf8'));
  confere(backup.app === 'jornada60' && backup.versao === 1 && Object.keys(backup.checkins).length === 13, 'o backup tem identificação, versão e os 13 check-ins');
  confere(backup.backup.ultimoEm === '2026-12-13', 'o backup registra a data em que foi feito');
  confere((await txt(p, 'dialog')).includes('Backup pronto') && (await p.inputValue('#x-texto')).includes('"jornada60"'), 'janela de backup oferece também o texto para copiar');
  await p.click('#x-ok');
  await p.keyboard.press('Escape'); await semJanela(p);
  const antes = await A.estado(p);

  // importar em um navegador "novo" (sem dados)
  const outro = await A.novaPagina(nav);
  const q = outro.pagina;
  await abrirNoDia(q, '2026-12-13');
  await q.click('text=Já tenho um backup');
  await q.setInputFiles('#i-arquivo', { name: 'qualquer.json', mimeType: 'application/json', buffer: Buffer.from('{"oi":1}') });
  await q.click('#i-restaurar');
  await q.waitForSelector('#i-erro:not([hidden])');
  confere((await txt(q, '#i-erro')).includes('não parece ser um backup'), 'importar: arquivo que não é backup é recusado');
  await q.setInputFiles('#i-arquivo', { name: 'ruim.json', mimeType: 'application/json', buffer: Buffer.from('{{{') });
  await q.click('#i-restaurar');
  await q.waitForSelector('#i-erro:not([hidden])');
  confere((await txt(q, '#i-erro')).includes('não parece ser um backup'), 'importar: arquivo quebrado é recusado');
  await q.setInputFiles('#i-arquivo', caminho);
  await q.click('#i-restaurar');
  await q.waitForSelector('#checkin');
  const depois = await A.estado(q);
  confere(JSON.stringify(depois.checkins) === JSON.stringify(antes.checkins) && JSON.stringify(depois.recompensas) === JSON.stringify(antes.recompensas) &&
    JSON.stringify(depois.perfil) === JSON.stringify(antes.perfil), 'importar em outro navegador traz check-ins, recompensas e perfil idênticos');
  confere(await txt(q, '#num-seq') === '13' && !(await q.isVisible('#b-continuar')), 'a tela volta exatamente de onde estava (sequência 13, mensagem do dia já vista)');
  await q.reload(); await q.waitForFunction(() => window.JORNADA60_OK === true);
  confere(await txt(q, '#num-seq') === '13', 'o que foi importado persiste após recarregar');
  // importar por texto colado, substituindo dados existentes (pede confirmação)
  await q.click('#b-ajustes'); await q.click('#a-importar');
  const editado = JSON.parse(JSON.stringify(backup)); editado.perfil.nome = 'Outro Nome';
  await q.fill('#i-texto', JSON.stringify(editado));
  await q.click('#i-restaurar');
  confere((await txt(q, 'dialog')).includes('Substituir os dados deste navegador?'), 'importar por cima de dados existentes pede confirmação');
  const [seguranca] = await Promise.all([q.waitForEvent('download'), naJanela(q, 'Substituir pelo backup')]);
  await q.waitForFunction(() => window.__j60.estado().perfil.nome === 'Outro Nome');
  confere((await txt(q, '#titulo')).includes('Outro Nome'), 'importar por texto colado funciona');
  const copia = JSON.parse(fs.readFileSync(await seguranca.path(), 'utf8'));
  confere(seguranca.suggestedFilename() === 'jornada60-seguranca-2026-12-13.json' && copia.perfil.nome === 'Davi' && Object.keys(copia.checkins).length === 13,
    'antes de substituir, o app baixa sozinho uma cópia de segurança do que havia', seguranca.suggestedFilename());
  // backup de versão mais nova é recusado, sem estragar nada
  await q.click('#b-ajustes'); await q.click('#a-importar');
  await q.fill('#i-texto', JSON.stringify(Object.assign({}, backup, { versao: 99 })));
  await q.click('#i-restaurar');
  confere((await txt(q, '#i-erro')).includes('versão mais nova'), 'backup de versão mais nova é recusado com explicação');
  confere(outro.registro.erros.length === 0 && outro.registro.console.length === 0, 'sem erros no console (navegador da importação)', outro.registro);
  await outro.contexto.close();

  console.log('\n10. Dados de verdade separados dos de teste');
  const real = await contexto.newPage();
  await real.goto(A.url(null)); await real.waitForFunction(() => window.JORNADA60_OK === true);
  confere(await real.isVisible('#g-comecar') && !(await real.isVisible('.faixa.teste')), 'sem “?hoje=”, o app abre do zero: não enxerga os dados de teste');
  confere((await real.evaluate(() => localStorage.getItem('jornada60'))) === null, 'abrir sem mexer não cria nada na chave de verdade');
  await real.close();
  confere(!!(await p.evaluate(() => localStorage.getItem('jornada60:teste'))), 'os dados de teste continuam na chave de teste');

  confere(registro.erros.length === 0, 'nenhum erro de script durante todo o fluxo', registro.erros);
  confere(registro.console.length === 0, 'console sem erros nem avisos', registro.console);
  confere(registro.rede.length === 0, 'nenhuma chamada de rede', registro.rede);
  await contexto.close();
}

async function diaSessenta(nav) {
  console.log('\n11. Chegada ao dia 60');
  const { contexto, pagina: p, registro } = await A.novaPagina(nav);
  await abrirNoDia(p, '2026-12-01');
  await A.configurar(p, {
    nome: 'Rute', compromisso: 'Projeto Fênix', inicio: '2026-10-03',
    recompensas: [{ dia: 3, nome: 'Livro', emoji: '📚' }, { dia: 30, nome: 'Tênis', emoji: '👟', link: 'https://exemplo.com/tenis' }, { dia: 60, nome: 'Viagem', emoji: '✈️' }],
  });
  await p.waitForSelector('#pend-salvar');
  confere((await p.$$('.pend')).length === 59, 'início há 59 dias: o app pergunta pelos 59 dias');
  await p.click('[data-acao="pend-todos"][data-v="v"]');
  await p.click('#pend-salvar');
  await p.waitForSelector('dialog .festa');
  confere((await txt(p, 'dialog .festa')).includes('2 recompensas de uma vez'), 'respondendo vários dias, libera de uma vez as recompensas dos dias 3 e 30');
  await p.click('#b-festa-ok');
  await p.waitForSelector('#b-continuar');
  confere(await txt(p, '#msg-dia') === 'Dia 60 de 60', 'mensagem do “Dia 60 de 60”');
  let e = await A.estado(p);
  confere(e.mensagens.dia.conjunto === 'recompensa', 'dia 60 com recompensa: mensagem especial');
  confere(e.recompensas.find((r) => r.dia === 3).liberadaEm === '2026-10-05' && e.recompensas.find((r) => r.dia === 30).liberadaEm === '2026-11-01', 'cada recompensa guarda o dia em que foi liberada', e.recompensas.map((r) => r.liberadaEm));
  await continuarMensagem(p);
  confere((await txt(p, '.marca span')) === 'Projeto Fênix', 'nome do compromisso aparece no topo');
  confere(await txt(p, '#num-seq') === '59', 'sequência 59 antes do check-in');
  await venci(p);
  await p.waitForSelector('dialog .festa');
  confere((await txt(p, 'dialog .festa')).includes('Viagem'), 'a vitória do dia 60 libera a última recompensa');
  await p.click('#b-festa-ok');
  await p.waitForSelector('#b-ver-jornada');
  const fim = await txt(p, '#conteudo');
  confere(fim.includes('60 dias seguidos. Você conseguiu, Rute!'), 'tela final de celebração com o nome');
  confere(fim.includes('Dias seguidos 60') && fim.includes('Dias vencidos no total 60') && fim.includes('Recaídas superadas 0') && fim.includes('Recompensas liberadas 3 de 3'), 'tela final com os números', fim.slice(0, 400));
  confere(fim.includes('03/10/2026 a 01/12/2026') && fim.includes('Projeto Fênix') && fim.includes('2 Timóteo 4:7'), 'tela final com datas, compromisso e versículo');
  confere(await p.isVisible('#b-sos'), 'botão de tentação continua visível na tela final');
  await p.reload(); await p.waitForFunction(() => window.JORNADA60_OK === true);
  confere(await p.isVisible('#b-ver-jornada'), 'recarregar mantém a jornada concluída');
  await p.click('#b-ver-jornada');
  await p.waitForSelector('#checkin');
  confere(!(await p.isVisible('#b-venci')) && (await txt(p, '#checkin')).includes('Jornada concluída'), 'depois de concluir, não há mais check-in');
  confere((await p.$$(TRILHA + ' .cel.v')).length === 60, 'trilha com os 60 dias vencidos');
  confere((await p.$$('.premio-card.lib')).length === 3, 'as três recompensas estão liberadas');
  await abrirNoDia(p, '2026-12-20');
  confere(await p.isVisible('#b-ver-jornada') && !(await p.isVisible('#pend-salvar')), 'dias depois da conclusão não viram pendências');
  confere(registro.erros.length === 0 && registro.console.length === 0 && registro.rede.length === 0, 'sem erros, avisos ou rede', registro);
  await contexto.close();
}

async function reinicioELembrete(nav) {
  console.log('\n12. Lembrete de backup e reinício com confirmação dupla');
  const { contexto, pagina: p, registro } = await A.novaPagina(nav);
  await abrirNoDia(p, '2026-12-01');
  await A.configurar(p, { nome: 'Ana', motivos: ['Paz', 'Saúde'], confNome: 'Bia', confWhats: '11912345678', recompensas: [{ dia: 2, nome: 'Café especial', emoji: '☕' }] });
  await continuarMensagem(p); await venci(p); await p.waitForSelector('#b-corrigir-hoje');
  confere(!(await p.isVisible('#lembrete-backup')), 'no começo não há lembrete de backup');
  await abrirNoDia(p, '2026-12-07');
  await p.click('[data-acao="pend-todos"][data-v="v"]'); await p.click('#pend-salvar');
  await p.waitForSelector('dialog .festa'); await p.click('#b-festa-ok');
  await p.waitForSelector('#b-continuar'); await continuarMensagem(p);
  confere(!(await p.isVisible('#lembrete-backup')), 'com 6 dias ainda não lembra');
  await abrirNoDia(p, '2026-12-08');
  await p.click('input[name="p-2026-12-07"][value="v"]'); await p.click('#pend-salvar');
  await p.waitForSelector('#b-continuar'); await continuarMensagem(p);
  confere(await p.isVisible('#lembrete-backup'), 'com 7 dias aparece o lembrete discreto de backup');
  await p.click('[data-acao="backup-depois"]');
  confere(!(await p.isVisible('#lembrete-backup')), '“Depois” esconde o lembrete');
  await abrirNoDia(p, '2026-12-14');
  await p.click('[data-acao="pend-todos"][data-v="v"]'); await p.click('#pend-salvar');
  await p.waitForSelector('#b-continuar'); await continuarMensagem(p);
  confere(!(await p.isVisible('#lembrete-backup')), '6 dias depois de adiar, ainda escondido');
  await abrirNoDia(p, '2026-12-15');
  await p.click('input[name="p-2026-12-14"][value="v"]'); await p.click('#pend-salvar');
  await p.waitForSelector('#b-continuar'); await continuarMensagem(p);
  confere(await p.isVisible('#lembrete-backup'), '7 dias depois de adiar, o lembrete volta');
  const [d1] = await Promise.all([p.waitForEvent('download'), p.click('#lembrete-backup [data-acao="exportar"]')]);
  await d1.path();
  await p.click('#x-ok'); await semJanela(p);
  confere(!(await p.isVisible('#lembrete-backup')) && (await A.estado(p)).backup.ultimoEm === '2026-12-15', 'fazer o backup zera o lembrete');

  // reinício mantendo a configuração
  await p.click('#b-ajustes'); await p.click('#a-reiniciar');
  confere((await txt(p, 'dialog')).includes('Reiniciar a jornada?'), 'primeira confirmação do reinício');
  await p.click('#z-continuar');
  await p.fill('#z-texto', 'reinicia');
  await p.click('#z-confirmar');
  confere((await txt(p, '#z-erro')).includes('REINICIAR') && Object.keys((await A.estado(p)).checkins).length === 14, 'segunda confirmação: sem a palavra certa, nada é apagado');
  await p.fill('#z-texto', 'REINICIAR');
  const [antesDeApagar] = await Promise.all([p.waitForEvent('download'), p.click('#z-confirmar')]);
  await p.waitForSelector('#b-continuar');
  const guardado = JSON.parse(fs.readFileSync(await antesDeApagar.path(), 'utf8'));
  confere(antesDeApagar.suggestedFilename() === 'jornada60-seguranca-2026-12-15.json' && Object.keys(guardado.checkins).length === 14,
    'antes de reiniciar, o app baixa sozinho uma cópia de segurança com os 14 check-ins', antesDeApagar.suggestedFilename());
  let e = await A.estado(p);
  confere(Object.keys(e.checkins).length === 0 && e.perfil.nome === 'Ana' && e.perfil.inicio === '2026-12-15' && e.perfil.motivos.length === 2, 'reiniciar mantendo a configuração: check-ins zerados, perfil mantido, início hoje');
  confere(e.recompensas.length === 1 && e.recompensas[0].liberadaEm === null && e.tentacoesVencidas === 0, 'recompensas voltam a ficar bloqueadas');
  confere(await txt(p, '#msg-dia') === 'Dia 1 de 60', 'recomeça no Dia 1');
  await continuarMensagem(p);
  // reinício apagando tudo
  await p.click('#b-ajustes'); await p.click('#a-reiniciar');
  await p.uncheck('#z-manter');
  await p.click('#z-continuar'); await p.fill('#z-texto', 'REINICIAR'); await p.click('#z-confirmar');
  await p.waitForSelector('#g-comecar');
  e = await A.estado(p);
  confere(e.perfil === null && e.recompensas.length === 0, 'reiniciar sem manter volta para a configuração guiada');

  // ajustes: editar perfil
  await A.configurar(p, { nome: 'Ana' });
  await continuarMensagem(p);
  await p.click('#b-ajustes');
  await p.fill('#a-nome', 'Aninha'); await p.fill('#a-compromisso', 'Vida nova');
  await p.fill('#a-conf-nome', 'Carla'); await p.fill('#a-conf-whats', '+55 (21) 98888-7777');
  await p.click('#a-salvar'); await semJanela(p);
  e = await A.estado(p);
  confere(e.perfil.nome === 'Aninha' && e.perfil.compromisso === 'Vida nova' && e.perfil.confianca.nome === 'Carla', 'ajustes: perfil editado e guardado');
  confere((await txt(p, '#titulo')).includes('Aninha') && (await txt(p, '.marca span')) === 'Vida nova', 'a tela reflete os ajustes');
  // recompensas com a jornada em andamento: adicionar, editar (mudar de dia) e apagar
  await p.click('#b-premio-novo');
  await p.fill('#p-dia', '4'); await p.fill('#p-nome', 'Pizza'); await p.click('#p-salvar'); await semJanela(p);
  confere((await p.$$('.premio-card')).length === 1, 'adicionar recompensa com a jornada em andamento');
  await p.click('.premio-card [data-acao="premio-editar"]');
  await p.fill('#p-dia', '6'); await p.fill('#p-nome', 'Pizza grande'); await p.click('#p-salvar'); await semJanela(p);
  e = await A.estado(p);
  confere(e.recompensas[0].dia === 6 && e.recompensas[0].nome === 'Pizza grande', 'editar e mudar de dia');
  await p.click('.sugestoes .chip >> text=Dia 3');
  confere(await p.inputValue('#p-dia') === '3', 'marcos vazios sugeridos abrem o formulário com o dia');
  await p.fill('#p-nome', 'Chocolate'); await p.click('#p-salvar'); await semJanela(p);
  await p.click('.premio-card >> nth=0 >> [data-acao="premio-editar"]');
  await p.click('[data-acao="premio-apagar"]'); await naJanela(p, 'Apagar'); await semJanela(p);
  confere((await A.estado(p)).recompensas.length === 1, 'apagar recompensa com a jornada em andamento');
  // recompensa criada em um dia que a sequência atual já passou: libera na hora
  await venci(p); await p.waitForSelector('#b-corrigir-hoje');
  await p.click('#b-premio-novo');
  await p.fill('#p-dia', '1'); await p.fill('#p-nome', 'Sobremesa'); await p.click('#p-salvar');
  await p.waitForSelector('dialog .festa');
  confere((await txt(p, 'dialog .festa')).includes('já passou do dia'), 'recompensa criada em dia já alcançado é liberada na hora');
  await p.click('#b-festa-ok'); await semJanela(p);
  confere(registro.erros.length === 0 && registro.console.length === 0 && registro.rede.length === 0, 'sem erros, avisos ou rede', registro);
  await contexto.close();
}

async function adiarFuturoEDesfazer(nav) {
  console.log('\n13. “Responder depois”, início no futuro e conclusão desfeita por correção');
  const { contexto, pagina: p, registro } = await A.novaPagina(nav);
  await abrirNoDia(p, '2026-12-01');
  await A.configurar(p, { nome: 'Lia', inicio: '2026-12-03', recompensas: [{ dia: 2, nome: 'Sorvete', emoji: '🍦' }] });
  await p.waitForSelector('#checkin');
  confere((await txt(p, '#checkin')).includes('ainda não começou') && (await txt(p, '#checkin')).includes('em 2 dias'), 'início no futuro: a tela avisa que a jornada ainda não começou');
  confere(!(await p.isVisible('#b-venci')) && !(await p.isVisible('#mensagem-do-dia')) && await p.isVisible('#b-sos'), 'sem check-in nem mensagem antes do dia 1; botão de tentação disponível');
  confere((await p.$$(TRILHA + ' button')).length === 0 && (await txt(p, '#numeros')).includes('31 de janeiro de 2027'), 'trilha toda por vir e dia 60 previsto a partir do início');
  confere(await p.isVisible('#dica-salvar'), 'logo depois de configurar, o app convida a conferir se o navegador guarda os dados');
  await p.click('#b-sos'); await p.keyboard.press('Escape'); await semJanela(p);
  await abrirNoDia(p, '2026-12-03');
  confere(await txt(p, '#msg-dia') === 'Dia 1 de 60', 'no dia marcado, começa o Dia 1');
  await continuarMensagem(p);
  confere(!(await p.isVisible('#dica-salvar')), 'ao reabrir e achar os dados, o convite some sozinho');
  confere((await A.estado(p)).salvamentoConferido === true, 'o app registra que este navegador guarda os dados');
  await venci(p); await p.waitForSelector('#b-corrigir-hoje');

  // três dias sem abrir: adiar as respostas
  await abrirNoDia(p, '2026-12-07');
  await p.waitForSelector('#pend-salvar');
  await p.click('#pend-depois');
  await p.waitForSelector('#b-pend-agora');
  confere(!(await p.isVisible('#b-venci')) && (await txt(p, '#checkin')).includes('Há 3 dias sem registro'), '“Responder depois”: a tela inicial abre, mas o check-in de hoje continua travado');
  confere((await txt(p, '.cabecalho .sub')).startsWith('3 dias pendentes') && !(await p.isVisible('#mensagem-do-dia')), 'cabeçalho mostra as pendências, e a mensagem do dia espera as respostas');
  confere((await p.$$(TRILHA + ' .cel.p')).length === 3 && (await p.$$(TRILHA + ' .cel.v')).length === 1, 'a trilha mostra os 3 dias pendentes');
  const e = await A.estado(p);
  confere(Object.keys(e.checkins).length === 1 && (await A.contas(p)).seqAtual === 1, 'pendência não vira vitória nem recaída: a sequência fica parada em 1');
  await p.reload(); await p.waitForFunction(() => window.JORNADA60_OK === true);
  confere(await p.isVisible('#pend-salvar'), 'ao abrir de novo, o app volta a perguntar');
  await p.click('#pend-depois');
  await p.click(TRILHA + ' .cel.p >> nth=0');
  await p.waitForSelector('#pend-salvar');
  confere(true, 'tocar em um dia pendente da trilha leva às perguntas');
  await p.click('#pend-depois');
  await p.click('#b-historico');
  await p.locator('#hist-lista').getByRole('button', { name: 'Responder', exact: true }).first().click();
  await p.waitForSelector('#pend-salvar');
  confere(!(await p.isVisible('dialog')), 'o histórico também leva às perguntas');
  await p.click('input[name="p-2026-12-04"][value="v"]');
  await p.click('input[name="p-2026-12-05"][value="r"]');
  await p.click('input[name="p-2026-12-06"][value="v"]');
  await p.click('#pend-salvar');
  await p.waitForSelector('dialog .festa');
  confere((await txt(p, 'dialog .festa')).includes('Sorvete'), 'ao responder, a recompensa alcançada no período (dia 2) é liberada');
  await p.click('#b-festa-ok');
  await p.waitForSelector('#b-continuar');
  confere(await txt(p, '#msg-dia') === 'Dia 2 de 60', 'depois das respostas vem a mensagem do dia certo (Dia 2)');
  await continuarMensagem(p);

  // jornada concluída e depois desfeita por uma correção
  await p.evaluate(() => {
    const j = window.__j60, ck = {};
    for (let i = 0; i < 60; i++) ck[j.util.somarDias('2026-09-01', i)] = 'v';
    const est = j.estado(); est.perfil.inicio = '2026-09-01'; est.checkins = ck;
    j.definirEstado(est);
  });
  await p.waitForSelector('#b-ver-jornada');
  confere((await A.contas(p)).concluidaEm === '2026-10-30', 'jornada concluída em 30/10');
  await p.click('#b-ver-jornada'); await p.waitForSelector('#checkin');
  await p.click('#b-historico');
  await p.click('#hist-lista [data-data="2026-10-10"]');
  await naJanela(p, 'Mudar para “Recaí”');
  await p.waitForSelector('#pend-salvar');
  const c = await A.contas(p);
  confere(c.concluidaEm === null && c.recorde === 39 && c.pendentes.length === 37, 'corrigir um dia para recaída desfaz a conclusão, recalcula tudo e o app pergunta pelos dias seguintes', { concl: c.concluidaEm, rec: c.recorde, pend: c.pendentes.length });
  confere(!(await p.isVisible('dialog')), 'as janelas se fecham ao mudar de tela');
  await p.click('[data-acao="pend-todos"][data-v="v"]'); await p.click('#pend-salvar');
  await p.waitForSelector('#b-venci');
  confere((await txt(p, '.cabecalho .sub')).startsWith('Dia 58 de 60') && (await A.contas(p)).seqAtual === 57, 'respondendo os dias, a contagem segue do ponto certo (20 dias depois da recaída + 37 = 57; hoje é o Dia 58)', await A.contas(p));
  confere(registro.erros.length === 0 && registro.console.length === 0 && registro.rede.length === 0, 'sem erros, avisos ou rede', registro);
  await contexto.close();
}

(async () => {
  const nav = await A.novoNavegador();
  try {
    await primeiraAbertura(nav);
    await diaSessenta(nav);
    await reinicioELembrete(nav);
    await adiarFuturoEDesfazer(nav);
  } finally {
    await nav.close();
  }
  process.exit(A.resumo() ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
