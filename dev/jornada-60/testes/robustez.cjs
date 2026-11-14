// Robustez do Jornada 60: relógio de verdade (fuso de São Paulo, à noite), dados estragados,
// navegador que não deixa salvar, só teclado, telas pequenas, textos compridos e duas abas.
// Uso: node dev/jornada-60/testes/robustez.cjs
const fs = require('fs');
const A = require('./apoio.cjs');
const { confere } = A;
const txt = async (p, sel) => ((await p.locator(sel).last().innerText()) || '').replace(/\s+/g, ' ').trim();
const pronto = (p) => p.waitForFunction(() => window.JORNADA60_OK === true);
const guardado = (p, chave) => p.evaluate((k) => { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; }, chave || 'jornada60');
const semJanela = (p) => p.waitForSelector('dialog', { state: 'detached' });

async function relogioDeVerdade(nav) {
  console.log('\n1. “Hoje” pelo relógio local: 23h30 em São Paulo (no horário universal já é o dia seguinte)');
  const { contexto, pagina: p, registro } = await A.novaPagina(nav, { fuso: 'America/Sao_Paulo' });
  await p.clock.install({ time: new Date('2026-12-02T02:30:00Z') });     // 01/12/2026 às 23:30 em São Paulo
  await p.goto(A.url(null)); await pronto(p);
  confere(!(await p.isVisible('.faixa.teste')), 'aberto sem o modo de teste (dados de verdade)');
  await p.click('#g-comecar');
  await p.fill('#g-nome', 'Davi'); await p.click('#g-proximo'); await p.click('#g-proximo');
  confere(await p.inputValue('#g-inicio') === '2026-12-01', 'às 23h30 de 01/12 em São Paulo, hoje é 01/12 (e não 02/12)', await p.inputValue('#g-inicio'));
  await p.click('#g-proximo');
  await p.fill('#g-motivo-0', 'Minha família'); await p.click('#g-proximo'); await p.click('#g-proximo'); await p.click('#g-proximo');
  await p.waitForSelector('#b-continuar');
  confere((await txt(p, '#titulo')) === 'Boa noite, Davi.', 'saudação da noite');
  await p.click('#b-continuar'); await p.click('#b-venci'); await p.waitForSelector('#b-corrigir-hoje');
  let e = await guardado(p);
  confere(e.checkins['2026-12-01'] === 'v' && Object.keys(e.checkins).length === 1 && e.perfil.inicio === '2026-12-01', 'o check-in das 23h30 fica no dia 01/12');

  console.log('\n2. Virada da meia-noite com o app aberto (relógio de verdade)');
  await p.clock.setSystemTime(new Date('2026-12-02T03:10:00Z'));          // 02/12 às 00:10 em São Paulo; nenhum temporizador dispara
  confere(await p.isVisible('#b-corrigir-hoje'), 'antes de voltar ao foco, a tela ainda mostra o dia anterior');
  await p.evaluate(() => window.dispatchEvent(new Event('focus')));
  await p.waitForSelector('#b-continuar');
  confere((await txt(p, '#msg-dia')) === 'Dia 2 de 60', 'ao voltar ao foco depois da meia-noite, o app mostra o novo dia');
  await p.click('#b-continuar'); await p.waitForSelector('#b-venci');
  confere((await txt(p, '#num-seq')) === '1' && await p.isVisible('#b-venci'), 'sequência 1 e check-in do novo dia liberado');
  await p.click('#b-venci'); await p.waitForSelector('#b-corrigir-hoje');
  e = await guardado(p);
  confere(e.checkins['2026-12-02'] === 'v', 'o check-in de 00h10 fica no dia 02/12');
  // sem evento de foco: a conferência periódica percebe sozinha
  await p.clock.setSystemTime(new Date('2026-12-03T03:05:00Z'));
  await p.clock.runFor(31000);
  await p.waitForSelector('#b-continuar');
  confere((await txt(p, '#msg-dia')) === 'Dia 3 de 60', 'mesmo sem trocar de aba, o app percebe a virada em até meio minuto');
  // saudações
  await p.clock.setSystemTime(new Date('2026-12-03T11:00:00Z'));          // 08:00
  await p.reload(); await pronto(p);
  confere((await txt(p, '#titulo')) === 'Bom dia, Davi.', 'saudação da manhã');
  await p.clock.setSystemTime(new Date('2026-12-03T17:00:00Z'));          // 14:00
  await p.reload(); await pronto(p);
  confere((await txt(p, '#titulo')) === 'Boa tarde, Davi.', 'saudação da tarde');
  confere(registro.erros.length === 0 && registro.console.length === 0 && registro.rede.length === 0, 'sem erros, avisos ou rede', registro);
  await contexto.close();

  // outros fusos, para garantir que a conta é sempre pela data local
  for (const [fuso, instante, esperado] of [['Asia/Tokyo', '2026-12-01T16:00:00Z', '2026-12-02'], ['Pacific/Honolulu', '2026-12-02T08:00:00Z', '2026-12-01'], ['America/Sao_Paulo', '2026-12-02T02:59:59Z', '2026-12-01'], ['America/Sao_Paulo', '2026-12-02T03:00:00Z', '2026-12-02']]) {
    const x = await A.novaPagina(nav, { fuso });
    await x.pagina.clock.install({ time: new Date(instante) });
    await x.pagina.goto(A.url('2026-01-01')); await pronto(x.pagina);
    const obtido = await x.pagina.evaluate(() => window.__j60.util.hojeReal());
    confere(obtido === esperado, fuso + ' em ' + instante + ' → hoje é ' + esperado, obtido);
    await x.contexto.close();
  }
}

