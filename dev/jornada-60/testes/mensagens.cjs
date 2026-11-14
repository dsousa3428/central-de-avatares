// Banco de mensagens: confere o que está DENTRO do index.html (é ele que vale) e o sorteio sem repetição.
// Uso: node dev/jornada-60/testes/mensagens.cjs
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const A = require('./apoio.cjs');
const { confere } = A;

const html = fs.readFileSync(A.ARQUIVO, 'utf8');
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
const versiculos = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'versiculos', 'versiculos.json'), 'utf8'));
const textoPorRef = {};
Object.values(versiculos).forEach((v) => { textoPorRef[v.ref] = v.texto; });

const frases = (t) => (t.match(/[^.!?]+[.!?]+[”’)]*/g) || []).filter((s) => s.trim());
const somar = (s, n) => new Date(Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)) + n * 86400000).toISOString().slice(0, 10);

function conferirBanco() {
  console.log('\n1. O banco que está dentro do index.html');
  const caixa = { window: {} };
  vm.runInNewContext(scripts[1], caixa);
  const b = caixa.window.JORNADA60_BANCO;
  confere(!!b, 'o bloco de mensagens é lido sem erro');
  const tam = (k) => (Array.isArray(b[k]) ? b[k].length : 0);
  const fases = ['fase1', 'fase2', 'fase3', 'fase4'];
  const total = fases.reduce((s, k) => s + tam(k), 0);
  confere(total >= 80, 'as 4 fases somam ' + total + ' entradas (mínimo 80)');
  confere(tam('fase1') >= 20 && tam('fase2') >= 20, 'fases 1 e 2 com 20 ou mais cada (' + tam('fase1') + ' e ' + tam('fase2') + ')');
  confere(tam('fase3') >= 19 && tam('fase4') >= 20, 'fase 3 cobre os 19 dias dela e a fase 4 os 20 (' + tam('fase3') + ' e ' + tam('fase4') + ')');
  confere(tam('recomeco') >= 10 && tam('tentacao') >= 10 && tam('recompensa') >= 5, 'extras: recomeço ' + tam('recomeco') + ', tentação ' + tam('tentacao') + ', recompensa ' + tam('recompensa'));
  confere(tam('queda') >= 1 && tam('vitoria') >= 1 && tam('final') >= 1, 'mensagens da recaída, da tentação vencida e do dia 60');

  let errados = [], semFormato = [], repetidos = [], frasesFora = [];
  const conjuntos = Object.keys(b).filter((k) => Array.isArray(b[k]));
  let quantos = 0;
  conjuntos.forEach((k) => {
    const refs = new Set(), missoes = new Set();
    b[k].forEach((e) => {
      quantos++;
      if (!e.ref || !e.versiculo || !e.mensagem || !/^[\wÀ-ÿ ]+ \d+:\d+(-\d+)?$/.test(e.ref)) semFormato.push(k + ': ' + e.ref);
      if (textoPorRef[e.ref] !== e.versiculo) errados.push(k + ': ' + e.ref);
      if (refs.has(e.ref)) repetidos.push(k + ': ' + e.ref);
      refs.add(e.ref);
      if (fases.concat(['recomeco', 'recompensa']).includes(k)) {
        if (!e.missao || e.missao.length < 15) semFormato.push(k + ' (missão): ' + e.ref);
        if (missoes.has(e.missao)) repetidos.push(k + ' (missão repetida): ' + e.ref);
        missoes.add(e.missao);
        const n = frases(e.mensagem).length;
        if (n < 2 || n > 3) frasesFora.push(k + ': ' + e.ref + ' (' + n + ')');
      }
    });
  });
  confere(semFormato.length === 0, quantos + ' entradas com referência (livro capítulo:versículo), versículo e mensagem', semFormato);
  confere(errados.length === 0, 'todo versículo é igual, letra por letra, ao texto conferido da Almeida de 1911 (ortografia atualizada)', errados);
  confere(repetidos.length === 0, 'sem versículo nem missão repetidos dentro de um mesmo conjunto', repetidos);
  confere(frasesFora.length === 0, 'mensagens do dia com 2 a 3 frases', frasesFora);

  // mensagens de reserva (dentro do código do app)
  const reserva = [...scripts[2].matchAll(/ref: "([^"]+)",\s*versiculo: "([^"]+)"/g)].map((m) => ({ ref: m[1], versiculo: m[2] }));
  confere(reserva.length >= 7 && reserva.every((e) => textoPorRef[e.ref] === e.versiculo), 'as ' + reserva.length + ' mensagens de reserva também têm o versículo conferido', reserva.filter((e) => textoPorRef[e.ref] !== e.versiculo));

  // as 30 referências que o dono pediu como base
  const base = ['1 Coríntios 10:13', 'Filipenses 4:13', 'Isaías 41:10', 'Josué 1:9', 'Salmos 51:10', 'Romanos 12:2', 'Gálatas 5:1', 'Tiago 4:7', 'Provérbios 24:16', 'Lamentações 3:22-23',
    '2 Coríntios 5:17', 'Mateus 26:41', 'Hebreus 12:11', 'Gálatas 6:9', '2 Timóteo 1:7', 'Romanos 8:37', 'Isaías 40:31', 'Provérbios 4:23', '1 João 1:9', 'Miqueias 7:8', 'João 8:36',
    'Provérbios 25:28', '1 Coríntios 9:25-27', 'Salmos 119:11', 'Filipenses 1:6', 'Provérbios 16:32', 'Romanos 6:14', '2 Coríntios 12:9', 'Salmos 40:1-2', 'Filipenses 3:13-14'];
  const usadas = new Set();
  conjuntos.forEach((k) => b[k].forEach((e) => usadas.add(e.ref)));
  confere(base.every((r) => usadas.has(r)), 'as 30 referências da lista base estão no banco', base.filter((r) => !usadas.has(r)));

  // o conteúdo não presume qual é o hábito
  const proibidas = /cigarr|fumar|fumo|álcool|alcool|bebid|beber|pornograf|drog|açúcar|acucar|apost|cassino|maconha|vício|vicio|masturb|compras compulsiv/i;
  const presume = [];
  conjuntos.forEach((k) => b[k].forEach((e) => { if (proibidas.test(e.mensagem + ' ' + (e.missao || ''))) presume.push(k + ': ' + e.ref); }));
  confere(presume.length === 0, 'nenhuma mensagem ou missão presume qual é o hábito', presume);
  const aspas = [];
  conjuntos.forEach((k) => b[k].forEach((e) => { if (/["\\]/.test(e.versiculo + e.mensagem + (e.missao || ''))) aspas.push(e.ref); }));
  confere(aspas.length === 0, 'nenhum texto usa aspas retas (que quebrariam a edição manual)', aspas);
  return b;
}

async function sorteio(nav, banco) {
  console.log('\n2. Fases e sorteio sem repetição (60 dias seguidos)');
  let { contexto, pagina: p, registro } = await A.novaPagina(nav);
  await p.goto(A.url('2026-01-01'));
  await p.waitForFunction(() => window.JORNADA60_OK === true);
  await A.configurar(p, { nome: 'Teste' });
  const dias = [];
  let dia = '2026-01-01';
  for (let n = 1; n <= 60; n++) {
    if (n > 1) {
      dia = somar(dia, 1);
      await p.evaluate((d) => { window.__j60.definirHoje(d); window.dispatchEvent(new Event('focus')); }, dia);
    }
    await p.waitForSelector('#b-continuar');
    const md = (await A.estado(p)).mensagens.dia;
    dias.push({ n, conjunto: md.conjunto, id: md.id, rotulo: await p.innerText('#msg-dia') });
    await p.click('#b-continuar');
    await p.click('#b-venci');
    if (n < 60) await p.waitForSelector('#b-corrigir-hoje');
  }
  await p.waitForSelector('#b-ver-jornada');
  const esperada = (n) => (n <= 7 ? 'fase1' : n <= 21 ? 'fase2' : n <= 40 ? 'fase3' : 'fase4');
  confere(dias.every((d) => d.conjunto === esperada(d.n)), 'fases certas: 1–7, 8–21, 22–40 e 41–60', dias.filter((d) => d.conjunto !== esperada(d.n)));
  confere(dias.every((d) => d.rotulo === 'Dia ' + d.n + ' de 60'), '“Dia X de 60” acompanha a sequência do dia 1 ao 60');
  confere(new Set(dias.map((d) => d.conjunto + d.id)).size === 60, 'nenhuma mensagem repetida nos 60 dias');
  confere(registro.erros.length === 0 && registro.console.length === 0, 'sem erros no console', registro);
  await contexto.close();

  console.log('\n3. Recomeços: a fase 1 só repete depois de mostrar todas');
  ({ contexto, pagina: p, registro } = await A.novaPagina(nav));
  await p.goto(A.url('2026-03-01'));
  await p.waitForFunction(() => window.JORNADA60_OK === true);
  await A.configurar(p, { nome: 'Teste' });
  const fase1 = [], recomeco = [];
  dia = '2026-03-01';
  const ciclos = 14;      // cada ciclo: vence, vence, recai
  for (let c = 0; c < ciclos; c++) {
    for (let k = 0; k < 3; k++) {
      if (c + k > 0) {
        dia = somar(dia, 1);
        await p.evaluate((d) => { window.__j60.definirHoje(d); window.dispatchEvent(new Event('focus')); }, dia);
      }
      await p.waitForSelector('#b-continuar');
      const md = (await A.estado(p)).mensagens.dia;
      (md.conjunto === 'recomeco' ? recomeco : fase1).push(md.conjunto + ':' + md.id);
      await p.click('#b-continuar');
      if (k < 2) { await p.click('#b-venci'); await p.waitForSelector('#b-corrigir-hoje'); }
      else {
        await p.click('#b-recai');
        await p.locator('dialog').last().getByRole('button', { name: 'Registrar recaída', exact: true }).click();
        await p.click('#b-graca-ok');
        await p.waitForSelector('dialog', { state: 'detached' });
      }
    }
  }
  const n1 = banco.fase1.length, nr = banco.recomeco.length;
  confere(fase1.every((x) => x.startsWith('fase1:')) && fase1.length === 1 + 2 * ciclos, 'dias 1 a 3 sempre na fase 1 (' + fase1.length + ' mensagens em ' + ciclos + ' recomeços)');
  confere(new Set(fase1.slice(0, n1)).size === n1, 'as primeiras ' + n1 + ' mensagens da fase 1 são todas diferentes');
  confere(fase1[n1] !== fase1[n1 - 1] && new Set(fase1.slice(n1)).size === fase1.length - n1, 'depois de esgotar, recomeça outra rodada sem repetir a última');
  confere(recomeco.length === ciclos - 1 && new Set(recomeco.slice(0, nr)).size === Math.min(nr, recomeco.length), 'mensagens de recomeço: as ' + Math.min(nr, recomeco.length) + ' primeiras são diferentes', recomeco.length);
  confere(nr >= recomeco.length || recomeco[nr] !== recomeco[nr - 1], 'recomeço também só repete depois de mostrar todas');
  confere(registro.erros.length === 0 && registro.console.length === 0, 'sem erros no console', registro);
  await contexto.close();
}

async function bancoQuebrado(nav) {
  console.log('\n4. Se a edição do banco der errado, o app continua abrindo');
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'j60-'));
  const gravar = (nome, conteudo) => { const c = path.join(pasta, nome); fs.writeFileSync(c, conteudo); return 'file://' + c + '?hoje=2026-12-01'; };

  // 4a. vírgula apagada (erro de digitação)
  let alterado = html.replace('ref: "Deuteronômio 30:19",', 'ref: "Deuteronômio 30:19"');   // (Josué 1:9 também aparece no comentário de instruções)
  confere(alterado !== html, 'arquivo de teste com uma vírgula apagada');
  let { contexto, pagina: p, registro } = await A.novaPagina(nav);
  await p.goto(gravar('virgula.html', alterado));
  await p.waitForFunction(() => window.JORNADA60_OK === true);
  confere(await p.isVisible('#g-comecar'), 'o app abre mesmo com o banco quebrado');
  const aviso = await p.innerText('.faixa.atencao');
  confere(/banco de mensagens/.test(aviso) && /linha \d+/.test(aviso), 'avisa do erro e da linha aproximada', aviso);
  await A.configurar(p, { nome: 'Teste' });
  await p.waitForSelector('#b-continuar');
  confere((await p.innerText('.versiculo cite')) === 'Filipenses 4:13', 'usa a mensagem de reserva');
  await p.click('#b-continuar'); await p.click('#b-venci'); await p.waitForSelector('#b-corrigir-hoje');
  confere((await A.contas(p)).seqAtual === 1, 'o check-in funciona normalmente');
  confere(registro.erros.length === 1 && /SyntaxError|Unexpected/.test(registro.erros[0]), 'o único erro registrado é o de digitação do banco', registro.erros);
  await contexto.close();

  // 4b. um conjunto vazio
  alterado = html.replace('\n};\n</script>\n\n<script>\n(function () {', '\n};\nwindow.JORNADA60_BANCO.fase2 = [];\n</script>\n\n<script>\n(function () {');
  confere(alterado !== html, 'arquivo de teste com a fase 2 vazia');
  ({ contexto, pagina: p, registro } = await A.novaPagina(nav));
  await p.goto(gravar('vazio.html', alterado));
  await p.waitForFunction(() => window.JORNADA60_OK === true);
  confere(/incompleto \(fase2\)/.test(await p.innerText('.faixa.atencao')), 'conjunto vazio: avisa qual parte está incompleta');
  confere(registro.erros.length === 0, 'sem erro de script', registro.erros);
  await contexto.close();

  // 4c. uma entrada nova, copiada de outra (como o LEIAME ensina)
  const bloco = '    {\n      ref: "Salmos 23:4",\n      versiculo: "Ainda que eu andasse pelo vale da sombra da morte, não temeria mal algum, porque tu estás comigo; a tua vara e o teu cajado me consolam.",\n      mensagem: "Entrada de teste. Ela foi colada à mão.",\n      missao: "Missão de teste, colada à mão."\n    },\n';
  alterado = html.replace('  fase1: [\n', '  fase1: [\n' + bloco);
  ({ contexto, pagina: p, registro } = await A.novaPagina(nav));
  await p.goto(gravar('nova.html', alterado));
  await p.waitForFunction(() => window.JORNADA60_OK === true);
  const n = await p.evaluate(() => window.__j60.banco().fase1.length);
  const original = [...html.matchAll(/\n  fase1: \[/g)].length;
  confere(original === 1 && n === 25 && !(await p.isVisible('.faixa.atencao')), 'uma entrada colada à mão entra no sorteio (fase 1 com 25), sem aviso');
  await contexto.close();

  // 4d. erro no código do app: a página explica em vez de ficar em branco
  alterado = html.replace("<script>\n(function () {\n'use strict';", "<script>\n(function () {\n'use strict'; )(");
  confere(alterado !== html, 'arquivo de teste com o código do app quebrado');
  ({ contexto, pagina: p, registro } = await A.novaPagina(nav));
  await p.goto(gravar('app.html', alterado));
  await p.waitForSelector('.falha');
  confere(/não conseguiu abrir/.test(await p.innerText('.falha')) && /Linha \d+/.test(await p.innerText('.falha pre')), 'código quebrado: mensagem clara, com a linha, em vez de tela em branco');
  await contexto.close();
  fs.rmSync(pasta, { recursive: true, force: true });
}

(async () => {
  const banco = conferirBanco();
  const nav = await A.novoNavegador();
  try {
    await sorteio(nav, banco);
    await bancoQuebrado(nav);
  } finally {
    await nav.close();
  }
  process.exit(A.resumo() ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
