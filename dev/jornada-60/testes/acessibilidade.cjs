// Acessibilidade do Jornada 60: contraste de cada texto visível, nome acessível de cada botão,
// rótulo de cada campo e estrutura básica, tela por tela.
// Uso: node dev/jornada-60/testes/acessibilidade.cjs
const A = require('./apoio.cjs');
const { confere } = A;

// Roda dentro da página: devolve os problemas encontrados no que está visível agora.
function auditar() {
  const lum = (r, g, b) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const cor = (s) => { const m = /rgba?\(([^)]+)\)/.exec(s); if (!m) return null; const p = m[1].split(/[,/ ]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
  const misturar = (cima, baixo) => ({ r: cima.r * cima.a + baixo.r * (1 - cima.a), g: cima.g * cima.a + baixo.g * (1 - cima.a), b: cima.b * cima.a + baixo.b * (1 - cima.a), a: 1 });
  const visivel = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) > 0.05; };
  // fundo efetivo: sobe pelos pais somando as cores de fundo (ignora degradês, que aqui são sempre mais escuros que a base)
  function fundoDe(el) {
    const camadas = [];
    for (let e = el; e; e = e.parentElement) {
      const c = cor(getComputedStyle(e).backgroundColor);
      if (c && c.a > 0) { camadas.push(c); if (c.a >= 1) break; }
    }
    let base = { r: 11, g: 14, b: 19, a: 1 };      // cor do fundo da página
    for (let i = camadas.length - 1; i >= 0; i--) base = misturar(camadas[i], base);
    return base;
  }
  const raiz = [...document.querySelectorAll('dialog[open]')].pop() || document.body;
  const problemas = { contraste: [], semNome: [], semRotulo: [], outros: [] };
  // 1) contraste de cada trecho de texto visível
  const andador = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT);
  const vistos = new Set();
  for (let n = andador.nextNode(); n; n = andador.nextNode()) {
    const t = n.nodeValue.trim();
    const el = n.parentElement;
    if (!t || !el || vistos.has(el) || !visivel(el) || el.closest('.vh, [aria-hidden="true"], script, style, canvas')) continue;
    if (raiz === document.body && el.closest('dialog')) continue;
    if (/^[\p{Extended_Pictographic}️‍\s]+$/u.test(t)) continue;     // só emoji: não é texto
    vistos.add(el);
    const s = getComputedStyle(el);
    let frente = cor(s.color);
    if (!frente) continue;
    // opacidade herdada (botão desabilitado, etc.)
    let opac = 1;
    for (let e = el; e; e = e.parentElement) opac *= Number(getComputedStyle(e).opacity);
    const fundo = fundoDe(el);
    frente = misturar({ r: frente.r, g: frente.g, b: frente.b, a: frente.a * opac }, fundo);
    const l1 = lum(frente.r, frente.g, frente.b), l2 = lum(fundo.r, fundo.g, fundo.b);
    const razao = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    const px = parseFloat(s.fontSize), negrito = Number(s.fontWeight) >= 700;
    const grande = px >= 24 || (px >= 18.66 && negrito);
    const desabilitado = !!el.closest('[disabled]');
    const minimo = grande ? 3 : 4.5;
    if (!desabilitado && razao < minimo) problemas.contraste.push(t.slice(0, 40) + ' → ' + razao.toFixed(2) + ' (mín. ' + minimo + ', ' + Math.round(px) + 'px)');
  }
  // 2) todo botão/link tem nome; todo campo tem rótulo
  raiz.querySelectorAll('button, a[href], [role="button"]').forEach((b) => {
    if (!visivel(b) || (raiz === document.body && b.closest('dialog'))) return;
    const nome = (b.getAttribute('aria-label') || b.textContent || '').trim();
    if (!nome) problemas.semNome.push(b.outerHTML.slice(0, 90));
  });
  raiz.querySelectorAll('input, textarea, select').forEach((c) => {
    if (c.type === 'hidden' || (raiz === document.body && c.closest('dialog'))) return;
    const temRotulo = c.getAttribute('aria-label') || c.getAttribute('aria-labelledby') || (c.id && document.querySelector('label[for="' + c.id + '"]')) || c.closest('label');
    if (!temRotulo) problemas.semRotulo.push(c.outerHTML.slice(0, 90));
  });
  // 3) estrutura: um título principal por tela (ou título na janela), idioma, sem id repetido
  if (raiz === document.body) {
    if (document.querySelectorAll('#app h1').length !== 1) problemas.outros.push('a tela deveria ter exatamente um h1 (tem ' + document.querySelectorAll('#app h1').length + ')');
  } else if (!raiz.getAttribute('aria-labelledby') && !raiz.getAttribute('aria-label')) problemas.outros.push('janela sem título acessível');
  if (document.documentElement.lang !== 'pt-BR') problemas.outros.push('idioma da página');
  const ids = {};
  document.querySelectorAll('[id]').forEach((e) => { ids[e.id] = (ids[e.id] || 0) + 1; });
  Object.keys(ids).filter((k) => ids[k] > 1).forEach((k) => problemas.outros.push('id repetido: ' + k));
  return problemas;
}