async function dadosEstragados(nav) {
  console.log('\n3. Dados guardados que não dá para ler: nada é apagado sem a pessoa decidir');
  const { contexto, pagina: p, registro } = await A.novaPagina(nav);
  await p.goto(A.url('2026-12-01')); await pronto(p);
  for (const [nome, valor, trecho] of [['texto quebrado', '{{{ isto não é json', 'não conseguiu ler'], ['outro programa', '{"a":1}', 'não conseguiu ler'], ['versão mais nova', JSON.stringify({ app: 'jornada60', versao: 99, perfil: { nome: 'X', inicio: '2026-11-01' } }), 'versão mais nova']]) {
    await p.evaluate((v) => localStorage.setItem('jornada60:teste', v), valor);
    await p.reload(); await pronto(p);
    confere((await txt(p, '.falha')).includes('Não consegui abrir os seus dados') && (await txt(p, '.falha')).includes(trecho), nome + ': tela de aviso em vez de começar do zero');
    confere((await p.evaluate(() => localStorage.getItem('jornada60:teste'))) === valor, nome + ': o que estava guardado continua intacto');
    confere(!(await p.isVisible('#b-sos')), nome + ': sem botões que gravem por cima');
  }
  const [download] = await Promise.all([p.waitForEvent('download'), p.click('[data-acao="baixar-bruto"]')]);
  confere(fs.readFileSync(await download.path(), 'utf8').includes('"versao":99'), 'dá para baixar uma cópia dos dados como estão');
  await p.click('[data-acao="zerar-erro"]');
  await p.locator('dialog').last().getByRole('button', { name: 'Cancelar', exact: true }).click();
  confere((await p.evaluate(() => localStorage.getItem('jornada60:teste'))).includes('"versao":99'), '“Começar do zero” pede confirmação');
  await p.click('[data-acao="zerar-erro"]');
  const [antesDeZerar] = await Promise.all([p.waitForEvent('download'), p.locator('dialog').last().getByRole('button', { name: 'Apagar e começar', exact: true }).click()]);
  await p.waitForSelector('#g-comecar');
  confere(fs.readFileSync(await antesDeZerar.path(), 'utf8').includes('"versao":99'), 'ao zerar, o app baixa antes uma cópia do que havia');
  confere((await guardado(p, 'jornada60:teste')).versao === 1, 'depois de confirmar, começa do zero');
  // restaurar um backup direto da tela de aviso
  await p.evaluate(() => localStorage.setItem('jornada60:teste', 'lixo'));
  await p.reload(); await pronto(p);
  await p.click('[data-acao="importar"]');
  await p.fill('#i-texto', JSON.stringify({ app: 'jornada60', versao: 1, perfil: { nome: 'Rute', inicio: '2026-11-30', motivos: ['m'] }, checkins: { '2026-11-30': 'v' } }));
  await p.click('#i-restaurar');
  // como há dados guardados que o app não abriu, ele pergunta antes e baixa uma cópia deles
  const [copiaDoLixo] = await Promise.all([p.waitForEvent('download'), p.locator('dialog').last().getByRole('button', { name: 'Restaurar o backup', exact: true }).click()]);
  await p.waitForSelector('#b-continuar');
  confere(fs.readFileSync(await copiaDoLixo.path(), 'utf8') === 'lixo', 'antes de restaurar por cima de dados ilegíveis, o app baixa uma cópia deles');
  confere((await txt(p, '#msg-dia')) === 'Dia 2 de 60' && (await guardado(p, 'jornada60:teste')).perfil.nome === 'Rute', 'da tela de aviso dá para restaurar um backup');

  console.log('\n4. Dados esquisitos (backup editado à mão): o app conserta o que dá e não quebra');
  const r = await p.evaluate(() => {
    const u = window.__j60.util; let s = 12345;
    const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
    const lixos = [null, undefined, 0, -1, 1e21, NaN, '', 'x', '2026-13-45', '2026-12-01', [], {}, [null], { a: 1 }, true, '<img src=x onerror=1>', 'javascript:alert(1)', ['a', 'b'], { dia: 3, nome: 'ok' }, { dia: 99, nome: '' }];
    const lixo = () => lixos[Math.floor(rnd() * lixos.length)];
    const campos = ['app', 'versao', 'criadoEm', 'perfil', 'rascunho', 'recompensas', 'checkins', 'saidas', 'tentacoesVencidas', 'mensagens', 'backup', 'finalVistoEm'];
    let erros = [];
    for (let i = 0; i < 3000; i++) {
      const o = { app: 'jornada60', versao: 1 };
      campos.forEach((c) => { if (rnd() < 0.7) o[c] = lixo(); });
      if (rnd() < 0.6) o.perfil = { nome: lixo(), compromisso: lixo(), inicio: rnd() < 0.7 ? '2026-11-0' + (1 + Math.floor(rnd() * 9)) : lixo(), motivos: lixo(), confianca: lixo() };
      if (rnd() < 0.5) o.recompensas = [lixo(), { id: lixo(), dia: rnd() < 0.5 ? 3 : lixo(), nome: rnd() < 0.5 ? 'R' : lixo(), link: lixo(), preco: lixo(), emoji: lixo(), liberadaEm: lixo(), resgatadaEm: lixo() }];
      if (rnd() < 0.5) o.checkins = { '2026-11-02': rnd() < 0.5 ? 'v' : lixo(), 'bobagem': 'v', '2026-11-03': lixo() };
      if (rnd() < 0.5) o.mensagens = { vistas: rnd() < 0.5 ? { fase1: [lixo(), 'abc'] } : lixo(), dia: rnd() < 0.5 ? { data: '2026-12-01', conjunto: lixo(), id: lixo() } : lixo() };
      try {
        const e = u.normalizar(o);
        if (e.perfil) u.calcular(e, '2026-12-01');
        const ok = e.app === 'jornada60' && e.versao === 1 && Array.isArray(e.recompensas) && Array.isArray(e.saidas) && typeof e.checkins === 'object' &&
          e.recompensas.every((x) => Number.isInteger(x.dia) && x.dia >= 1 && x.dia <= 60 && x.nome && (x.link === '' || /^https?:\/\//.test(x.link))) &&
          Object.keys(e.checkins).every((k) => /^\d{4}-\d{2}-\d{2}$/.test(k) && (e.checkins[k] === 'v' || e.checkins[k] === 'r')) &&
          (!e.perfil || (typeof e.perfil.nome === 'string' && e.perfil.nome && Array.isArray(e.perfil.motivos)));
        if (!ok) erros.push(JSON.stringify(o).slice(0, 200));
      } catch (err) { erros.push(String(err) + ' ' + JSON.stringify(o).slice(0, 200)); }
    }
    return erros.slice(0, 3);
  });
  confere(r.length === 0, '3.000 conjuntos de dados embaralhados: sempre viram dados válidos, sem erro', r);
  // e a tela aguenta desenhar um desses
  await p.evaluate(() => window.__j60.definirEstado({ app: 'jornada60', versao: 1, perfil: { nome: '<img src=x onerror="window.__xss=1">', inicio: '2026-11-25', motivos: ['<script>window.__xss=1<\/script>', 5, null] },
    recompensas: [{ dia: 2, nome: '<b onmouseover="window.__xss=1">forte</b>', link: 'javascript:window.__xss=1', emoji: '<i>' }, { dia: 99, nome: 'fora' }, 'lixo'],
    checkins: { '2026-11-25': 'v', '2026-11-26': 'v', '2026-11-27': 'r', '2026-11-28': 'v', '2026-11-29': 'v', '2026-11-30': 'v', 'x': 'v' }, saidas: ['<img src=x onerror="window.__xss=1">'], tentacoesVencidas: 'muitas' }));
  await p.waitForSelector('#b-continuar');
  await p.click('#b-continuar'); await p.waitForSelector('#checkin');
  await p.click('#b-historico'); await p.keyboard.press('Escape'); await semJanela(p);
  await p.click('#b-ajustes'); await p.keyboard.press('Escape'); await semJanela(p);
  await p.click('#b-sos'); for (let i = 0; i < 5; i++) await p.click(i === 1 ? '#sos-pular' : '#sos-proximo'); await p.keyboard.press('Escape'); await semJanela(p);
  const seguro = await p.evaluate(() => ({ xss: window.__xss, imgs: document.querySelectorAll('#app img, dialog img, #app script').length, links: [...document.querySelectorAll('a[href]')].map((a) => a.getAttribute('href')).filter((h) => /^javascript:/i.test(h)).length }));
  confere(seguro.xss === undefined && seguro.imgs === 0 && seguro.links === 0, 'texto com código HTML aparece como texto: nada é executado', seguro);
  confere((await txt(p, '#titulo')).includes('<img src=x'), 'o nome esquisito aparece literalmente na tela');
  const e = await guardado(p, 'jornada60:teste');
  confere(e.recompensas.length === 1 && e.recompensas[0].link === '' && e.tentacoesVencidas === 0 && Object.keys(e.checkins).length === 6, 'itens inválidos do backup são descartados (recompensa fora de 1–60, link perigoso, data inválida)');
  confere(registro.erros.length === 0 && registro.console.length === 0 && registro.rede.length === 0, 'sem erros, avisos ou rede', registro);
  await contexto.close();
}

async function semArmazenamento(nav) {
  console.log('\n5. Navegador que não deixa guardar dados');
  for (const [nome, script] of [
    ['gravação recusada', () => { Storage.prototype.setItem = function () { throw new DOMException('cheio', 'QuotaExceededError'); }; }],
    ['acesso bloqueado', () => { Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('bloqueado', 'SecurityError'); } }); }],
  ]) {
    const { contexto, pagina: p, registro } = await A.novaPagina(nav);
    await contexto.addInitScript(script);
    await p.goto(A.url('2026-12-01')); await pronto(p);
    await A.configurar(p, { nome: 'Davi' });
    await p.waitForSelector('#b-continuar'); await p.click('#b-continuar');
    confere((await txt(p, '.faixa.atencao')).includes('não está deixando guardar'), nome + ': o app avisa com clareza e oferece o backup');
    await p.click('#b-venci'); await p.waitForSelector('#b-corrigir-hoje');
    confere((await txt(p, '#num-seq')) === '1', nome + ': o app continua funcionando enquanto está aberto');
    const [download] = await Promise.all([p.waitForEvent('download'), p.click('.faixa.atencao [data-acao="exportar"]')]);
    confere(JSON.parse(fs.readFileSync(await download.path(), 'utf8')).checkins['2026-12-01'] === 'v', nome + ': dá para salvar o progresso em um arquivo de backup');
    confere(registro.erros.length === 0, nome + ': sem erro de script', registro.erros);
    await contexto.close();
  }
}

