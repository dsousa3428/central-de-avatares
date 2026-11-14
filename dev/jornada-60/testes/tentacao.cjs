// Botão "Estou sendo tentado": passo a passo completo, com relógio controlado para os 90 segundos.
// Uso: node dev/jornada-60/testes/tentacao.cjs
const A = require('./apoio.cjs');
const { confere } = A;
const txt = async (p, sel) => ((await p.locator(sel).last().innerText()) || '').replace(/\s+/g, ' ').trim();

(async () => {
  const nav = await A.novoNavegador();
  const { contexto, pagina: p, registro } = await A.novaPagina(nav);
  await p.clock.install({ time: new Date('2026-12-01T21:15:00') });
  await p.goto(A.url('2026-12-01'));
  await p.waitForFunction(() => window.JORNADA60_OK === true);
  await A.configurar(p, {
    nome: 'Davi', motivos: ['Minha família', 'Minha saúde', 'Minha paz'], confNome: 'João', confWhats: '(11) 91234-5678',
    recompensas: [{ dia: 3, nome: 'Mouse pad novo', emoji: '🖱️' }],
  });
  await p.waitForSelector('#b-continuar');

  console.log('\n1. O botão está sempre à mão');
  confere(await p.isVisible('#b-sos'), 'na mensagem do dia');
  await p.click('#b-sos');
  await p.waitForSelector('#sos-miolo h2');
  confere((await txt(p, '#sos-miolo h2')) === 'Respire. Isto vai passar.', 'abre direto da mensagem do dia');
  const primeiraRef = await txt(p, '#sos-miolo .versiculo cite');
  await p.keyboard.press('Escape');
  await p.waitForSelector('dialog', { state: 'detached' });
  confere((await A.estado(p)).tentacoesVencidas === 0, 'fechar no meio não soma no contador');
  await p.click('#b-continuar');
  await p.click('#b-venci');
  await p.waitForSelector('#b-corrigir-hoje');
  const caixa = await p.locator('#b-sos').boundingBox();
  confere(caixa && caixa.y + caixa.height <= 844 && caixa.height >= 56, 'na tela inicial fica fixo no rodapé, com botão grande', caixa);
  await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  const caixa2 = await p.locator('#b-sos').boundingBox();
  confere(caixa2 && Math.abs(caixa2.y - caixa.y) < 2, 'continua no mesmo lugar ao rolar a página');

  console.log('\n2. Passo 1: versículo de força');
  await p.click('#b-sos');
  await p.waitForSelector('#sos-miolo .versiculo');
  const ref = await txt(p, '#sos-miolo .versiculo cite');
  const banco = await p.evaluate(() => window.__j60.banco().tentacao.map((e) => e.ref));
  confere(banco.includes(ref) && (await txt(p, '#sos-miolo .versiculo p')).length > 20, 'versículo do conjunto da hora da tentação', ref);
  confere((await p.$$('.sos-topo .pontos i.on')).length === 1, 'indicador mostra o passo 1 de 6');

  console.log('\n3. Passo 2: respiração guiada de 90 segundos');
  await p.click('#sos-proximo');
  confere((await txt(p, '#tempo')) === '1:30' && (await txt(p, '#fala')) === 'Pronto?', 'começa em 1:30');
  await p.click('#b-respirar');
  confere((await txt(p, '#fala')) === 'Inspire…' && await p.evaluate(() => document.getElementById('bolha').classList.contains('insp')), 'inspirar: a bolha cresce (4 s)');
  await p.clock.runFor(4100);
  confere((await txt(p, '#fala')) === 'Solte o ar…' && await p.evaluate(() => document.getElementById('bolha').classList.contains('exp')), 'soltar o ar: a bolha encolhe (6 s)');
  await p.clock.runFor(6000);
  confere((await txt(p, '#fala')) === 'Inspire…', 'o ciclo se repete');
  await p.clock.runFor(19900);
  confere((await txt(p, '#tempo')) === '1:00', 'contagem regressiva certa aos 30 segundos', await txt(p, '#tempo'));
  confere(!(await p.isVisible('#sos-proximo')), 'ainda não terminou aos 30 segundos');
  await p.clock.runFor(59000);
  confere((await txt(p, '#tempo')) === '0:01', 'aos 89 segundos falta 1', await txt(p, '#tempo'));
  await p.clock.runFor(1300);
  await p.waitForSelector('#sos-proximo');
  confere((await txt(p, '#fala')) === 'Muito bem.' && (await txt(p, '#tempo')) === '0:00', 'termina exatamente aos 90 segundos');
  // voltar e pular também funcionam
  await p.click('[data-acao="sos-ir"][data-n="-1"]');
  await p.click('#sos-proximo');
  confere(await p.isVisible('#sos-proximo'), 'depois de concluída, a respiração não precisa ser refeita');

  console.log('\n4. Passo 3: meus motivos');
  await p.click('#sos-proximo');
  const motivos = await p.$$eval('#sos-miolo .lista-forte li', (els) => els.map((e) => e.textContent));
  confere(JSON.stringify(motivos) === JSON.stringify(['Minha família', 'Minha saúde', 'Minha paz']), 'mostra os motivos cadastrados', motivos);

  console.log('\n5. Passo 4: o que está em jogo');
  await p.click('#sos-proximo');
  const jogo = await txt(p, '#sos-miolo');
  confere(jogo.includes('Sequência atual 1 dia') && jogo.includes('Faltam 2 dias para 🖱️ Mouse pad novo'), 'sequência atual e “faltam X dias para” a próxima recompensa', jogo.slice(0, 200));

  console.log('\n6. Passo 5: saídas rápidas (lista editável)');
  await p.click('#sos-proximo');
  let saidas = await p.$$eval('#sos-saidas .escolha', (els) => els.map((e) => e.textContent.trim()));
  confere(saidas.length === 5 && saidas.some((s) => /Orar/.test(s)) && saidas.some((s) => /flexões/.test(s)) && saidas.some((s) => /banho frio/.test(s)) && saidas.some((s) => /Sair de casa/.test(s)) && saidas.some((s) => /Ligar/.test(s)),
    'lista padrão: orar, flexões, banho frio, sair de casa, ligar para alguém', saidas);
  await p.click('#sos-saidas .escolha >> nth=1');
  confere((await p.getAttribute('#sos-saidas .escolha >> nth=1', 'aria-pressed')) === 'true', 'dá para escolher uma saída');
  await p.click('#sos-editar');
  await p.fill('#s-nova', 'Ler um salmo em voz alta');
  await p.press('#s-nova', 'Enter');
  await p.click('[data-acao="sos-saida-apagar"][data-i="2"]');
  await p.click('#sos-editar');
  saidas = await p.$$eval('#sos-saidas .escolha', (els) => els.map((e) => e.textContent.trim()));
  const guardadas = (await A.estado(p)).saidas;
  confere(saidas.length === 5 && saidas.includes('Ler um salmo em voz alta') && !saidas.some((s) => /banho frio/.test(s)) && JSON.stringify(guardadas) === JSON.stringify(saidas), 'adicionar e apagar saídas, e a lista fica guardada', saidas);

  console.log('\n7. Passo 6: pessoa de confiança e “Venci a tentação”');
  await p.click('#sos-proximo');
  const link = await p.$eval('#sos-whats', (a) => ({ href: a.href, target: a.target, rel: a.rel, texto: a.textContent }));
  const mensagem = decodeURIComponent(link.href.split('?text=')[1] || '');
  confere(link.href.startsWith('https://wa.me/5511912345678?text=') && link.target === '_blank' && /noopener/.test(link.rel) && link.texto.includes('João'), 'botão de WhatsApp para a pessoa de confiança, em nova aba', link);
  confere(mensagem.startsWith('Oi, João!') && !/hábito|vício|recaí/i.test(mensagem), 'a mensagem pronta pede apoio sem dizer qual é o hábito', mensagem);
  await p.click('#sos-venci');
  await p.waitForSelector('#sos-fim');
  confere((await txt(p, '#sos-total')) === 'Tentações vencidas: 1' && (await txt(p, '#sos-miolo .versiculo cite')) === 'Salmos 124:7', 'vitória registrada, com versículo');
  confere((await A.estado(p)).tentacoesVencidas === 1, 'o contador foi salvo');
  await p.click('#sos-fim');
  await p.waitForSelector('dialog', { state: 'detached' });
  confere((await txt(p, '#numeros')).includes('Tentações vencidas 1'), 'os números da tela inicial mostram 1 tentação vencida');
  await p.reload(); await p.waitForFunction(() => window.JORNADA60_OK === true);
  confere((await txt(p, '#numeros')).includes('Tentações vencidas 1'), 'persiste após recarregar');

  console.log('\n8. Sem repetir o versículo e sem pessoa de confiança');
  const vistos = [primeiraRef, ref];      // as duas aberturas já feitas neste teste
  for (let i = 0; i < banco.length - 2; i++) {
    await p.click('#b-sos');
    await p.waitForSelector('#sos-miolo .versiculo cite');
    vistos.push(await txt(p, '#sos-miolo .versiculo cite'));
    await p.keyboard.press('Escape');
    await p.waitForSelector('dialog', { state: 'detached' });
  }
  confere(new Set(vistos).size === banco.length, 'os ' + banco.length + ' versículos de força aparecem todos antes de repetir', vistos);
  await p.click('#b-ajustes');
  await p.fill('#a-conf-nome', ''); await p.fill('#a-conf-whats', '');
  await p.click('#a-salvar');
  await p.waitForSelector('dialog', { state: 'detached' });
  await p.click('#b-sos');
  for (let i = 0; i < 5; i++) await p.click(i === 1 ? '#sos-pular' : '#sos-proximo');
  confere(!(await p.isVisible('#sos-whats')) && (await txt(p, '#sos-miolo')).includes('cadastrar o WhatsApp'), 'sem pessoa de confiança: orienta a falar com alguém e a cadastrar depois');
  confere(await p.isVisible('#sos-venci'), '“Venci a tentação” continua disponível');
  await p.click('[data-acao="sos-ir"][data-n="-5"]');
  confere((await txt(p, '#sos-miolo h2')) === 'Respire. Isto vai passar.', '“Recomeçar o passo a passo” volta ao início');
  await p.keyboard.press('Escape');

  confere(registro.erros.length === 0 && registro.console.length === 0 && registro.rede.length === 0, 'sem erros, avisos ou rede', registro);
  await contexto.close();
  await nav.close();
  process.exit(A.resumo() ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
