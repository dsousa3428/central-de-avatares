// Casos que a revisão independente do código encontrou (e que os outros testes não pegavam).
// Cada grupo reproduz o problema e confere a correção.
// Uso: node dev/jornada-60/testes/revisao.cjs        (todos os grupos)
//      node dev/jornada-60/testes/revisao.cjs 5      (só o grupo 5)
// Para ver um grupo falhar na versão anterior do app: J60_ARQUIVO=/caminho/do/index-antigo.html node …/revisao.cjs
const fs = require('fs');
const os = require('os');
const path = require('path');
const A = require('./apoio.cjs');
const { confere } = A;

const CHAVE = 'jornada60:teste';
const txt = async (p, sel) => ((await p.locator(sel).last().innerText()) || '').replace(/\s+/g, ' ').trim();
const pronto = (p) => p.waitForFunction(() => window.JORNADA60_OK === true);
const semJanela = (p) => p.waitForSelector('dialog', { state: 'detached' });
const naJanela = (p, nome) => p.locator('dialog').last().getByRole('button', { name: nome, exact: true }).click();
const temBotao = (p, nome) => p.locator('dialog').last().getByRole('button', { name: nome, exact: true }).isVisible();
const guardado = (p) => p.evaluate((k) => localStorage.getItem(k), CHAVE);
const somar = (s, n) => new Date(Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)) + n * 86400000).toISOString().slice(0, 10);

function estadoBase(extra) {
  return Object.assign({
    app: 'jornada60', versao: 1, criadoEm: '2026-12-01', salvamentoConferido: true,
    perfil: { nome: 'Davi', compromisso: '', inicio: '2026-12-01', motivos: ['Família'], confianca: { nome: '', whatsapp: '' } },
    recompensas: [], checkins: {}, saidas: ['Orar'], tentacoesVencidas: 0,
    mensagens: { vistas: {}, dia: null }, backup: { ultimoEm: null, lembreteEm: null }, finalVistoEm: null,
  }, extra || {});
}
const vencidos = (inicio, n) => { const o = {}; for (let i = 0; i < n; i++) o[somar(inicio, i)] = 'v'; return o; };
const comPremio = () => estadoBase({
  checkins: vencidos('2026-12-01', 5),
  recompensas: [{ id: 'a', dia: 3, nome: 'Livro', emoji: '📚', liberadaEm: '2026-12-03' }],
});

// Guarda um estado no navegador e abre o app com ele: abre o app em branco, grava o estado por page.evaluate e abre
// de novo. NÃO ponha dados por addInitScript: quando um script desses encosta no localStorage (ou no sessionStorage)
// antes de a página carregar, o Chromium de vez em quando entrega o armazenamento VAZIO ao documento recarregado, e
// o teste falha 1 vez em 5 culpando o app. Sem isso, o app achou os dados em 600 de 600 reaberturas.
async function porEstado(pagina, endereco, est) {
  await pagina.goto(endereco); await pronto(pagina);
  await pagina.evaluate(([k, s]) => localStorage.setItem(k, s), [CHAVE, typeof est === 'string' ? est : JSON.stringify(est)]);
}

// abre uma página com um estado já guardado
async function abrirCom(nav, hoje, est, opcoes, contextoPronto) {
  const r = contextoPronto ? { contexto: contextoPronto, pagina: await contextoPronto.newPage(), registro: { console: [], erros: [], rede: [] } } : await A.novaPagina(nav, opcoes || {});
  if (contextoPronto) r.pagina.on('pageerror', (e) => r.registro.erros.push(String(e)));
  if (est) await porEstado(r.pagina, A.url(hoje), est);
  await r.pagina.goto(A.url(hoje)); await pronto(r.pagina);
  return r;
}
const passarMensagem = async (p) => { if (await p.isVisible('#b-continuar')) { await p.click('#b-continuar'); await p.waitForSelector('#checkin'); } };
const virarODia = (p, dia) => p.evaluate((d) => { window.__j60.definirHoje(d); window.dispatchEvent(new Event('focus')); }, dia);

async function confirmacaoNaVirada(nav) {
  console.log('\n1. Confirmação aberta enquanto o dia vira');
  let { contexto, pagina: p, registro } = await abrirCom(nav, '2026-12-06', estadoBase({ checkins: vencidos('2026-12-01', 5) }));
  await passarMensagem(p);
  await p.click('#b-recai');
  await virarODia(p, '2026-12-07');
  confere(await p.isVisible('dialog'), 'a janela “Registrar recaída hoje?” continua aberta depois da virada');
  await naJanela(p, 'Registrar recaída');
  await p.waitForSelector('#pend-salvar');
  let e = await A.estado(p);
  confere(!e.checkins['2026-12-06'] && !e.checkins['2026-12-07'], 'confirmar depois da virada não grava nada (nem no dia que passou, nem no novo)', e.checkins);
  confere(!(await p.isVisible('dialog')) && (await p.$$('.pend')).length === 1 && (await txt(p, '#titulo')) === 'Como foi ontem?', 'o app passa a perguntar pelo dia que ficou sem resposta, sem a janela de “graça”');
  confere((await txt(p, '#avisos')).includes('O dia virou'), 'e avisa que o dia virou');
  confere(registro.erros.length === 0, 'sem erro de script', registro.erros);
  await contexto.close();

  ({ contexto, pagina: p, registro } = await abrirCom(nav, '2026-12-06', estadoBase({ checkins: vencidos('2026-12-01', 6) })));
  await passarMensagem(p);
  await p.click('#b-corrigir-hoje');
  await virarODia(p, '2026-12-07');
  await naJanela(p, await temBotao(p, 'Mudar para “Recaí”') ? 'Mudar para “Recaí”' : 'Mudar');
  await p.waitForSelector('#b-continuar');
  e = await A.estado(p);
  confere(e.checkins['2026-12-06'] === 'v' && e.mensagens.dia.conjunto === 'fase1' && (await txt(p, '#msg-dia')) === 'Dia 7 de 60', 'correção confirmada depois da virada não é aplicada; o novo dia segue normal', e.mensagens.dia);
  confere(registro.erros.length === 0, 'sem erro de script', registro.erros);
  await contexto.close();
}