async function teclado(nav) {
  console.log('\n6. Só com o teclado');
  const { contexto, pagina: p, registro } = await A.novaPagina(nav, { viewport: { width: 1280, height: 800 } });
  await p.goto(A.url('2026-12-01')); await pronto(p);
  const focoEm = () => p.evaluate(() => (document.activeElement && (document.activeElement.id || document.activeElement.tagName)) || '');
  async function tabAte(id, max = 40) { for (let i = 0; i < max; i++) { if ((await focoEm()) === id) return true; await p.keyboard.press('Tab'); } return (await focoEm()) === id; }
  confere(await tabAte('g-comecar'), 'o botão de começar recebe o foco');
  await p.keyboard.press('Enter');
  confere((await focoEm()) === 'g-nome', 'cada passo começa com o foco no campo');
  await p.keyboard.type('Davi'); await p.keyboard.press('Enter');
  await p.keyboard.press('Enter');                       // compromisso em branco
  await p.keyboard.press('Enter');                       // data de hoje
  await p.keyboard.type('Minha família'); await p.keyboard.press('Enter');
  await p.keyboard.press('Enter');                       // sem pessoa de confiança
  confere(await tabAte('g-proximo'), 'no último passo dá para chegar ao botão final com Tab');
  const contorno = await p.evaluate(() => { const s = getComputedStyle(document.activeElement); return { estilo: s.outlineStyle, largura: s.outlineWidth }; });
  confere(contorno.estilo !== 'none' && parseFloat(contorno.largura) >= 2, 'o foco do teclado é bem visível', contorno);
  await p.keyboard.press('Enter');
  await p.waitForSelector('#b-continuar');
  confere(await tabAte('b-continuar'), 'mensagem do dia: “Continuar” alcançável');
  await p.keyboard.press('Enter');
  await p.waitForSelector('#b-venci');
  confere(await tabAte('b-venci'), 'tela inicial: “Venci hoje” alcançável');
  await p.keyboard.press('Space');
  await p.waitForSelector('#b-corrigir-hoje');
  confere((await A.contas(p)).seqAtual === 1, 'check-in feito só com o teclado');
  // janela: o foco fica preso dentro dela e volta para o botão ao fechar
  await p.focus('#b-ajustes'); await p.keyboard.press('Enter');
  await p.waitForSelector('dialog');
  let atras = 0, naJanela = 0;
  for (let i = 0; i < 40; i++) {
    await p.keyboard.press('Tab');
    const onde = await p.evaluate(() => { const a = document.activeElement; return a.closest('dialog') ? 'janela' : (a.closest('#app, #barra') ? 'atras' : 'fora'); });
    if (onde === 'atras') atras++;
    if (onde === 'janela') naJanela++;
  }
  confere(atras === 0 && naJanela >= 30, 'com a janela aberta, o Tab não alcança nada da tela de trás', { atras, naJanela });
  await p.keyboard.press('Escape'); await semJanela(p);
  confere((await focoEm()) === 'b-ajustes', 'Esc fecha a janela e o foco volta para onde estava');
  // botão de tentação e passo a passo pelo teclado
  await p.focus('#b-sos'); await p.keyboard.press('Enter');
  await p.waitForSelector('#sos-proximo');
  confere(await tabAte('sos-proximo', 10), 'passo a passo da tentação navegável por Tab');
  await p.keyboard.press('Escape'); await semJanela(p);
  // dias pendentes: escolher com as setas
  await p.goto(A.url('2026-12-03')); await pronto(p);
  await p.focus('input[name="p-2026-12-02"][value="v"]');
  await p.keyboard.press('Space');
  await p.keyboard.press('ArrowRight');
  confere(await p.isChecked('input[name="p-2026-12-02"][value="r"]'), 'pendentes: as setas trocam entre “Venci” e “Recaí”');
  await p.keyboard.press('ArrowLeft');
  confere(await tabAte('pend-salvar', 10), 'pendentes: “Salvar” alcançável');
  await p.keyboard.press('Enter');
  await p.waitForSelector('#b-continuar');
  confere((await A.contas(p)).seqAtual === 2, 'pendente respondido só com o teclado');
  confere(registro.erros.length === 0 && registro.console.length === 0, 'sem erros no console', registro);
  await contexto.close();
}

