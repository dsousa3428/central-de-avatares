// Conferência de layout: textos muito longos (nomes, links, anotações sem espaços)
// não podem "estourar" a largura de um celular estreito (360 px) em nenhuma tela.
//
//   node dev/e2e/textos-longos.cjs      (com o app rodando em http://localhost:3000)
const { chromium } = require('playwright');
const { SHOTS, openPhone, psql, resetData } = require('./helpers.cjs');
const S = SHOTS + '/';
(async () => {
  resetData();
  const s = await openPhone(chromium, { viewport: { width: 360, height: 740 }, timezoneId: 'UTC' });
  const { page } = s;
  await s.login(); // recria os exemplos
  const uid = psql("select user_id from public.countries limit 1");
  const cid = psql("select id from public.countries limit 1");
  const long = 'Supercalifragilisticexpialidocious';
  psql(`insert into public.phones (user_id, nickname, model, number, notes) values ('${uid}', 'Celular ${long} ${long}', 'Modelo ${long}${long}', '+39 351 000 0003 / +39 351 000 0004 / +39 351 000 0005', 'https://exemplo.com/${long}${long}${long}')`);
  const pid = psql("select id from public.phones where nickname like 'Celular Super%'");
  psql(`insert into public.antidetect_profiles (user_id, number, name, proxy) values ('${uid}', '9999999999', 'Perfil ${long} ${long}', 'usuario:senha@${long}${long}.exemplo.net:8000')`);
  const prid = psql("select id from public.antidetect_profiles where number = '9999999999'");
  psql(`insert into public.avatars (user_id, country_id, name, niche, product_name, product_price, product_currency, sales_site_url, notes, position, extra_links, model_videos, reference_profiles, kit) values ('${uid}', '${cid}', 'Dottoressa ${long} ${long} Bianchi', 'Nicho ${long}${long}${long}', 'Produto ${long}${long}', 123456789.99, 'EUR', 'https://exemplo.com/${long}${long}${long}/${long}', '${long}${long}${long}${long}', 9, '[{"id":"1","label":"${long}${long}","url":"https://exemplo.com/${long}${long}${long}"}]', '[{"id":"1","label":"${long}${long}${long}","url":"https://exemplo.com/${long}${long}${long}","status":"a_modelar","note":"${long}${long}${long}"}]', '[{"id":"1","handle":"@${long}${long}${long}","note":"${long}${long}${long}"}]', '{"display_name":"${long}${long}","bio":"${long}${long}${long}","bio_link":"https://exemplo.com/${long}${long}${long}","highlights":[{"id":"1","title":"${long}${long}","text":"${long}${long}${long}"}],"proof_links":[{"id":"1","label":"${long}${long}","url":"https://exemplo.com/${long}${long}${long}"}]}')`);
  const aid = psql("select id from public.avatars where name like 'Dottoressa%'");
  psql(`insert into public.accounts (user_id, avatar_id, generation, handle, email, status, phone_id, profile_id, proxy, followers, notes) values ('${uid}', '${aid}', 1, 'dottoressa.${long.toLowerCase()}.${long.toLowerCase()}', '${long.toLowerCase()}.${long.toLowerCase()}@${long.toLowerCase()}.exemplo.com', 'ativa', '${pid}', '${prid}', 'usuario:senha@${long}${long}.exemplo.net:8000', 123456789, '${long}${long}${long}')`);
  psql(`update public.countries set warmup_tags = warmup_tags || array['#${long}${long}${long}'], notes = '${long}${long}${long}${long}'`);
  psql(`update public.accounts set status = 'aquecendo' where handle like 'dottoressa%'`);
  const acc = psql("select id from public.accounts where handle like 'dottoressa%'");
  // checklist de reposição (com o kit de textos longos ao lado) e uma conta caída no mesmo celular, perfil e
  // proxy, com um motivo sem espaços: avisos de reuso na tela Hoje e a tela de quedas com nomes compridos
  psql(`update public.accounts set checklist = '[{"key":"email","label":"Criar o e-mail","done":true},{"key":"perfil","label":"Novo perfil no anti-detect","done":false},{"key":"proxy","label":"Novo proxy","done":false},{"key":"celular","label":"Celular","done":false},{"key":"bio","label":"Bio","done":false},{"key":"link","label":"Link da bio","done":false},{"key":"destaques","label":"Destaques","done":false},{"key":"provas","label":"Provas sociais","done":false},{"key":"aquecimento","label":"Iniciar o aquecimento","done":false}]'::jsonb where id = '${acc}'`);
  psql(`insert into public.accounts (user_id, avatar_id, generation, handle, status, phone_id, profile_id, proxy, created_on, fell_on, fall_reason) values ('${uid}', '${aid}', 2, 'dottoressa.${long.toLowerCase()}.${long.toLowerCase()}', 'caida', '${pid}', '${prid}', 'usuario:senha@${long}${long}.exemplo.net:8000', current_date - 400, current_date - 3, '${long}${long}${long}')`);
  psql(`insert into public.warmups (user_id, account_id, start_date, total_days, days) values ('${uid}', '${acc}', current_date, 3, ('[{"n":1,"date":"' || current_date || '","use":true,"minutes":600,"task":"${long}${long}${long} ${long}${long}${long}","done":false,"done_at":null},{"n":2,"date":"' || (current_date + 1) || '","use":false,"minutes":0,"task":"","done":false,"done_at":null},{"n":3,"date":"' || (current_date + 2) || '","use":true,"minutes":15,"task":"","done":false,"done_at":null}]')::jsonb)`);
  // vendas com valores enormes, em moedas diferentes, e uma observação sem espaços
  psql(`insert into public.weekly_sales (user_id, avatar_id, account_id, week_start, amount, currency, sales_count, notes) values ('${uid}', '${aid}', '${acc}', date_trunc('week', current_date)::date, 987654321.99, 'CLP', 123456789, '${long}${long}${long}'), ('${uid}', '${aid}', '${acc}', date_trunc('week', current_date)::date - 7, 123456789.5, 'HUF', 7, null)`);
  await page.reload();
  await page.getByRole('heading', { name: 'Hoje', exact: true }).waitFor({ timeout: 30000 });
  const results = [];
  const check = async (name) => {
    await page.waitForTimeout(350);
    const extra = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    results.push(`${extra > 0 ? '✗' : '✓'} ${name}${extra > 0 ? ` (sobra ${extra}px)` : ''}`);
    await page.screenshot({ path: `${S}90-stress-${name}.png`, fullPage: true });
  };
  await check('hoje');
  await page.getByRole('link', { name: 'Países' }).click();
  await page.getByRole('heading', { name: 'Países', exact: true }).waitFor();
  await check('paises');
  await page.getByRole('link', { name: /Dottoressa/ }).click();
  await page.getByRole('heading', { name: /Dottoressa/ }).waitFor();
  await check('avatar-geral');
  for (const [tab, name] of [['Conta atual', 'conta'], ['Aquecimento', 'aquecimento'], ['Links', 'links'], ['Vídeos', 'videos'], ['Perfis de exemplo', 'perfis'], ['Kit de reposição', 'kit'], ['Vendas', 'avatar-vendas'], ['Histórico', 'historico'], ['Anotações', 'notas']]) {
    await page.getByRole('tab', { name: new RegExp('^' + tab) }).click();
    await check(name);
  }
  await page.getByRole('tab', { name: /^Conta atual/ }).click();
  const checkDialog = async (name) => {
    await page.waitForTimeout(500);
    const extra = await page.evaluate(() => { const p = document.querySelector('dialog[open] .cda-dialog-panel'); const b = p.querySelector('.overflow-y-auto'); return b.scrollWidth - b.clientWidth; });
    results.push(`${extra > 0 ? '✗' : '✓'} ${name}${extra > 0 ? ` (sobra ${extra}px)` : ''}`);
    await page.screenshot({ path: `${S}90-stress-${name}.png` });
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('dialog[open]'));
  };
  await page.getByRole('button', { name: 'Editar', exact: true }).click();
  await checkDialog('formulario-conta');
  await page.getByRole('button', { name: 'Conta caiu', exact: true }).click();
  await checkDialog('formulario-conta-caiu');
  await page.getByRole('link', { name: 'Planilha' }).click();
  await page.getByRole('heading', { name: 'Planilha' }).waitFor();
  await check('planilha-contas');
  for (const [tab, name] of [['Avatares', 'planilha-avatares'], ['Vendas', 'planilha-vendas'], ['Celulares', 'planilha-celulares'], ['Perfis anti-detect', 'planilha-perfis']]) {
    await page.getByRole('tab', { name: new RegExp('^' + tab) }).click();
    await check(name);
  }
  await page.getByRole('link', { name: 'Vendas' }).click();
  await page.getByRole('heading', { name: 'Vendas', exact: true }).waitFor();
  await check('vendas');
  await page.getByRole('button', { name: 'Mais', exact: true }).click();
  await page.locator('dialog[open]').getByRole('link', { name: 'Quedas de contas' }).click();
  await page.getByRole('heading', { name: 'Quedas', exact: true }).waitFor();
  await check('quedas');
  await s.more('Infraestrutura');
  await check('infra-celulares');
  await page.getByRole('tab', { name: /Perfis anti-detect/ }).click();
  await check('infra-perfis');
  await s.more('Configurações');
  await check('config');
  console.log(results.join('\n'));
  console.log('problemas no console:', s.problems.length ? s.problems.join('\n') : '(nenhum)');
  await s.browser.close();
  resetData();
  if (results.some((line) => line.startsWith('✗')) || s.problems.length) process.exit(1);
  console.log('\nTUDO CERTO ✅');
})().catch((e) => { console.error('FALHOU: ' + e.message.split('\n').slice(0, 8).join('\n')); process.exit(1); });