async function toqueDuplo(nav) {
  console.log('\n2. Toque duplo não aciona o botão que apareceu embaixo do dedo');
  // 2a. o caso que a revisão achou: em parte das mensagens, “Continuar” fica onde, logo depois, aparece “Venci hoje”
  for (const viewport of [{ width: 412, height: 915 }, { width: 1366, height: 768 }]) {
    const { contexto, pagina: p, registro } = await abrirCom(nav, '2026-12-06', estadoBase({ checkins: vencidos('2026-12-01', 5) }), { viewport });
    await p.waitForSelector('#b-continuar');
    const ids = await p.evaluate(() => window.__j60.banco().fase1.map((x) => x.id));
    const preparar = async (id) => {
      await p.evaluate((id) => {
        const e = window.__j60.estado();
        e.mensagens.dia = { data: '2026-12-06', conjunto: 'fase1', id, vista: false, missaoFeita: false };
        delete e.checkins['2026-12-06'];
        window.__j60.definirEstado(e);
      }, id);
      await p.waitForSelector('#b-continuar');
      await p.locator('#b-continuar').scrollIntoViewIfNeeded();
    };
    let ponto = null, escolhida = null;
    for (const id of ids) {
      await preparar(id);
      const c = await p.locator('#b-continuar').boundingBox();
      await p.click('#b-continuar'); await p.waitForSelector('#b-venci');
      const v = await p.locator('#b-venci').boundingBox();
      const w = Math.min(c.x + c.width, v.x + v.width) - Math.max(c.x, v.x), h = Math.min(c.y + c.height, v.y + v.height) - Math.max(c.y, v.y);
      if (w < 12 || h < 12) continue;
      const x = Math.max(c.x, v.x) + w / 2, y = Math.max(c.y, v.y) + h / 2;
      await p.waitForTimeout(750);      // depois que a tela nova passa a aceitar toques
      const livre = await p.evaluate(({ x, y }) => { const el = document.elementFromPoint(x, y); return !!(el && el.closest('#b-venci')); }, { x, y });
      if (livre) { ponto = { x, y }; escolhida = id; break; }
    }
    const onde = viewport.width + ' px: ';
    confere(!!ponto, onde + 'há mensagens em que “Continuar” e “Venci hoje” ocupam o mesmo lugar da tela (o caso que a revisão achou)');
    if (ponto) {
      for (const [pausa, nome] of [[120, 'dois toques seguidos'], [450, 'dois toques um pouco mais lentos (0,45 s)']]) {
        await preparar(escolhida);
        await p.mouse.click(ponto.x, ponto.y); await p.waitForTimeout(pausa); await p.mouse.click(ponto.x, ponto.y);
        await p.waitForTimeout(400);
        const e = await A.estado(p);
        confere(!e.checkins['2026-12-06'] && await p.isVisible('#b-venci'), onde + nome + ' em “Continuar” não marcam “Venci hoje”', e.checkins['2026-12-06']);
      }
      await preparar(escolhida);
      await p.mouse.dblclick(ponto.x, ponto.y);
      await p.waitForTimeout(400);
      confere(!(await A.estado(p)).checkins['2026-12-06'], onde + 'nem um clique duplo de mouse');
      await p.waitForTimeout(400);
      await p.mouse.click(ponto.x, ponto.y);
      await p.waitForSelector('#b-corrigir-hoje');
      confere((await A.estado(p)).checkins['2026-12-06'] === 'v', onde + 'passado o instante de proteção, um toque em “Venci hoje” vale normalmente');
    }
    confere(registro.erros.length === 0, 'sem erro de script', registro.erros);
    await contexto.close();
  }

  // 2b. uma tela (ou janela) que acabou de aparecer não aceita toque por um instante; vale também com “reduzir movimento”
  for (const semMovimento of [false, true]) {
    const { contexto, pagina: p } = await abrirCom(nav, '2026-12-06', estadoBase({ checkins: vencidos('2026-12-01', 5) }), { semMovimento });
    const com = semMovimento ? 'com “reduzir movimento”: ' : '';
    await p.waitForSelector('#b-continuar');
    const logo = await p.evaluate(() => {
      document.getElementById('b-continuar').click();
      return { tela: getComputedStyle(document.getElementById('conteudo')).pointerEvents, botoes: getComputedStyle(document.querySelector('.checkin .acoes')).pointerEvents };
    });
    await p.waitForTimeout(800);
    const depois = await p.evaluate(() => ({ tela: getComputedStyle(document.getElementById('conteudo')).pointerEvents, botoes: getComputedStyle(document.querySelector('.checkin .acoes')).pointerEvents }));
    confere(logo.tela === 'none' && logo.botoes === 'none' && depois.tela === 'auto' && depois.botoes === 'auto',
      com + 'logo depois de trocar de tela os botões não aceitam toque; em seguida voltam ao normal', { logo, depois });
    const janelaLogo = await p.evaluate(() => {
      document.getElementById('b-recai').click();
      return getComputedStyle(document.querySelector('dialog')).pointerEvents;
    });
    await p.waitForTimeout(600);
    const janelaDepois = await p.evaluate(() => getComputedStyle(document.querySelector('dialog')).pointerEvents);
    confere(janelaLogo === 'none' && janelaDepois === 'auto', com + 'uma janela que acabou de abrir também não aceita toque por um instante', { janelaLogo, janelaDepois });
    await contexto.close();
  }

  // 2c. clique duplo nos outros botões (no celular e no computador: a posição das janelas muda o que fica sob o ponteiro)
  for (const viewport of [{ width: 390, height: 844 }, { width: 1280, height: 800 }]) {
    const { contexto, pagina: p, registro } = await abrirCom(nav, '2026-12-06', comPremio(), { viewport });
    const onde = viewport.width + ' px: ';
    const fecharSeAberta = async () => { if (await p.isVisible('dialog')) { await p.keyboard.press('Escape'); await semJanela(p); } };
    await passarMensagem(p);
    await p.dblclick('#b-recai');
    await p.waitForTimeout(500);
    confere(await p.isVisible('dialog'), onde + 'clique duplo em “Recaí hoje” deixa a confirmação aberta (ela não abre e fecha sozinha)');
    await fecharSeAberta();
    await p.dblclick('.premio-card.lib [data-acao="premio-resgatar"]');
    await p.waitForTimeout(500);
    let e = await A.estado(p);
    confere(!!e.recompensas[0].resgatadaEm, onde + 'clique duplo em “Já resgatei” não desfaz o próprio resgate');
    await fecharSeAberta();
    if (!e.recompensas[0].resgatadaEm) await p.click('.premio-card.lib [data-acao="premio-resgatar"]');
    await p.click('.premio-card.resg [data-acao="premio-desfazer"]');
    await p.waitForTimeout(300);
    const pediu = await p.isVisible('dialog') && (await txt(p, 'dialog')).includes('Desmarcar o resgate?');
    confere(pediu, onde + 'desfazer o resgate pede confirmação');
    if (pediu) { await naJanela(p, 'Desmarcar'); await semJanela(p); }
    confere((await A.estado(p)).recompensas[0].resgatadaEm === null, onde + 'e, confirmando, desmarca');
    await p.dblclick('#b-venci');
    await p.waitForSelector('#b-corrigir-hoje');
    await p.waitForTimeout(500);
    confere(!(await p.isVisible('dialog')) && (await A.estado(p)).checkins['2026-12-06'] === 'v', onde + 'clique duplo em “Venci hoje” marca uma vez só e não abre a correção');
    await fecharSeAberta();
    await p.dblclick('#b-corrigir-hoje');
    await p.waitForTimeout(500);
    confere(await p.isVisible('dialog') && (await A.estado(p)).checkins['2026-12-06'] === 'v', onde + 'clique duplo em “Corrigir o check-in de hoje” deixa a pergunta aberta, sem mudar nada');
    await fecharSeAberta();
    confere(registro.erros.length === 0 && registro.console.length === 0, 'sem erros no console', registro);
    await contexto.close();
  }

  // 2d. os botões de andar os dias no modo de teste são para apertar várias vezes: cliques rápidos continuam valendo
  const { contexto, pagina: p } = await abrirCom(nav, '2026-12-06', estadoBase({ checkins: vencidos('2026-12-01', 6) }));
  await passarMensagem(p);
  await p.click('#teste-mais', { clickCount: 3, delay: 30 });
  confere((await p.evaluate(() => window.__j60.hoje())) === '2026-12-09', 'no modo de teste, três cliques rápidos em “+1 dia” andam três dias', await p.evaluate(() => window.__j60.hoje()));
  await contexto.close();
}