async function telasPequenas(nav) {
  console.log('\n7. Telas pequenas e textos compridos (sem rolagem para os lados)');
  const longo = (n, ch) => (ch || 'W').repeat(n);
  for (const largura of [320, 360, 390]) {
    const { contexto, pagina: p, registro } = await A.novaPagina(nav, { viewport: { width: largura, height: 700 } });
    const sobras = [];
    const medir = async (onde) => {
      const m = await p.evaluate(() => {
        const d = [...document.querySelectorAll('dialog[open]')].pop();
        const corpo = d ? d.querySelector('.dlg-corpo') : null;
        return { pagina: document.documentElement.scrollWidth - window.innerWidth, janela: corpo ? corpo.scrollWidth - corpo.clientWidth : 0 };
      });
      if (m.pagina > 0 || m.janela > 0) sobras.push(onde + ' ' + JSON.stringify(m));
    };
    await p.goto(A.url('2026-12-01')); await pronto(p);
    await medir('boas-vindas');
    await p.click('#g-comecar'); await p.fill('#g-nome', longo(40)); await medir('passo 1'); await p.click('#g-proximo');
    await p.fill('#g-compromisso', longo(60, 'M')); await medir('passo 2'); await p.click('#g-proximo');
    await p.fill('#g-inicio', '2026-11-25'); await medir('passo 3'); await p.click('#g-proximo');
    for (let i = 0; i < 5; i++) { if (i) await p.click('#g-motivo-mais'); await p.fill('#g-motivo-' + i, longo(200, 'x')); }
    await medir('passo 4'); await p.click('#g-proximo');
    await p.fill('#g-conf-nome', longo(40)); await p.fill('#g-conf-whats', '(11) 91234-5678'); await medir('passo 5'); await p.click('#g-proximo');
    for (const dia of [2, 3, 9]) {
      await p.click('#g-premio-outro');
      await p.fill('#p-dia', String(dia)); await p.fill('#p-nome', longo(80)); await p.fill('#p-link', 'https://exemplo.com/' + longo(300, 'a')); await p.fill('#p-preco', '12.345.678,90'); await p.fill('#p-emoji', '🏋️‍♂️');
      await medir('formulário de recompensa');
      await p.click('#p-salvar'); await semJanela(p);
    }
    await medir('passo 6'); await p.click('#g-proximo');
    await p.waitForSelector('#pend-salvar'); await medir('pendentes');
    await p.click('[data-acao="pend-todos"][data-v="v"]'); await p.click('#pend-salvar');
    await p.waitForSelector('dialog .festa'); await medir('celebração');
    await p.click('#b-festa-ok');
    await p.waitForSelector('#b-continuar'); await medir('mensagem do dia');
    await p.click('#b-continuar'); await p.waitForSelector('#checkin'); await medir('tela inicial');
    await p.click('#b-historico'); await medir('histórico'); await p.keyboard.press('Escape'); await semJanela(p);
    await p.click('#b-ajustes'); await medir('ajustes');
    await p.click('#a-reiniciar'); await medir('reiniciar'); await p.keyboard.press('Escape'); await p.keyboard.press('Escape'); await semJanela(p);
    await p.click('#b-sos');
    for (let i = 1; i <= 6; i++) { await medir('tentação passo ' + i); if (i === 5) { await p.click('#sos-editar'); await medir('tentação: editar saídas'); } if (i < 6) await p.click(i === 2 ? '#sos-pular' : '#sos-proximo'); }
    await p.click('#sos-venci'); await medir('tentação vencida'); await p.click('#sos-fim'); await semJanela(p);
    await p.click('#b-recai'); await medir('confirmar recaída');
    await p.locator('dialog').last().getByRole('button', { name: 'Registrar recaída', exact: true }).click();
    await p.waitForSelector('#b-graca-ok'); await medir('graça'); await p.click('#b-graca-ok'); await semJanela(p);
    await medir('tela inicial depois da recaída');
    confere(sobras.length === 0, largura + ' px de largura: nada passa da borda, mesmo com nomes e links enormes', sobras);
    // alvos de toque: botões principais com pelo menos 44 px de altura
    const baixos = await p.evaluate(() => [...document.querySelectorAll('#app .btn, #barra .btn, #app .icone-btn')].filter((b) => b.offsetParent && b.getBoundingClientRect().height < 40).map((b) => b.textContent.trim().slice(0, 30)));
    confere(baixos.length === 0, largura + ' px: botões com altura confortável para o dedo', baixos);
    confere(registro.erros.length === 0 && registro.console.length === 0, largura + ' px: sem erros no console', registro);
    await contexto.close();
  }
}

