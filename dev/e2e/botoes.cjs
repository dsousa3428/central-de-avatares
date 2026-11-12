// Conferência de layout: em celulares estreitos, nenhum botão pode ficar com o
// texto quebrado em duas linhas, cortado ou para fora da tela — nas telas e nas janelas.
//
//   node dev/e2e/botoes.cjs            (confere em 320, 360 e 390 px)
//   node dev/e2e/botoes.cjs 375        (só uma largura)
const { chromium } = require('playwright');
const { BASE, USER, SHOTS, psql, resetData } = require('./helpers.cjs');
const OUT = SHOTS + '/botoes-';
const WIDTHS = process.argv[2] ? [Number(process.argv[2])] : [320, 360, 390];

async function scanWidth(WIDTH) {
  console.log(`\n[largura ${WIDTH}px]`);

  resetData();
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: WIDTH, height: 780 }, locale: 'pt-BR', timezoneId: 'UTC', serviceWorkers: 'block' });
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
  await p.getByRole('button', { name: 'Buscar', exact: true }).click();
  await dialog().getByLabel('O que você procura?').fill('fra');
  await scan('busca');
  // (num campo de busca o primeiro Esc só limpa o texto: fecha pelo botão)
  await dialog().getByRole('button', { name: 'Fechar' }).click();
  await p.waitForFunction(() => !document.querySelector('dialog[open]'));
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
  await p.getByRole('button', { name: 'Conta caiu', exact: true }).click();
  await scan('conta caiu (passo 1)'); await close();
  await p.getByRole('tab', { name: /^Links/ }).click();
  const edits = p.getByRole('button', { name: /^Editar/ });
  if (await edits.count()) { await edits.first().click(); if (await dialog().count()) { await scan('formulário de link (com Apagar)'); await p.screenshot({ path: OUT + `${WIDTH}-link.png` }); await close(); } }
  await p.getByRole('tab', { name: /^Vendas/ }).click();
  await scan('avatar · Vendas');
  await p.getByRole('button', { name: 'Lançar venda' }).click();
  await scan('lançar venda (pelo avatar)');
  await p.screenshot({ path: OUT + `${WIDTH}-venda.png` });
  await close();
  await p.getByRole('button', { name: /Corrigir a venda da semana/ }).first().click();
  await scan('venda da semana (com Apagar)'); await close();
  await p.getByRole('link', { name: 'Vendas' }).click();
  await p.getByRole('heading', { name: 'Vendas', exact: true }).waitFor();
  await scan('Vendas');
  await p.screenshot({ path: OUT + `${WIDTH}-vendas.png`, fullPage: true });
  await p.getByRole('button', { name: 'Cotações' }).click();
  await scan('cotações'); await close();
  await p.getByRole('button', { name: 'Ver tabela' }).click();
  await scan('Vendas · tabela do gráfico');
  await p.getByRole('link', { name: 'Planilha' }).click();
  await p.getByRole('table').waitFor();
  await scan('Planilha');
  await p.getByRole('tab', { name: /^Vendas/ }).click();
  await scan('Planilha · Vendas');
  await p.getByRole('tab', { name: /^Contas/ }).click();
  await p.getByRole('button', { name: 'Mais', exact: true }).click();
  await dialog().getByRole('link', { name: 'Quedas de contas' }).click();
  await p.getByRole('heading', { name: 'Quedas', exact: true }).waitFor();
  await scan('Quedas');
  await more('Infraestrutura');
  await scan('Infraestrutura');
  await p.getByRole('button', { name: /^Editar/ }).first().click();
  await scan('formulário do celular (com Apagar)');
  await p.screenshot({ path: OUT + `${WIDTH}-celular.png` });
  await close();
  await more('Configurações');
  await scan('Configurações');
  await p.getByRole('button', { name: 'Trocar senha de login' }).click();
  await scan('trocar senha de login'); await close();
  await p.getByLabel('Arquivo de backup para restaurar').setInputFiles({
    name: 'backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ app: 'central-de-avatares', format: 1, exported_at: new Date().toISOString(), tables: { countries: [], phones: [], antidetect_profiles: [], avatars: [], accounts: [], warmups: [], weekly_sales: [], activity_log: [] }, settings: null })),
  });
  await dialog().getByRole('heading', { name: 'Restaurar backup' }).waitFor();
  await scan('restaurar backup'); await close();
  await p.getByRole('button', { name: 'Editar', exact: true }).click();
  await scan('padrão de aquecimento');
  await p.screenshot({ path: OUT + `${WIDTH}-padrao.png` });
  await close();

  // Cofre de senhas: criar, configurações com o cofre aberto, trocar a senha-mestra
  const MASTER = 'frase mestra só para o teste de telas';
  const LONG = 'SenhaMuitoCompridaSemNenhumEspaco'.repeat(4);
  await p.getByRole('button', { name: 'Criar senha-mestra' }).click();
  await scan('criar senha-mestra');
  await p.screenshot({ path: OUT + `${WIDTH}-criar-cofre.png` });
  await dialog().getByLabel('Senha-mestra', { exact: true }).fill(MASTER);
  await dialog().getByLabel('Repita a senha-mestra', { exact: true }).fill(MASTER);
  await dialog().getByRole('checkbox').check();
  await dialog().getByRole('button', { name: 'Criar cofre', exact: true }).click();
  await p.waitForFunction(() => !document.querySelector('dialog[open]'), null, { timeout: 20000 });
  await p.getByText('Aberto neste aparelho.').waitFor();
  await scan('Configurações · cofre aberto');
  await p.screenshot({ path: OUT + `${WIDTH}-config-cofre.png`, fullPage: true });
  await p.getByRole('button', { name: 'Trocar senha-mestra' }).click();
  await scan('trocar senha-mestra'); await close();

  // Senhas de uma conta: trancado, destrancar, formulário e senhas compridas à mostra
  const avatarId = psql("select id from public.avatars where name = 'Fra'' Salvio'");
  await p.goto(`${BASE}/avatar?id=${avatarId}&aba=conta`);
  await p.getByText('Cofre trancado').waitFor({ timeout: 30000 });
  await scan('conta · cofre trancado');
  await p.getByRole('button', { name: 'Destrancar' }).click();
  await scan('destrancar o cofre');
  await dialog().getByLabel('Senha-mestra', { exact: true }).fill(MASTER);
  await dialog().getByRole('button', { name: 'Destrancar', exact: true }).click();
  await p.waitForFunction(() => !document.querySelector('dialog[open]'), null, { timeout: 20000 });
  await p.getByRole('button', { name: 'Adicionar senhas' }).click();
  await dialog().getByLabel('Senha do Instagram', { exact: true }).fill(LONG);
  await dialog().getByLabel('Senha do e-mail', { exact: true }).fill(LONG);
  await dialog().getByLabel('E-mail de recuperação', { exact: true }).fill(`${LONG}@exemplo.com`);
  await dialog().getByLabel('Códigos de backup / 2FA', { exact: true }).fill(`${LONG}\n${LONG}`);
  await dialog().getByRole('button', { name: 'Mostrar a senha do Instagram' }).click();
  await scan('formulário de senhas');
  await p.screenshot({ path: OUT + `${WIDTH}-senhas-form.png` });
  await dialog().getByRole('button', { name: 'Salvar', exact: true }).click();
  await p.waitForFunction(() => !document.querySelector('dialog[open]'), null, { timeout: 20000 });
  for (const what of ['a senha do Instagram', 'a senha do e-mail', 'o e-mail de recuperação', 'os códigos de backup']) {
    await p.getByRole('button', { name: `Mostrar ${what}` }).click();
  }
  await scan('conta · senhas compridas à mostra');
  await p.screenshot({ path: OUT + `${WIDTH}-senhas-a-mostra.png`, fullPage: true });

  // "Conta caiu" até o fim: a conta nova (reposição), com a confirmação de reuso, e os avisos da tela Hoje
  await p.getByRole('button', { name: 'Conta caiu', exact: true }).click();
  await dialog().getByRole('button', { name: 'Confirmar queda', exact: true }).click();
  await dialog().getByRole('heading', { name: 'Nova conta' }).waitFor();
  await dialog().getByLabel('Celular', { exact: true }).selectOption({ index: 1 });
  await dialog().getByText(/^Reutilizar o celular/).waitFor();
  await scan('nova conta (reposição, com confirmação de reuso)');
  await p.screenshot({ path: OUT + `${WIDTH}-reposicao.png` });
  await close();
  await p.getByRole('link', { name: /^Hoje/ }).click();
  await p.getByRole('link', { name: /sem conta em operação/ }).waitFor();
  await scan('Hoje · com avisos');
  await p.screenshot({ path: OUT + `${WIDTH}-hoje-avisos.png`, fullPage: true });
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