async function tirarAMarcacao(nav) {
  console.log('\n3. Marcou sem querer: dá para tirar a marcação de hoje');
  const { contexto, pagina: p, registro } = await abrirCom(nav, '2026-12-06', comPremio());
  await passarMensagem(p);
  await p.click('#b-venci'); await p.waitForSelector('#b-corrigir-hoje');
  await p.click('#b-corrigir-hoje');
  confere((await txt(p, 'dialog')).includes('Tirar a marcação'), 'a correção de hoje oferece “Tirar a marcação”');
  await naJanela(p, 'Tirar a marcação'); await semJanela(p);
  let e = await A.estado(p);
  confere(!e.checkins['2026-12-06'] && await p.isVisible('#b-venci') && (await A.contas(p)).seqAtual === 5, 'o dia de hoje volta a ficar em aberto, com a sequência de ontem (5)');
  confere(!!e.recompensas[0].liberadaEm, 'a recompensa já liberada continua liberada');
  await p.reload(); await pronto(p);
  e = await A.estado(p);
  confere(!e.checkins['2026-12-06'] && await p.isVisible('#b-venci'), 'e continua em aberto depois de recarregar',
    { hoje: e.checkins['2026-12-06'] || null, mensagem: e.mensagens.dia, titulo: await txt(p, '#titulo, #checkin-titulo') });
  await p.click('#b-recai'); await naJanela(p, 'Registrar recaída'); await p.waitForSelector('#b-graca-ok'); await p.click('#b-graca-ok'); await semJanela(p);
  await p.click('#b-corrigir-hoje');
  await naJanela(p, 'Tirar a marcação'); await semJanela(p);
  confere(!(await A.estado(p)).checkins['2026-12-06'] && (await A.contas(p)).seqAtual === 5, 'também dá para tirar uma recaída marcada sem querer: a sequência volta ao que era');
  await p.click('#b-historico');
  await p.click('#hist-lista [data-data="2026-12-04"]');
  confere(!(await txt(p, 'dialog')).includes('Tirar a marcação'), 'em dia passado só dá para trocar a resposta (não para deixar em branco)');
  await p.keyboard.press('Escape'); await p.keyboard.press('Escape'); await semJanela(p);
  confere(registro.erros.length === 0 && registro.console.length === 0, 'sem erros no console', registro);
  await contexto.close();
}