(async () => {
  const nav = await A.novoNavegador();
  const { contexto, pagina: p, registro } = await A.novaPagina(nav);
  const tudo = [];
  const olhar = async (onde) => {
    await p.waitForTimeout(450);          // espera a animação de entrada terminar (durante ela o texto fica translúcido)
    const r = await p.evaluate(auditar);
    const lista = [].concat(r.contraste.map((x) => 'contraste: ' + x), r.semNome.map((x) => 'sem nome: ' + x), r.semRotulo.map((x) => 'sem rótulo: ' + x), r.outros);
    if (lista.length) tudo.push({ onde, lista });
    return lista;
  };
  const semJanela = () => p.waitForSelector('dialog', { state: 'detached' });
  await p.goto(A.url('2026-12-01')); await p.waitForFunction(() => window.JORNADA60_OK === true);
  await olhar('boas-vindas');
  await p.click('#g-comecar'); await olhar('guia 1'); await p.fill('#g-nome', 'Davi'); await p.click('#g-proximo');
  await olhar('guia 2'); await p.click('#g-proximo');
  await p.fill('#g-inicio', '2026-11-27'); await olhar('guia 3'); await p.click('#g-proximo');
  await p.click('#g-proximo'); await olhar('guia 4 com erro');
  await p.fill('#g-motivo-0', 'Minha família'); await p.click('#g-motivo-mais'); await p.fill('#g-motivo-1', 'Minha paz'); await p.click('#g-proximo');
  await p.fill('#g-conf-nome', 'João'); await p.fill('#g-conf-whats', '(11) 91234-5678'); await olhar('guia 5'); await p.click('#g-proximo');
  await p.click('.marco-linha >> nth=0'); await p.fill('#p-nome', 'Mouse pad novo'); await p.fill('#p-link', 'exemplo.com/x'); await p.fill('#p-preco', '49,90');
  await olhar('formulário de recompensa'); await p.click('#p-salvar'); await semJanela();
  await p.click('.marco-linha >> text=Dia 7'); await p.fill('#p-nome', 'Fone'); await p.click('#p-salvar'); await semJanela();
  await olhar('guia 6'); await p.click('#g-proximo');
  await p.waitForSelector('#pend-salvar'); await p.click('input[name="p-2026-11-27"][value="v"]'); await p.click('input[name="p-2026-11-28"][value="r"]');
  await olhar('pendentes');
  await p.click('#pend-depois'); await p.waitForSelector('#b-pend-agora'); await olhar('início com pendências');
  await p.click('#b-historico'); await olhar('histórico com pendências'); await p.keyboard.press('Escape'); await semJanela();
  await p.click('#b-pend-agora'); await p.click('[data-acao="pend-todos"][data-v="v"]'); await p.click('input[name="p-2026-11-28"][value="r"]'); await p.click('#pend-salvar');
  await p.waitForSelector('#b-continuar'); await olhar('mensagem do dia');
  await p.click('#b-continuar'); await p.waitForSelector('#checkin'); await olhar('início');
  await p.click('#b-venci'); await p.waitForSelector('dialog .festa'); await p.waitForTimeout(3200); await olhar('celebração de recompensa');
  await p.click('#b-festa-ok'); await semJanela(); await p.waitForTimeout(4600); await olhar('início depois do check-in');
  await p.click('.premio-card.lib [data-acao="premio-resgatar"]'); await p.waitForTimeout(4600); await olhar('início com recompensa resgatada');
  await p.click('#b-ajustes'); await olhar('ajustes');
  await p.click('#a-importar'); await olhar('restaurar backup'); await p.keyboard.press('Escape');
  await p.click('#a-reiniciar'); await olhar('reiniciar 1'); await p.click('#z-continuar'); await p.click('#z-confirmar'); await olhar('reiniciar 2 com erro');
  await p.keyboard.press('Escape'); await p.keyboard.press('Escape'); await p.keyboard.press('Escape'); await semJanela();
  await p.click('#b-corrigir-hoje'); await olhar('confirmar correção'); await p.keyboard.press('Escape'); await semJanela();
  await p.click('#b-sos');
  for (let i = 1; i <= 6; i++) {
    await olhar('tentação passo ' + i);
    if (i === 5) { await p.click('#sos-editar'); await olhar('tentação: editar saídas'); await p.click('#sos-editar'); }
    if (i < 6) await p.click(i === 2 ? '#sos-pular' : '#sos-proximo');
  }
  await p.click('#sos-venci'); await p.waitForTimeout(3200); await olhar('tentação vencida'); await p.click('#sos-fim'); await semJanela();
  await p.goto(A.url('2026-12-02')); await p.waitForSelector('#b-continuar'); await p.click('#b-continuar');
  await p.click('#b-recai'); await olhar('confirmar recaída');
  await p.locator('dialog').last().getByRole('button', { name: 'Registrar recaída', exact: true }).click();
  await p.waitForSelector('#b-graca-ok'); await olhar('graça'); await p.click('#b-graca-ok'); await semJanela();
  await olhar('início depois da recaída');
  await p.evaluate(() => { const j = window.__j60, ck = {}; for (let i = 0; i < 60; i++) ck[j.util.somarDias('2026-10-04', i)] = 'v'; const e = j.estado(); e.perfil.inicio = '2026-10-04'; e.checkins = ck; j.definirEstado(e); });
  await p.waitForSelector('#b-ver-jornada'); await p.waitForTimeout(4200); await olhar('tela final');
  await p.click('#b-ver-jornada'); await p.waitForSelector('#checkin'); await olhar('início com a jornada concluída');
  await p.evaluate(() => localStorage.setItem('jornada60:teste', '{{{')); await p.reload(); await p.waitForFunction(() => window.JORNADA60_OK === true);
  await olhar('tela de dados ilegíveis');

  confere(tudo.length === 0, '37 telas e janelas: contraste suficiente em todo texto, todo botão com nome, todo campo com rótulo', tudo);
  confere(registro.erros.length === 0 && registro.console.length === 0, 'sem erros no console', registro);
  await contexto.close();
  await nav.close();
  process.exit(A.resumo() ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