async function duasAbas(nav) {
  console.log('\n8. Duas abas abertas ao mesmo tempo');
  const { contexto, pagina: a, registro } = await A.novaPagina(nav);
  await a.goto(A.url('2026-12-01')); await pronto(a);
  await A.configurar(a, { nome: 'Davi' });
  await a.waitForSelector('#b-continuar'); await a.click('#b-continuar');
  const b = await contexto.newPage();
  const errosB = [];
  b.on('pageerror', (e) => errosB.push(String(e)));
  await b.goto(A.url('2026-12-01')); await pronto(b);
  confere((await txt(b, '#num-seq')) === '0' && await b.isVisible('#b-venci'), 'a segunda aba abre com os mesmos dados');
  await a.click('#b-venci'); await a.waitForSelector('#b-corrigir-hoje');
  await b.waitForFunction(() => document.querySelector('#num-seq') && document.querySelector('#num-seq').textContent === '1');
  confere(!(await b.isVisible('#b-venci')), 'o check-in feito em uma aba aparece na outra, que não deixa marcar de novo');
  await b.click('#b-ajustes'); await b.fill('#a-nome', 'Davi Silva'); await b.click('#a-salvar');
  await a.waitForFunction(() => document.querySelector('#titulo').textContent.includes('Davi Silva'));
  const e = await a.evaluate(() => JSON.parse(localStorage.getItem('jornada60:teste')));
  confere(e.checkins['2026-12-01'] === 'v' && e.perfil.nome === 'Davi Silva', 'uma aba não apaga o que a outra gravou');
  confere(registro.erros.length === 0 && errosB.length === 0, 'sem erros de script nas duas abas', [registro.erros, errosB]);
  await contexto.close();
}