async function restaurarNaTelaDeErro(nav) {
  console.log('\n4. Restaurar um backup quando há dados guardados que o app não abriu');
  const novo = JSON.stringify({ app: 'jornada60', versao: 99, perfil: { nome: 'Do Futuro', inicio: '2026-11-01' }, coisaNova: [1, 2, 3] });
  const { contexto, pagina: p, registro } = await abrirCom(nav, '2026-12-06', novo);
  confere((await txt(p, '.falha')).includes('versão mais nova'), 'dados de uma versão mais nova: tela de aviso');
  await p.click('[data-acao="importar"]');
  confere((await txt(p, 'dialog')).includes('substituído'), 'a janela de restauração avisa que vai substituir o que está guardado');
  await p.fill('#i-texto', JSON.stringify(estadoBase({ checkins: vencidos('2026-12-01', 3) })));
  await p.click('#i-restaurar');
  await p.waitForSelector('dialog >> text=Substituir o que está guardado?');
  await naJanela(p, 'Cancelar');
  confere((await guardado(p)) === novo, 'cancelando, o que estava guardado continua intacto');
  await p.click('#i-restaurar');
  const [copia] = await Promise.all([p.waitForEvent('download'), naJanela(p, 'Substituir')]);
  confere(fs.readFileSync(await copia.path(), 'utf8') === novo, 'confirmando, o app baixa antes uma cópia dos dados como estavam');
  await p.waitForFunction(() => window.__j60.estado() && window.__j60.estado().perfil.nome === 'Davi');
  confere(JSON.parse(await guardado(p)).perfil.nome === 'Davi', 'e só então restaura o backup');
  confere(registro.erros.length === 0, 'sem erro de script', registro.erros);
  await contexto.close();
}

