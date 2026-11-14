// Capturas dos estados menos comuns (não é teste: só fotografa).
// Uso: node dev/jornada-60/testes/fotos-extra.cjs
const fs = require('fs');
const path = require('path');
const A = require('./apoio.cjs');

(async () => {
  const pasta = path.join(A.CAPTURAS, 'extra');
  fs.mkdirSync(pasta, { recursive: true });
  const nav = await A.novoNavegador();
  const { pagina: p, registro } = await A.novaPagina(nav, { viewport: { width: 390, height: 844 } });
  const foto = async (nome, alvo) => {
    await p.waitForTimeout(500);
    const arq = path.join(pasta, nome + '.png');
    if (alvo) await p.locator(alvo).first().screenshot({ path: arq }); else await p.screenshot({ path: arq });
  };
  await p.goto(A.url('2026-12-01')); await p.waitForFunction(() => window.JORNADA60_OK === true);
  await A.configurar(p, { nome: 'Davi', recompensas: [{ dia: 3, nome: 'Mouse pad novo', emoji: '🖱️', link: 'https://exemplo.com/x' }, { dia: 7, nome: 'Fone de ouvido', emoji: '🎧' }] });
  await p.waitForSelector('#b-continuar'); await p.click('#b-continuar'); await p.waitForSelector('#checkin');
  await foto('01-inicio-com-dica-de-salvamento');
  await p.click('#b-venci'); await p.waitForSelector('#b-corrigir-hoje');
  await p.goto(A.url('2026-12-05')); await p.waitForSelector('#pend-salvar');
  await foto('02-pendentes-com-responder-depois');
  await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await foto('03-pendentes-rodape');
  await p.click('#pend-depois'); await p.waitForSelector('#b-pend-agora');
  await foto('04-inicio-com-pendencias');
  await foto('05-trilha-com-pendencias', '#trilha');
  await p.goto(A.url('2026-12-12')); await p.waitForSelector('#pend-salvar');
  await p.click('[data-acao="pend-todos"][data-v="v"]'); await p.click('#pend-salvar');
  await p.waitForSelector('dialog .festa'); await p.click('#b-festa-ok');
  await p.waitForSelector('#b-continuar'); await p.click('#b-continuar'); await p.waitForSelector('#checkin');
  await foto('06-inicio-com-lembrete-de-backup');
  await p.click('#lembrete-backup [data-acao="exportar"]');
  await foto('07-backup-pronto');
  console.log('capturas em ' + pasta, '| console:', registro.console, '| erros:', registro.erros);
  await nav.close();
})().catch((e) => { console.error(e); process.exit(1); });