async function movimentoEComputador(nav) {
  console.log('\n9. Confete, “reduzir movimento” e tela de computador');
  const pintado = (p) => p.evaluate(() => { const c = document.getElementById('confete'); if (!c.width) return 0; const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i]) n++; return n; });
  let { contexto, pagina: p, registro } = await A.novaPagina(nav);
  await p.goto(A.url('2026-12-01')); await pronto(p);
  await A.configurar(p, { nome: 'Davi' });
  await p.waitForSelector('#b-continuar'); await p.click('#b-continuar');
  const anima = await p.evaluate(() => getComputedStyle(document.querySelector('.cel.hoje')).animationName);
  await p.click('#b-venci');
  await p.waitForTimeout(250);
  confere((await pintado(p)) > 200, 'confete desenhado em canvas no check-in');
  await p.waitForTimeout(3500);
  confere((await pintado(p)) === 0, 'o confete termina e o canvas fica limpo');
  await contexto.close();

  ({ contexto, pagina: p, registro } = await A.novaPagina(nav, { semMovimento: true }));
  await p.goto(A.url('2026-12-01')); await pronto(p);
  await A.configurar(p, { nome: 'Davi', recompensas: [{ dia: 1, nome: 'Café', emoji: '☕' }] });
  await p.waitForSelector('#b-continuar'); await p.click('#b-continuar');
  const dur = await p.evaluate(() => { const s = getComputedStyle(document.querySelector('.cel.hoje')); return [s.animationDuration, getComputedStyle(document.querySelector('.btn')).transitionDuration]; });
  confere(parseFloat(dur[0]) < 0.01 && parseFloat(dur[1]) < 0.01, 'com “reduzir movimento” ligado no sistema, animações e transições ficam desligadas', dur);
  await p.click('#b-venci');
  await p.waitForSelector('dialog .festa');
  await p.waitForTimeout(250);
  const local = await p.evaluate(() => { const c = document.querySelector('dialog canvas'); const d = c.getContext('2d').getImageData(0, 0, Math.max(1, c.width), Math.max(1, c.height)).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i]) n++; return n; });
  confere(local === 0 && (await pintado(p)) === 0, 'e o confete não é desenhado (a recompensa é liberada do mesmo jeito)');
  confere((await txt(p, 'dialog .festa')).includes('Café'), 'a celebração continua aparecendo, sem movimento');
  confere(registro.erros.length === 0 && registro.console.length === 0, 'sem erros no console', registro);
  await contexto.close();

  ({ contexto, pagina: p, registro } = await A.novaPagina(nav, { viewport: { width: 1280, height: 800 } }));
  await p.goto(A.url('2026-12-01')); await pronto(p);
  await A.configurar(p, { nome: 'Davi' });
  await p.waitForSelector('#b-continuar'); await p.click('#b-continuar'); await p.waitForSelector('#checkin');
  const layout = await p.evaluate(() => {
    const cols = [...document.querySelectorAll('.grade .col')].map((c) => Math.round(c.getBoundingClientRect().left));
    const cels = [...document.querySelectorAll('#trilha ul[aria-label="Trilha da sequência atual"] > li')].slice(0, 11).map((c) => Math.round(c.getBoundingClientRect().top));
    return { cols, primeiraLinha: cels.filter((t) => t === cels[0]).length, sobra: document.documentElement.scrollWidth - window.innerWidth };
  });
  confere(layout.cols.length === 2 && layout.cols[1] > layout.cols[0] + 300 && layout.primeiraLinha === 10 && layout.sobra <= 0, 'no computador: duas colunas e trilha com 10 dias por linha', layout);
  confere(anima === 'pulso', 'o dia de hoje pulsa na trilha enquanto o check-in está em aberto (microanimação)', anima);

  console.log('\n10. Nenhuma chamada de rede é possível');
  const politica = await p.evaluate(() => document.querySelector('meta[http-equiv="Content-Security-Policy"]').content);
  confere(/default-src 'none'/.test(politica), 'o arquivo traz a regra que proíbe qualquer conexão');
  const tentativa = await p.evaluate(() => fetch('https://example.com/').then(() => 'passou', () => 'bloqueado'));
  confere(tentativa === 'bloqueado', 'uma tentativa de conexão feita de dentro da página é bloqueada pelo navegador');
  const externos = await p.evaluate(() => [...document.querySelectorAll('[src], link[href]')].map((e) => e.getAttribute('src') || e.getAttribute('href')).filter((u) => !/^data:/.test(u)));
  confere(externos.length === 0, 'nenhum arquivo externo (sem CDN, fontes ou imagens de fora)', externos);
  confere(registro.erros.length === 0 && registro.rede.length === 0, 'sem erros de script e sem pedidos de rede', registro);
  await contexto.close();
}

(async () => {
  const nav = await A.novoNavegador();
  try {
    await relogioDeVerdade(nav);
    await dadosEstragados(nav);
    await semArmazenamento(nav);
    await teclado(nav);
    await telasPequenas(nav);
    await duasAbas(nav);
    await movimentoEComputador(nav);
  } finally {
    await nav.close();
  }
  process.exit(A.resumo() ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
