// Conferência de layout: em celulares estreitos, nenhum botão pode ficar com o
// texto quebrado em duas linhas, cortado ou para fora da tela — nas telas e nas janelas.
//
//   node dev/e2e/botoes.cjs            (confere em 320, 360 e 390 px)
//   node dev/e2e/botoes.cjs 375        (só uma largura)
const { chromium } = require('playwright');
const { BASE, USER, SHOTS, resetData } = require('./helpers.cjs');
const OUT = SHOTS + '/botoes-';
const WIDTHS = process.argv[2] ? [Number(process.argv[2])] : [320, 360, 390];

async function scanWidth(WIDTH) {
  console.log(`\n[largura ${WIDTH}px]`);

  resetData();
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: WIDTH, height: 780 }, locale: 'pt-BR', timezoneId: 'UTC' });
  const p = await ctx.newPage();
  await p.goto(BASE + '/login');
  await p.getByLabel('E-mail').fill(USER.email);
  await p.getByLabel('Senha', { exact: true }).fill(USER.password);
  await p.getByRole('button', { name: 'Entrar' }).click();
  await p.getByRole('heading', { name: 'Hoje', exact: true }).waitFor({ timeout: 30000 });
  const dialog = () => p.locator('dialog[open]').last();
  const bad = [];
  async function scan(where) {
    await p.waitForTimeout(250);
    const found = await p.evaluate(() => {
      const out = [];
      const vw = document.documentElement.clientWidth;
      const root = document.querySelector('dialog[open]') || document.body;
      const inScroller = (el) => {
        for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) {
          const o = getComputedStyle(n).overflowX;
          if ((o === 'auto' || o === 'scroll') && n.scrollWidth > n.clientWidth) return true;
        }
        return false;
      };
      for (const el of root.querySelectorAll('button, a')) {
        if (el.offsetParent === null) continue;
        const text = el.innerText.trim().replace(/\s+/g, ' ');
        if (!text) continue;
        const style = getComputedStyle(el);
        const isButton = el.tagName === 'BUTTON' || style.display === 'inline-flex';
        if (!isButton) continue;
        const r = el.getBoundingClientRect();
        if (r.width === 0) continue;
        // algum trecho de texto do botão ocupa mais de uma linha?
        let wrapped = false;
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          if (!node.textContent.trim()) continue;
          const range = document.createRange();
          range.selectNodeContents(node);
          const tops = new Set([...range.getClientRects()].filter((q) => q.width > 1).map((q) => Math.round(q.top / 4)));
          if (tops.size > 1) wrapped = true;
        }
        // só conta como defeito em botões de altura fixa (uma linha)
        wrapped = wrapped && r.height <= 52;
        const clipped = el.scrollWidth > el.clientWidth + 1;
        const outside = (r.right > vw + 1 || r.left < -1) && !inScroller(el);
        if (wrapped || clipped || outside) out.push(`“${text.slice(0, 40)}” [${[wrapped && 'quebrado', clipped && 'cortado', outside && 'fora da tela'].filter(Boolean).join(', ')}] ${Math.round(r.width)}x${Math.round(r.height)}`);
      }
      const extra = document.documentElement.scrollWidth - vw;
      if (extra > 0) out.push(`PÁGINA rola para o lado (${extra}px)`);
      const d = document.querySelector('dialog[open]');
      if (d) { const box = d.querySelector('footer'); if (box && box.scrollWidth > box.clientWidth + 1) out.push('rodapé da janela rola para o lado'); }
      return out;
    });
    for (const f of found) bad.push(`${where}: ${f}`);
    console.log(`${found.length ? '✗' : '✓'} ${where}`);
  }
  const close = async () => { await dialog().getByRole('button', { name: 'Cancelar' }).click(); await p.waitForFunction(() => !document.querySelector('dialog[open]')); };
  const more = async (label) => {
    await p.getByRole('button', { name: 'Mais', exact: true }).click();
    await scan('menu Mais');
    await dialog().getByRole('link', { name: label }).click();
    await p.getByRole('heading', { name: label, exact: true }).waitFor();
  };

  await scan('Hoje');
  await p.getByRole('link', { name: 'Países' }).click();
  await p.getByRole('heading', { name: 'Países', exact: true }).waitFor();
  await scan('Países');
  await p.getByRole('button', { name: 'Editar', exact: true }).first().click();
  await scan('formulário do país (com Apagar)');
  await p.screenshot({ path: OUT + `${WIDTH}-pais.png` });
  await close();
  await p.getByRole('link', { name: /Fra' Salvio/ }).click();
  await p.getByRole('heading', { name: "Fra' Salvio" }).waitFor();
  for (const tab of ['Visão geral', 'Conta atual', 'Aquecimento', 'Links', 'Vídeos', 'Perfis de exemplo', 'Kit', 'Histórico', 'Anotações']) {
    const t = p.getByRole('tab', { name: new RegExp('^' + tab) });
    if (!(await t.count())) { console.log('  (aba não encontrada: ' + tab + ')'); continue; }
    await t.first().click();
    await scan('avatar · ' + tab);
  }
  await p.getByRole('tab', { name: /^Aquecimento/ }).click();
  await p.getByRole('button', { name: 'Editar', exact: true }).click();
  await scan('editar calendário'); await close();
  await p.getByRole('button', { name: 'Editar o dia 5' }).click();
  await scan('editar dia'); await close();
  await p.getByRole('button', { name: 'Reiniciar aquecimento' }).click();
  await scan('reiniciar aquecimento'); await close();
  await p.getByRole('tab', { name: /^Conta atual/ }).click();
  await p.getByRole('button', { name: 'Editar', exact: true }).first().click();
  await scan('formulário da conta'); await close();
  await p.getByRole('tab', { name: /^Links/ }).click();
  const edits = p.getByRole('button', { name: /^Editar/ });
  if (await edits.count()) { await edits.first().click(); if (await dialog().count()) { await scan('formulário de link (com Apagar)'); await p.screenshot({ path: OUT + `${WIDTH}-link.png` }); await close(); } }
  await p.getByRole('link', { name: 'Planilha' }).click();
  await p.getByRole('table').waitFor();
  await scan('Planilha');
  await more('Infraestrutura');
  await scan('Infraestrutura');
  await p.getByRole('button', { name: /^Editar/ }).first().click();
  await scan('formulário do celular (com Apagar)');
  await p.screenshot({ path: OUT + `${WIDTH}-celular.png` });
  await close();
  await more('Configurações');
  await scan('Configurações');
  await p.getByRole('button', { name: 'Editar', exact: true }).click();
  await scan('padrão de aquecimento');
  await p.screenshot({ path: OUT + `${WIDTH}-padrao.png` });
  await close();
  await browser.close();
  resetData();
  return bad.map((line) => `${WIDTH}px · ${line}`);
}

(async () => {
  const bad = [];
  for (const width of WIDTHS) bad.push(...(await scanWidth(width)));
  if (bad.length) {
    console.log('\nACHADOS:\n' + bad.join('\n'));
    process.exit(1);
  }
  console.log('\nNenhum botão quebrado, cortado ou fora da tela.\nTUDO CERTO ✅');
})().catch((e) => { console.error('FALHOU: ' + e.message.split('\n').slice(0, 8).join('\n')); process.exit(1); });