async function dadosMudaramPorFora(nav) {
  console.log('\n5. Outra aba (ou outra cópia do arquivo) gravou: esta aba nunca grava dados velhos por cima');
  // 5a. versão mais nova gravada por outra aba
  let { contexto, pagina: a, registro } = await abrirCom(nav, '2026-12-06', estadoBase({ checkins: vencidos('2026-12-01', 5) }));
  await passarMensagem(a);
  const b = await contexto.newPage();
  await b.goto(A.url('2026-12-06')); await pronto(b);
  const novo = JSON.stringify({ app: 'jornada60', versao: 2, perfil: { nome: 'Davi', inicio: '2026-12-01' }, checkins: { '2026-12-06': 'v' }, campoNovo: true });
  await b.evaluate(([k, v]) => localStorage.setItem(k, v), [CHAVE, novo]);
  await a.waitForSelector('.falha', { timeout: 5000 }).catch(() => {});
  confere(await a.isVisible('.falha') && (await txt(a, '.falha')).includes('versão mais nova') && !(await a.isVisible('#b-sos')), 'dados de formato mais novo gravados por outra aba: esta aba para e mostra o aviso');
  await a.evaluate(() => window.dispatchEvent(new Event('focus')));
  if (await a.isVisible('#b-venci')) await a.click('#b-venci');
  await a.waitForTimeout(300);
  confere((await guardado(a)) === novo, 'e não grava mais nada por cima (o formato novo fica intacto)');
  confere(registro.erros.length === 0, 'sem erro de script', registro.erros);
  await contexto.close();

  // 5b. a aba não recebeu o aviso (estava dormindo): confere antes de agir
  ({ contexto, pagina: a, registro } = await abrirCom(nav, '2026-12-06', estadoBase({ checkins: vencidos('2026-12-01', 5) })));
  await passarMensagem(a);
  const deFora = estadoBase({ checkins: Object.assign(vencidos('2026-12-01', 5), { '2026-12-06': 'r' }), tentacoesVencidas: 7 });
  deFora.mensagens = JSON.parse(await guardado(a)).mensagens;
  await a.evaluate(([k, v]) => localStorage.setItem(k, v), [CHAVE, JSON.stringify(deFora)]);     // gravado "por fora", sem aviso para esta aba
  await a.click('#b-venci');
  await a.waitForTimeout(500);
  let e = JSON.parse(await guardado(a));
  confere(e.checkins['2026-12-06'] === 'r' && e.tentacoesVencidas === 7, 'tocar em “Venci hoje” com dados desatualizados não grava por cima do que a outra aba fez', e.checkins['2026-12-06']);
  confere((await txt(a, '#avisos')).includes('mudaram em outra aba') && (await txt(a, '#checkin')).includes('Recaída registrada hoje'), 'a tela é atualizada e avisa');
  // 5c. ao voltar para a aba, ela se atualiza sozinha
  deFora.tentacoesVencidas = 9;
  await a.evaluate(([k, v]) => localStorage.setItem(k, v), [CHAVE, JSON.stringify(deFora)]);
  await a.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await a.waitForTimeout(300);
  confere((await A.estado(a)).tentacoesVencidas === 9, 'ao voltar para a aba, ela adota o que foi gravado por fora');
  confere(registro.erros.length === 0, 'sem erro de script', registro.erros);
  await contexto.close();

  // 5d. duas abas: a que só acompanha não grava em resposta (a celebração da outra não fecha sozinha)
  const comPendencia = estadoBase({ checkins: vencidos('2026-12-01', 1), recompensas: [{ id: 'a', dia: 3, nome: 'Livro', emoji: '📚' }] });
  ({ contexto, pagina: a, registro } = await abrirCom(nav, '2026-12-04', comPendencia));
  const outra = await abrirCom(nav, '2026-12-04', null, null, contexto);
  await a.waitForSelector('#pend-salvar'); await outra.pagina.waitForSelector('#pend-salvar');
  await a.click('[data-acao="pend-todos"][data-v="v"]');
  await a.click('#pend-salvar');
  await a.waitForSelector('dialog .festa');
  await outra.pagina.waitForSelector('#b-continuar');           // a outra aba acompanhou (já sem pendências)
  await a.waitForTimeout(700);
  confere(await a.isVisible('dialog .festa'), 'com outra aba aberta, a celebração não fecha sozinha');
  confere(!(await txt(a, '#avisos')).includes('mudaram em outra aba'), 'e não aparece “os dados mudaram em outra aba” para uma mudança que foi desta aba');
  e = JSON.parse(await guardado(a));
  confere(!e.mensagens.dia || e.mensagens.dia.data !== '2026-12-04', 'a aba que só acompanha não gravou nada em resposta');
  if (await a.isVisible('#b-festa-ok')) await a.click('#b-festa-ok');
  await a.waitForSelector('#b-continuar');
  confere((await txt(a, '#msg-dia')) === 'Dia 4 de 60', 'e o fluxo segue normalmente na aba em uso');
  confere(registro.erros.length === 0 && outra.registro.erros.length === 0, 'sem erro de script nas duas abas', [registro.erros, outra.registro.erros]);
  await contexto.close();

  // 5d-2. a celebração está aberta em uma aba e a OUTRA aba grava: fechar a celebração não pode gravar dados velhos
  ({ contexto, pagina: a, registro } = await abrirCom(nav, '2026-12-04', comPendencia));
  const b2 = (await abrirCom(nav, '2026-12-04', null, null, contexto)).pagina;
  await a.waitForSelector('#pend-salvar'); await b2.waitForSelector('#pend-salvar');
  await a.click('[data-acao="pend-todos"][data-v="v"]');
  await a.click('#pend-salvar');
  await a.waitForSelector('dialog .festa');                     // A está na celebração (ainda sem mensagem do dia)
  await b2.waitForSelector('#b-continuar');                     // B acompanhou e está na mensagem do dia
  await b2.click('#b-continuar'); await b2.waitForSelector('#checkin');      // B grava: mensagem vista
  const textoDeB = await guardado(b2);
  await a.waitForSelector('#checkin', { timeout: 5000 }).catch(() => {});
  await a.waitForTimeout(600);
  e = JSON.parse(await guardado(a));
  confere((await guardado(a)) === textoDeB && e.mensagens.dia.vista === true, 'a aba que estava na celebração adota o que a outra gravou, sem regravar o que tinha na memória', e.mensagens.dia);
  confere(await b2.isVisible('#checkin') && !(await b2.isVisible('#b-continuar')), 'e a outra aba continua onde estava (não volta para a mensagem do dia)');
  confere(await a.isVisible('#checkin') && (await txt(a, '#avisos')).includes('mudaram em outra aba') && (await A.contas(a)).seqAtual === 3, 'a primeira aba passa para a tela inicial, com os 3 dias vencidos, e avisa');
  await contexto.close();

  // 5d-3. o mesmo, fechando a celebração pelo teclado (Esc) sem que a aba tenha sido avisada da mudança
  ({ contexto, pagina: a, registro } = await abrirCom(nav, '2026-12-04', comPendencia));
  await a.waitForSelector('#pend-salvar');
  await a.click('[data-acao="pend-todos"][data-v="v"]');
  await a.click('#pend-salvar');
  await a.waitForSelector('dialog .festa');
  const mudado = JSON.parse(await guardado(a));
  mudado.tentacoesVencidas = 5;                                  // o que outra aba teria gravado nesse meio-tempo
  await a.evaluate(([k, v]) => localStorage.setItem(k, v), [CHAVE, JSON.stringify(mudado)]);
  await a.waitForTimeout(450);                                   // a janela já aceita toques e teclas
  await a.keyboard.press('Escape');
  await a.waitForSelector('dialog', { state: 'detached' });
  await a.waitForTimeout(300);
  e = JSON.parse(await guardado(a));
  confere(e.tentacoesVencidas === 5 && (await A.estado(a)).tentacoesVencidas === 5, 'fechar a celebração com Esc não grava por cima do que mudou por fora', e.tentacoesVencidas);
  confere(registro.erros.length === 0, 'sem erro de script', registro.erros);
  await contexto.close();

  // 5e. modo de teste com datas diferentes em duas abas (cada uma quer a mensagem do "seu" dia): sem laço de gravações
  ({ contexto, pagina: a, registro } = await A.novaPagina(nav));
  await contexto.addInitScript((k) => {       // só conta as gravações; não encosta no armazenamento
    window.__gravacoes = 0;
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (chave) { if (chave === k) window.__gravacoes++; return original.apply(this, arguments); };
  }, CHAVE);
  await porEstado(a, A.url('2026-12-10'), estadoBase({ checkins: vencidos('2026-12-01', 10) }));
  await a.goto(A.url('2026-12-10')); await pronto(a); await a.waitForSelector('#titulo');
  const c = await contexto.newPage(); await c.goto(A.url('2026-12-11')); await pronto(c); await c.waitForSelector('#titulo');
  const gravacoes = async () => (await a.evaluate(() => window.__gravacoes)) + (await c.evaluate(() => window.__gravacoes));
  await a.waitForTimeout(1500);
  const antes = await gravacoes();
  await a.waitForTimeout(2500);
  const total = await gravacoes();
  confere(total === antes && total <= 4, 'duas abas de teste com datas diferentes não ficam gravando sem parar (' + total + ' gravações ao todo, nenhuma nos últimos 2,5 s)', { antes, total });
  confere((await a.locator('#avisos .aviso').count()) <= 1 && registro.erros.length === 0, 'nem empilham avisos');
  await contexto.close();

  // 5f. se a gravação falhou, vale a memória desta aba (não troca pelo que está guardado, que é mais velho)
  ({ contexto, pagina: a, registro } = await abrirCom(nav, '2026-12-06', estadoBase({ checkins: vencidos('2026-12-01', 5) })));
  await passarMensagem(a);
  await a.evaluate(() => { window.__gravar = Storage.prototype.setItem; Storage.prototype.setItem = function () { throw new DOMException('cheio', 'QuotaExceededError'); }; });
  await a.click('#b-venci'); await a.waitForSelector('#b-corrigir-hoje');
  // nesse meio-tempo, outra aba consegue gravar uma versão sem o check-in de hoje
  await a.evaluate(([k, v]) => window.__gravar.call(localStorage, k, v), [CHAVE, JSON.stringify(estadoBase({ checkins: vencidos('2026-12-01', 5), tentacoesVencidas: 3 }))]);
  await a.evaluate(() => window.dispatchEvent(new Event('focus')));
  await a.click('#b-missao');
  await a.waitForTimeout(200);
  confere((await A.estado(a)).checkins['2026-12-06'] === 'v' && (await txt(a, '.faixa.atencao')).includes('não está deixando guardar'), 'quando o navegador recusa gravar, o que foi feito continua na tela (para dar tempo de fazer o backup)');
  await contexto.close();
}

