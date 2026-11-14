// O arquivo guardado em uma pasta com espaços e acentos (como "Área de Trabalho/Jornada 60") abre e salva igual.
// Uso: node dev/jornada-60/testes/pasta-com-acentos.cjs
const fs = require('fs');
const os = require('os');
const path = require('path');
const A = require('./apoio.cjs');
const { confere } = A;

(async () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'j60-'));
  const pasta = path.join(base, 'Área de Trabalho', 'Jornada 60 (minha)');
  fs.mkdirSync(pasta, { recursive: true });
  const arquivo = path.join(pasta, 'index.html');
  fs.copyFileSync(A.ARQUIVO, arquivo);
  const endereco = 'file://' + arquivo.split(path.sep).map(encodeURIComponent).join('/');

  const nav = await A.novoNavegador();
  const { contexto, pagina: p, registro } = await A.novaPagina(nav);
  await p.goto(endereco + '?hoje=2026-12-01'); await p.waitForFunction(() => window.JORNADA60_OK === true);
  await A.configurar(p, { nome: 'Davi' });
  await p.waitForSelector('#b-continuar'); await p.click('#b-continuar'); await p.click('#b-venci'); await p.waitForSelector('#b-corrigir-hoje');
  await p.reload(); await p.waitForFunction(() => window.JORNADA60_OK === true);
  confere((await p.innerText('#num-seq')) === '1', 'abre de uma pasta com espaços e acentos, e o progresso continua lá depois de recarregar');
  await p.click('#teste-mais');
  await p.waitForSelector('#b-continuar');
  confere(decodeURIComponent(p.url()).endsWith('index.html?hoje=2026-12-02'), 'o botão “+1 dia” mantém o endereço certo', p.url());
  await p.click('.faixa.teste a');
  await p.waitForFunction(() => window.JORNADA60_OK === true && !document.querySelector('.faixa.teste'));
  confere(await p.isVisible('#g-comecar') && !p.url().includes('hoje='), '“sair” do modo de teste volta para o app normal (que não enxerga os dados de teste)');
  confere(registro.erros.length === 0 && registro.console.length === 0 && registro.rede.length === 0, 'sem erros, avisos ou rede', registro);
  await contexto.close();
  await nav.close();
  process.exit(A.resumo() ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
