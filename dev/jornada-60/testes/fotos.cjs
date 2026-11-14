// Capturas de tela para a conferência visual (não é teste: só fotografa).
// Uso: node dev/jornada-60/testes/fotos.cjs [celular|computador]
const fs = require('fs');
const path = require('path');
const A = require('./apoio.cjs');

const modo = process.argv[2] || 'celular';
const viewport = modo === 'computador' ? { width: 1280, height: 860 } : { width: 390, height: 844 };
const pasta = path.join(A.CAPTURAS, modo);
fs.mkdirSync(pasta, { recursive: true });
let n = 0;

(async () => {
  const nav = await A.novoNavegador();
  const { pagina: p, registro } = await A.novaPagina(nav, { viewport, dpr: Number(process.env.DPR || 1) });
  const foto = async (nome, alvo) => {
    await p.waitForTimeout(450);
    const arq = path.join(pasta, String(++n).padStart(2, '0') + '-' + nome + '.png');
    if (alvo) await p.locator(alvo).first().screenshot({ path: arq });
    else await p.screenshot({ path: arq });
  };
  const semJanela = () => p.waitForSelector('dialog', { state: 'detached' });
  await p.goto(A.url('2026-12-01')); await p.waitForFunction(() => window.JORNADA60_OK === true);
  await foto('boas-vindas');
  await p.click('#g-comecar'); await p.fill('#g-nome', 'Davi'); await foto('guia-1-nome'); await p.click('#g-proximo');
  await p.fill('#g-compromisso', 'Projeto Fênix'); await p.click('#g-proximo');
  await p.fill('#g-inicio', '2026-11-25'); await foto('guia-3-data'); await p.click('#g-proximo');
  await p.fill('#g-motivo-0', 'Quero estar inteiro para a minha família'); await p.click('#g-motivo-mais'); await p.fill('#g-motivo-1', 'Quero acordar em paz comigo mesmo');
  await foto('guia-4-motivos'); await p.click('#g-proximo');
  await p.fill('#g-conf-nome', 'João'); await p.fill('#g-conf-whats', '(11) 91234-5678'); await foto('guia-5-pessoa'); await p.click('#g-proximo');
  await p.click('.marco-linha >> nth=0');
  await p.fill('#p-nome', 'Mouse pad novo'); await p.fill('#p-link', 'https://exemplo.com/mousepad'); await p.fill('#p-preco', '49,90'); await p.click('[data-acao="emoji"][data-e="🖱️"]');
  await foto('recompensa-formulario');
  await p.click('#p-salvar'); await semJanela();
  for (const [dia, nome, emoji, preco, link] of [[7, 'Fone de ouvido', '🎧', '199', 'https://exemplo.com/fone'], [14, 'Tênis de corrida', '👟', '399,90', ''], [30, 'Jantar especial', '🍕', '', ''], [60, 'Viagem de fim de semana', '✈️', '1.200', 'https://exemplo.com/viagem']]) {
    await p.click('.marco-linha >> text=Dia ' + dia);
    await p.fill('#p-nome', nome); await p.fill('#p-emoji', emoji); await p.fill('#p-preco', preco); await p.fill('#p-link', link);
    await p.click('#p-salvar'); await semJanela();
  }
  await foto('guia-6-recompensas');
  await p.click('#g-proximo');
  await p.waitForSelector('#pend-salvar');
  await p.check('input[name="p-2026-11-25"][value="v"]', { force: true });
  await p.check('input[name="p-2026-11-26"][value="r"]', { force: true });
  await foto('pendentes');
  await p.click('[data-acao="pend-todos"][data-v="v"]');
  await p.check('input[name="p-2026-11-26"][value="r"]', { force: true });
  await p.click('#pend-salvar');
  await p.waitForSelector('dialog .festa'); await p.waitForTimeout(500); await foto('festa-recompensa');
  await p.click('#b-festa-ok');
  await p.waitForSelector('#b-continuar'); await foto('mensagem-do-dia');
  await p.click('#b-continuar'); await p.waitForSelector('#checkin'); await p.waitForTimeout(900);
  await foto('inicio-topo');
  await foto('inicio-heroi', '.heroi');
  await foto('inicio-checkin', '#checkin');
  await foto('inicio-mensagem', '#mensagem-do-dia');
  await foto('inicio-trilha', '#trilha');
  await foto('inicio-numeros', '#numeros');
  await foto('inicio-recompensas', '#recompensas');
  await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight)); await foto('inicio-rodape');
  await p.evaluate(() => window.scrollTo(0, 0));
  await p.click('#b-venci'); await p.waitForTimeout(350); await foto('checkin-confete');
  await p.waitForTimeout(3500);
  await foto('checkin-feito', '#checkin');
  await p.click('#b-historico'); await foto('historico'); await p.keyboard.press('Escape'); await semJanela();
  await p.click('#b-ajustes'); await foto('ajustes'); await p.keyboard.press('Escape'); await semJanela();
  await p.click('#b-sos'); await foto('sos-1-versiculo');
  await p.click('#sos-proximo'); await p.click('#b-respirar'); await p.waitForTimeout(3000); await foto('sos-2-respirar');
  await p.click('#sos-pular'); await foto('sos-3-motivos');
  await p.click('#sos-proximo'); await foto('sos-4-em-jogo');
  await p.click('#sos-proximo'); await p.click('#sos-saidas .escolha >> nth=1'); await foto('sos-5-saidas');
  await p.click('#sos-editar'); await foto('sos-5-editar'); await p.click('#sos-editar');
  await p.click('#sos-proximo'); await foto('sos-6-pessoa');
  await p.click('#sos-venci'); await p.waitForTimeout(300); await foto('sos-7-vitoria');
  await p.click('#sos-fim'); await semJanela();
  // dia seguinte: recaída
  await p.goto(A.url('2026-12-02')); await p.waitForSelector('#b-continuar'); await p.click('#b-continuar');
  await p.click('#b-recai'); await foto('recaida-confirmar');
  await p.locator('dialog').last().getByRole('button', { name: 'Registrar recaída', exact: true }).click();
  await p.waitForSelector('#b-graca-ok'); await foto('recaida-graca');
  await p.click('#b-graca-ok'); await semJanela();
  await foto('inicio-depois-da-recaida');
  await foto('trilha-depois-da-recaida', '#trilha');
  // jornada concluída
  await p.evaluate(() => {
    const ck = {}; for (let i = 0; i < 59; i++) ck[window.__j60.util.somarDias('2026-10-04', i)] = 'v';
    const e = window.__j60.estado(); e.perfil.inicio = '2026-10-04'; e.checkins = ck; e.mensagens.dia = null;
    window.__j60.definirHoje('2026-12-02'); window.__j60.definirEstado(e);
  });
  await p.waitForSelector('#b-continuar'); await p.click('#b-continuar'); await p.click('#b-venci');
  await p.waitForSelector('dialog .festa'); await p.click('#b-festa-ok');
  await p.waitForSelector('#b-ver-jornada'); await p.waitForTimeout(400); await foto('final');
  await p.waitForTimeout(3500); await foto('final-inteira', '#conteudo');
  console.log(n + ' capturas em ' + pasta, '| console:', registro.console, '| erros:', registro.erros);
  await nav.close();
})().catch((e) => { console.error(e); process.exit(1); });