async function backupAdulteradoEBancoQuebrado(nav) {
  console.log('\n6. Backup adulterado e banco de mensagens quebrado por um dia');
  let { contexto, pagina: p, registro } = await abrirCom(nav, '2026-12-06', null);
  await p.click('text=Já tenho um backup');
  for (const nome of ['constructor', 'hasOwnProperty', 'isPrototypeOf', '__proto__', 'toString']) {
    const ruim = estadoBase({ checkins: vencidos('2026-12-01', 5) });
    ruim.mensagens = { vistas: { [nome]: ['x'], fase1: ['y'] }, dia: { data: '2026-12-06', conjunto: nome, id: 'abc', vista: true } };
    await p.fill('#i-texto', JSON.stringify(ruim));
    await p.click('#i-restaurar');
    await p.waitForTimeout(250);
    if (await temBotao(p, 'Substituir pelo backup')) await naJanela(p, 'Substituir pelo backup');
    await p.waitForSelector('#checkin, #b-continuar');
    await passarMensagem(p);
    await p.click('#b-ajustes'); await p.click('#a-importar');
  }
  await p.keyboard.press('Escape'); await p.keyboard.press('Escape');
  await p.reload(); await pronto(p);
  await passarMensagem(p);
  confere(registro.erros.length === 0 && await p.isVisible('#checkin'), 'backup com nomes de conjunto “estranhos” não derruba o app, nem ao reabrir', registro.erros);
  const ids = await p.evaluate(() => window.__j60.banco().fase1.slice(0, 10).map((x) => x.id));
  await contexto.close();

  const html = fs.readFileSync(A.ARQUIVO, 'utf8');
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'j60-'));
  const quebrado = path.join(pasta, 'index.html');
  fs.writeFileSync(quebrado, html.replace('ref: "Deuteronômio 30:19",', 'ref: "Deuteronômio 30:19"'));
  const est = estadoBase({ checkins: vencidos('2026-12-01', 3) });
  est.mensagens = { vistas: { fase1: ids }, dia: null };
  ({ contexto, pagina: p, registro } = await A.novaPagina(nav));
  await porEstado(p, 'file://' + quebrado + '?hoje=2026-12-04', est);
  await p.goto('file://' + quebrado + '?hoje=2026-12-04'); await pronto(p);
  await p.waitForSelector('#b-continuar');
  confere((await txt(p, '.versiculo cite')) === 'Filipenses 4:13', 'com o banco quebrado, aparece a mensagem de reserva');
  await p.click('#b-continuar'); await p.click('#b-venci'); await p.waitForSelector('#b-corrigir-hoje');
  const depois = JSON.parse(await guardado(p));
  confere(JSON.stringify(depois.mensagens.vistas.fase1) === JSON.stringify(ids), 'um dia com o banco quebrado não apaga a lista de mensagens que já apareceram', depois.mensagens.vistas.fase1);
  await contexto.close();
  fs.unlinkSync(quebrado);
  fs.rmdirSync(pasta);
}

