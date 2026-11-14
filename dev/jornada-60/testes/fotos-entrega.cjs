// Imagens de demonstração (dados de exemplo, sem o modo de teste), em alta resolução.
// Uso: node dev/jornada-60/testes/fotos-entrega.cjs
const fs = require('fs');
const path = require('path');
const A = require('./apoio.cjs');

const hojeLocal = () => { const d = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' })); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const somar = (s, n) => new Date(Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)) + n * 86400000).toISOString().slice(0, 10);

(async () => {
  const pasta = path.join(A.CAPTURAS, 'entrega');
  fs.mkdirSync(pasta, { recursive: true });
  const hoje = hojeLocal(), inicio = somar(hoje, -6);          // hoje é o dia 7: dia de recompensa
  const checkins = {};
  for (let i = 0; i < 6; i++) checkins[somar(inicio, i)] = 'v';
  const estado = {
    app: 'jornada60', versao: 1, criadoEm: inicio, salvamentoConferido: true,
    perfil: { nome: 'Davi', compromisso: '', inicio, motivos: ['Quero estar inteiro para a minha família', 'Quero acordar em paz comigo mesmo', 'Quero ser dono do meu tempo'], confianca: { nome: 'João', whatsapp: '(11) 91234-5678' } },
    recompensas: [
      { id: 'a', dia: 3, nome: 'Mouse pad novo', link: 'https://exemplo.com/mousepad', preco: '49,90', emoji: '🖱️', liberadaEm: somar(inicio, 2), resgatadaEm: null },
      { id: 'b', dia: 7, nome: 'Fone de ouvido', link: 'https://exemplo.com/fone', preco: '199', emoji: '🎧' },
      { id: 'c', dia: 14, nome: 'Tênis de corrida', link: '', preco: '399,90', emoji: '👟' },
      { id: 'd', dia: 30, nome: 'Jantar especial', link: '', preco: '', emoji: '🍕' },
      { id: 'e', dia: 60, nome: 'Viagem de fim de semana', link: 'https://exemplo.com/viagem', preco: '1.200', emoji: '✈️' },
    ],
    checkins, tentacoesVencidas: 3, backup: { ultimoEm: somar(hoje, -1) },
  };
  const nav = await A.novoNavegador();
  const { contexto, pagina: p, registro } = await A.novaPagina(nav, { viewport: { width: 390, height: 844 }, dpr: 2 });
  await contexto.addInitScript((e) => { if (!localStorage.getItem('jornada60')) localStorage.setItem('jornada60', JSON.stringify(e)); }, estado);
  const foto = async (nome, alvo) => {
    await p.waitForTimeout(1100);
    const arq = path.join(pasta, nome + '.png');
    if (alvo) await p.locator(alvo).first().screenshot({ path: arq }); else await p.screenshot({ path: arq });
  };
  await p.goto(A.url(null)); await p.waitForFunction(() => window.JORNADA60_OK === true);
  await p.waitForSelector('#b-continuar');
  await foto('1-mensagem-do-dia');
  await p.click('#b-continuar'); await p.waitForSelector('#checkin');
  await foto('2-tela-inicial');
  await p.evaluate(() => document.querySelector('#trilha').scrollIntoView({ block: 'start' }));
  await p.evaluate(() => window.scrollBy(0, -12));
  await foto('3-trilha');
  await p.evaluate(() => document.querySelector('#recompensas').scrollIntoView({ block: 'start' }));
  await p.evaluate(() => window.scrollBy(0, -12));
  await foto('4-recompensas');
  await p.evaluate(() => window.scrollTo(0, 0));
  await p.click('#b-venci');
  await p.waitForSelector('dialog .festa'); await p.waitForTimeout(350);
  await p.screenshot({ path: path.join(pasta, '5-recompensa-liberada.png') });
  await p.click('#b-festa-ok'); await p.waitForSelector('dialog', { state: 'detached' });
  await p.click('#b-sos'); await p.click('#sos-proximo'); await p.click('#b-respirar'); await p.waitForTimeout(2800);
  await p.screenshot({ path: path.join(pasta, '6-respiracao.png') });
  console.log('imagens em ' + pasta, '| hoje:', hoje, '| console:', registro.console, '| erros:', registro.erros);
  await nav.close();
})().catch((e) => { console.error(e); process.exit(1); });
