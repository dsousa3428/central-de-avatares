// Primeira olhada: abre, configura e tira fotos (celular).
const fs = require('fs');
const path = require('path');
const A = require('./apoio.cjs');
(async () => {
  fs.mkdirSync(A.CAPTURAS, { recursive: true });
  const nav = await A.novoNavegador();
  const { pagina, registro } = await A.novaPagina(nav);
  await pagina.goto(A.url('2026-12-01'));
  await pagina.screenshot({ path: path.join(A.CAPTURAS, '01-boas-vindas.png') });
  await A.configurar(pagina, { nome: 'Davi', recompensas: [{ dia: 3, nome: 'Mouse pad novo', link: 'https://exemplo.com/mousepad', preco: '49,90', emoji: '🖱️' }, { dia: 7, nome: 'Fone de ouvido', preco: '199', emoji: '🎧' }] });
  await pagina.waitForSelector('#b-continuar');
  await pagina.screenshot({ path: path.join(A.CAPTURAS, '02-mensagem.png'), fullPage: true });
  await pagina.click('#b-continuar');
  await pagina.waitForSelector('#b-venci');
  await pagina.waitForTimeout(600);
  await pagina.screenshot({ path: path.join(A.CAPTURAS, '03-inicio.png'), fullPage: true });
  console.log('console:', registro.console, 'erros:', registro.erros, 'rede:', registro.rede);
  console.log(JSON.stringify(await A.contas(pagina)));
  await nav.close();
})().catch((e) => { console.error(e); process.exit(1); });