async function conferenciaDeSalvamento(nav) {
  console.log('\n7. “Este navegador está guardando o seu progresso”: recarregar a aba não conta');
  const { contexto, pagina: p, registro } = await A.novaPagina(nav);
  await p.goto(A.url('2026-12-01')); await pronto(p);
  await A.configurar(p, { nome: 'Davi' });
  await p.waitForSelector('#b-continuar'); await p.click('#b-continuar'); await p.waitForSelector('#checkin');
  confere((await txt(p, '#dica-salvar')).includes('feche o navegador'), 'o convite pede para fechar o navegador e abrir de novo');
  await p.reload(); await pronto(p);
  confere(await p.isVisible('#dica-salvar') && (await A.estado(p)).salvamentoConferido === false, 'só recarregar a aba não confirma nada');
  await p.goto(A.url('2026-12-01')); await pronto(p);
  confere(!(await p.isVisible('#dica-salvar')) && (await A.estado(p)).salvamentoConferido === true, 'abrir o app de novo e achar os dados confirma');
  confere(registro.erros.length === 0 && registro.console.length === 0, 'sem erros no console', registro);
  await contexto.close();
}

async function gravarEReabrir(nav) {
  console.log('\n8. Gravar e reabrir a página, 30 vezes seguidas (recarregar, abrir o mesmo endereço, aba nova)');
  const { contexto, pagina, registro } = await A.novaPagina(nav);
  let p = pagina;
  await p.goto(A.url('2026-12-01')); await pronto(p);
  await A.configurar(p, { nome: 'Davi' });
  await p.waitForSelector('#b-continuar'); await p.click('#b-continuar'); await p.waitForSelector('#checkin');
  await p.click('#b-venci'); await p.waitForSelector('#b-corrigir-hoje');
  // o app marca sozinho “salvamento conferido” na primeira reabertura: fora isso, tem de voltar igual
  const semMarca = (s) => { const o = JSON.parse(s); delete o.salvamentoConferido; return JSON.stringify(o); };
  const ruins = [];
  for (let i = 0; i < 30; i++) {
    await p.click('#b-missao');                       // uma gravação de verdade, feita pelo app
    const esperado = await guardado(p);
    const jeito = ['recarregar', 'mesmo endereço', 'aba nova'][i % 3];
    if (jeito === 'recarregar') await p.reload();
    else if (jeito === 'mesmo endereço') await p.goto(A.url('2026-12-01'));
    else {
      const nova = await contexto.newPage();
      nova.on('pageerror', (e) => registro.erros.push(String(e)));
      await p.close(); p = nova;
      await p.goto(A.url('2026-12-01'));
    }
    await pronto(p);
    const achado = await guardado(p);
    if (achado === null || semMarca(achado) !== semMarca(esperado) || !(await p.isVisible('#b-corrigir-hoje'))) ruins.push(i + ' (' + jeito + ')');
  }
  confere(ruins.length === 0, 'nas 30 vezes o app abriu com exatamente o que tinha gravado', ruins);
  confere((await A.estado(p)).checkins['2026-12-01'] === 'v' && (await A.contas(p)).seqAtual === 1, 'e o check-in do dia continua lá');
  confere(registro.erros.length === 0, 'sem erro de script', registro.erros);
  await contexto.close();
}

