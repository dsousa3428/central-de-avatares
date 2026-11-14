// Roda todos os testes do Jornada 60, um depois do outro.
// Uso: node dev/jornada-60/testes/todos.cjs
const { spawnSync } = require('child_process');
const path = require('path');

const arquivos = ['contas.cjs', 'fluxos.cjs', 'mensagens.cjs', 'tentacao.cjs', 'robustez.cjs', 'revisao.cjs', 'acessibilidade.cjs', 'pasta-com-acentos.cjs'];
let falhou = 0, total = 0;
for (const a of arquivos) {
  const r = spawnSync(process.execPath, [path.join(__dirname, a)], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const saida = (r.stdout || '') + (r.stderr || '');
  const ok = (saida.match(/✓ /g) || []).length, ruim = saida.split('\n').filter((l) => /^\s*✗ /.test(l));
  total += ok;
  if (r.status !== 0) {
    falhou++;
    console.log('✗ ' + a + ' (' + ok + ' ok)');
    console.log(ruim.length ? ruim.join('\n') : saida.split('\n').slice(-12).join('\n'));
  } else {
    console.log('✓ ' + a + ' (' + ok + ' conferências)');
  }
}
console.log('\n' + (falhou ? '✗ ' + falhou + ' arquivo(s) com falha' : '✓ tudo certo') + ' — ' + total + ' conferências aprovadas');
process.exit(falhou ? 1 : 0);
