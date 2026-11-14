// Apoio dos testes do Jornada 60: abre o index.html direto do disco (file://), como o dono vai abrir.
const path = require('path');
const { chromium } = require('playwright');

const ARQUIVO = path.resolve(__dirname, '..', '..', '..', 'jornada-60', 'index.html');
const URL_BASE = 'file://' + ARQUIVO;
const CAPTURAS = path.resolve(__dirname, '..', 'capturas');

function url(hoje) { return URL_BASE + (hoje ? '?hoje=' + hoje : ''); }

async function novoNavegador() { return chromium.launch(); }

// Cria um contexto e uma página, guardando tudo o que aparecer no console e todo pedido de rede.
async function novaPagina(navegador, opcoes = {}) {
  const contexto = await navegador.newContext({
    viewport: opcoes.viewport || { width: 390, height: 844 },
    deviceScaleFactor: opcoes.dpr || 1,
    locale: 'pt-BR',
    timezoneId: opcoes.fuso || 'America/Sao_Paulo',
    acceptDownloads: true,
    reducedMotion: opcoes.semMovimento ? 'reduce' : 'no-preference',
    hasTouch: !!opcoes.toque,
  });
  const pagina = await contexto.newPage();
  const registro = { console: [], erros: [], rede: [] };
  pagina.on('console', (m) => { if (['error', 'warning'].includes(m.type())) registro.console.push(m.type() + ': ' + m.text()); });
  pagina.on('pageerror', (e) => registro.erros.push(String(e && e.stack || e)));
  pagina.on('request', (r) => { const u = r.url(); if (!u.startsWith('file://') && !u.startsWith('data:') && !u.startsWith('blob:')) registro.rede.push(u); });
  return { contexto, pagina, registro };
}

// Preenche a configuração guiada inteira.
async function configurar(pagina, o = {}) {
  await pagina.click('#g-comecar');
  await pagina.fill('#g-nome', o.nome || 'Davi');
  await pagina.click('#g-proximo');
  await pagina.fill('#g-compromisso', o.compromisso == null ? '' : o.compromisso);
  await pagina.click('#g-proximo');
  if (o.inicio) await pagina.fill('#g-inicio', o.inicio);
  await pagina.click('#g-proximo');
  const motivos = o.motivos || ['Quero estar inteiro para a minha família'];
  for (let i = 0; i < motivos.length; i++) {
    if (i > 0) await pagina.click('#g-motivo-mais');
    await pagina.fill('#g-motivo-' + i, motivos[i]);
  }
  await pagina.click('#g-proximo');
  if (o.confNome) await pagina.fill('#g-conf-nome', o.confNome);
  if (o.confWhats) await pagina.fill('#g-conf-whats', o.confWhats);
  await pagina.click('#g-proximo');
  for (const r of (o.recompensas || [])) {
    await pagina.click('#g-premio-outro');
    await pagina.fill('#p-dia', String(r.dia));
    await pagina.fill('#p-nome', r.nome);
    if (r.link) await pagina.fill('#p-link', r.link);
    if (r.preco) await pagina.fill('#p-preco', r.preco);
    if (r.emoji) await pagina.fill('#p-emoji', r.emoji);
    await pagina.click('#p-salvar');
    await pagina.waitForSelector('dialog', { state: 'detached' });
  }
  await pagina.click('#g-proximo');
}

async function estado(pagina) { return pagina.evaluate(() => window.__j60.estado()); }
async function contas(pagina) { return pagina.evaluate(() => window.__j60.calc()); }

let falhas = 0, feitos = 0;
function confere(cond, descricao, detalhe) {
  feitos++;
  if (cond) console.log('  ✓ ' + descricao);
  else { falhas++; console.log('  ✗ ' + descricao + (detalhe !== undefined ? '  → ' + JSON.stringify(detalhe) : '')); }
}
function resumo() { console.log('\n' + (falhas ? '✗ ' + falhas + ' falha(s) em ' : '✓ ') + feitos + ' conferências'); return falhas; }

module.exports = { ARQUIVO, URL_BASE, CAPTURAS, url, novoNavegador, novaPagina, configurar, estado, contas, confere, resumo };