async function duasAbasAlternando(nav) {
  console.log('\n9. Duas abas de verdade, uma ação de cada vez: nada do que uma fez se perde na outra');
  const { contexto, pagina: a, registro } = await abrirCom(nav, '2026-12-06', estadoBase({ checkins: vencidos('2026-12-01', 5) }));
  await passarMensagem(a);
  const outra = await abrirCom(nav, '2026-12-06', null, null, contexto);
  const b = outra.pagina;
  await b.waitForSelector('#checkin');
  const HOJE = '2026-12-06';
  // espera as duas abas ficarem com os mesmos dados que estão guardados e devolve esses dados
  const resumo = (o) => JSON.stringify({ n: o.perfil.nome, ck: o.checkins, r: o.recompensas.map((x) => x.nome + '@' + x.dia + (x.resgatadaEm ? '!' : '')), t: o.tentacoesVencidas });
  const assentar = async () => {
    let g = null;
    for (let i = 0; i < 20; i++) {
      await a.waitForTimeout(100);
      g = JSON.parse(await guardado(a));
      if (resumo(await A.estado(a)) === resumo(g) && resumo(await A.estado(b)) === resumo(g)) return g;
    }
    return null;
  };
  const novaRecompensa = async (p, dia, nome) => {
    await p.click('#b-premio-novo');
    await p.fill('#p-dia', String(dia)); await p.fill('#p-nome', nome);
    await p.click('#p-salvar'); await semJanela(p);
  };
  const venceuTentacao = async (p) => {
    await p.click('#b-sos');
    for (let i = 1; i < 6; i++) await p.click(i === 2 ? '#sos-pular' : '#sos-proximo');
    await p.click('#sos-venci'); await p.click('#sos-fim'); await semJanela(p);
  };

  await novaRecompensa(a, 10, 'R1');
  let g = await assentar();
  confere(!!g && g.recompensas.length === 1 && await b.isVisible('text=R1'), 'A cadastra uma recompensa → B mostra a recompensa');
  await novaRecompensa(b, 20, 'R2');
  g = await assentar();
  confere(!!g && g.recompensas.map((x) => x.nome).sort().join() === 'R1,R2', 'B cadastra outra → as duas estão guardadas (a de A não sumiu)', g && g.recompensas.map((x) => x.nome));
  await a.click('#b-venci'); await a.waitForSelector('#b-corrigir-hoje');
  g = await assentar();
  confere(!!g && g.checkins[HOJE] === 'v' && await b.isVisible('#b-corrigir-hoje') && (await A.contas(b)).seqAtual === 6, 'A marca “Venci hoje” → B mostra o dia vencido e a sequência 6');
  await b.click('#b-corrigir-hoje'); await naJanela(b, 'Tirar a marcação'); await semJanela(b);
  g = await assentar();
  confere(!!g && !g.checkins[HOJE] && g.recompensas.length === 2 && await a.isVisible('#b-venci'), 'B tira a marcação → A volta a oferecer o check-in; as recompensas continuam');
  await venceuTentacao(a);
  g = await assentar();
  confere(!!g && g.tentacoesVencidas === 1 && (await A.estado(b)).tentacoesVencidas === 1, 'A vence uma tentação → o contador aparece em B');
  await novaRecompensa(b, 30, 'R3');
  await venceuTentacao(b);
  g = await assentar();
  confere(!!g && g.recompensas.length === 3 && g.tentacoesVencidas === 2 && !g.checkins[HOJE], 'B cadastra mais uma e vence outra tentação → 3 recompensas, contador 2, nada perdido', g && { r: g.recompensas.length, t: g.tentacoesVencidas });
  await a.click('#b-venci'); await a.waitForSelector('#b-corrigir-hoje');
  await assentar();
  await b.click('#b-ajustes'); await b.fill('#a-nome', 'Davi Dois'); await b.click('#a-salvar'); await semJanela(b);
  g = await assentar();
  confere(!!g && g.perfil.nome === 'Davi Dois' && g.checkins[HOJE] === 'v' && g.recompensas.length === 3 && g.tentacoesVencidas === 2 && Object.keys(g.checkins).length === 6,
    'A marca o dia e B troca o nome nos ajustes → o guardado tem tudo: nome novo, 6 dias vencidos, 3 recompensas, contador 2', g && { n: g.perfil.nome, ck: Object.keys(g.checkins).length, r: g.recompensas.length, t: g.tentacoesVencidas });
  confere((await txt(a, '.saudacao')).includes('Davi Dois'), 'e a tela de A já mostra o nome novo');
  confere(registro.erros.length === 0 && outra.registro.erros.length === 0, 'sem erro de script nas duas abas', [registro.erros, outra.registro.erros]);
  await contexto.close();
}

(async () => {
  const grupos = [confirmacaoNaVirada, toqueDuplo, tirarAMarcacao, restaurarNaTelaDeErro, dadosMudaramPorFora, backupAdulteradoEBancoQuebrado, conferenciaDeSalvamento, gravarEReabrir, duasAbasAlternando];
  const so = Number(process.argv[2]) || 0;
  const nav = await A.novoNavegador();
  try {
    for (let i = 0; i < grupos.length; i++) {
      if (so && so !== i + 1) continue;
      // um grupo que para no meio (botão que não existe, espera que estoura) conta como falha, e os outros rodam mesmo assim
      try { await grupos[i](nav); }
      catch (erro) { confere(false, 'o grupo ' + (i + 1) + ' parou no meio', String((erro && erro.message) || erro).split('\n')[0]); }
    }
  } finally {
    await nav.close();
  }
  process.exit(A.resumo() ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
