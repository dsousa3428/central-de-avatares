// Contas do Jornada 60 conferidas contra uma implementação de referência, escrita à parte (aqui no teste).
// Uso: node dev/jornada-60/testes/contas.cjs
const A = require('./apoio.cjs');
const { confere } = A;

// ---------- referência: datas pelo calendário do JavaScript em UTC (só no teste) ----------
const paraData = (s) => new Date(Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)));
const paraTexto = (d) => d.toISOString().slice(0, 10);
const somar = (s, n) => paraTexto(new Date(paraData(s).getTime() + n * 86400000));
const distancia = (a, b) => Math.round((paraData(b) - paraData(a)) / 86400000);

// ---------- referência: contas da jornada, formuladas por "trechos entre recaídas" ----------
function referencia(inicio, hoje, ck) {
  const todos = [];
  for (let d = inicio; d <= hoje; d = somar(d, 1)) todos.push(d);
  let trecho = 0, concl = null, corte = todos.length;
  for (let i = 0; i < todos.length; i++) {
    const s = ck[todos[i]];
    if (s === 'r') trecho = 0;
    else if (s === 'v' && ++trecho === 60) { concl = todos[i]; corte = i + 1; break; }
  }
  const dias = todos.slice(0, corte), st = dias.map((d) => ck[d] || null);
  const contarV = (lista) => lista.filter((s) => s === 'v').length;
  const aposUltimaRecaida = (lista) => lista.slice(lista.lastIndexOf('r') + 1);
  const seqAtual = contarV(aposUltimaRecaida(st));
  let recorde = 0;
  st.map((s) => s || '-').join('').split('r').forEach((pedaco) => {      // cada pedaço é um trecho sem recaída
    let n = 0;
    for (const ch of pedaco) { if (ch === 'v') n++; recorde = Math.max(recorde, n); }
  });
  const hojeConta = !concl && todos.length > 0;
  const hojeSt = hojeConta ? (ck[hoje] || null) : null;
  const seqAteOntem = hojeConta ? contarV(aposUltimaRecaida(st.slice(0, -1))) : seqAtual;
  const diaX = Math.min(60, seqAteOntem + 1);
  const ultimaR = st.lastIndexOf('r');
  return {
    naoComecou: todos.length === 0, concluidaEm: concl, hojeSt, seqAtual, seqAteOntem, diaX, recorde,
    vencidos: contarV(st), recaidas: st.filter((s) => s === 'r').length,
    pendentes: dias.filter((d, i) => !st[i] && d < hoje),
    inicioSeq: ultimaR >= 0 ? somar(dias[ultimaR], 1) : inicio,
    previsao: concl ? concl : todos.length === 0 ? somar(inicio, 59) : hojeSt === 'r' ? somar(hoje, 60) : somar(hoje, 60 - diaX),
  };
}

// gerador pseudoaleatório com semente (para o teste ser repetível)
function semente(s) { return () => { s |= 0; s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

(async () => {
  const nav = await A.novoNavegador();
  const { contexto, pagina: p, registro } = await A.novaPagina(nav);
  await p.goto(A.url('2026-12-01'));
  await p.waitForFunction(() => window.JORNADA60_OK === true);

  console.log('\n1. Datas: somar dias, distância e dia da semana (2019 a 2032, dia por dia)');
  const dias = [];
  for (let d = '2019-01-01'; d <= '2032-12-31'; d = somar(d, 1)) dias.push(d);
  const r1 = await p.evaluate((lista) => {
    const u = window.__j60.util;
    return lista.map((d, i) => [u.somarDias(d, 1), u.somarDias(d, -1), u.diaDaSemana(d), u.diff(lista[0], d), u.dataValida(d), u.somarDias(d, 400), u.diff(d, lista[lista.length - 1])]);
  }, dias);
  let erros = 0;
  dias.forEach((d, i) => {
    const ok = r1[i][0] === somar(d, 1) && r1[i][1] === somar(d, -1) && r1[i][2] === paraData(d).getUTCDay() && r1[i][3] === i && r1[i][4] === true &&
      r1[i][5] === somar(d, 400) && r1[i][6] === dias.length - 1 - i;
    if (!ok) erros++;
  });
  confere(erros === 0, dias.length + ' dias conferidos: dia seguinte, dia anterior, dia da semana e distâncias', erros);
  const r2 = await p.evaluate(() => {
    const u = window.__j60.util;
    return {
      bissexto: [u.somarDias('2028-02-28', 1), u.somarDias('2028-02-29', 1), u.somarDias('2027-02-28', 1), u.somarDias('2100-02-28', 1), u.somarDias('2000-02-28', 1)],
      virada: [u.somarDias('2026-12-31', 1), u.somarDias('2027-01-01', -1), u.somarDias('2026-12-01', 59)],
      invalidas: ['2026-02-29', '2026-13-01', '2026-00-10', '2026-04-31', '2026-1-1', 'abc', '', null, undefined, 20261201, '2026-12-01T00:00'].map((x) => u.dataValida(x)),
      validas: ['2028-02-29', '2026-12-31', '2000-02-29'].map((x) => u.dataValida(x)),
    };
  });
  confere(JSON.stringify(r2.bissexto) === JSON.stringify(['2028-02-29', '2028-03-01', '2027-03-01', '2100-03-01', '2000-02-29']), 'anos bissextos (inclusive 2100, que não é)', r2.bissexto);
  confere(JSON.stringify(r2.virada) === JSON.stringify(['2027-01-01', '2026-12-31', '2027-01-29']), 'virada de ano e “início + 59”', r2.virada);
  confere(r2.invalidas.every((x) => x === false) && r2.validas.every((x) => x === true), 'datas inválidas são recusadas', r2);

  console.log('\n2. Contas da jornada contra a referência (4.000 histórias sorteadas)');
  const sorteio = semente(20261114);
  const casos = [];
  for (let n = 0; n < 4000; n++) {
    const inicio = somar('2025-06-01', Math.floor(sorteio() * 500));
    const hoje = somar(inicio, Math.floor(sorteio() * 170) - 4);
    const pv = 0.55 + sorteio() * 0.449, pr = sorteio() < 0.3 ? 0 : sorteio() * 0.08, vazio = sorteio() < 0.5 ? 0 : sorteio() * 0.15;
    const ck = {};
    for (let d = somar(inicio, -3); d <= somar(hoje, 3); d = somar(d, 1)) {      // inclui dias fora da jornada, que devem ser ignorados
      const x = sorteio();
      if (x < vazio) continue;
      ck[d] = sorteio() < pr ? 'r' : (sorteio() < pv ? 'v' : (sorteio() < 0.5 ? 'r' : undefined));
      if (!ck[d]) delete ck[d];
    }
    if (sorteio() < 0.5) delete ck[hoje];
    casos.push({ inicio, hoje, ck });
  }
  const r3 = await p.evaluate((lista) => lista.map((c) => {
    const r = window.__j60.util.calcular({ perfil: { inicio: c.inicio }, checkins: c.ck }, c.hoje);
    delete r.dias;
    return r;
  }), casos);
  let diferentes = 0, primeiro = null, concluidas = 0, comPendentes = 0, naoComecadas = 0;
  casos.forEach((c, i) => {
    const esperado = referencia(c.inicio, c.hoje, c.ck);
    if (esperado.concluidaEm) concluidas++;
    if (esperado.pendentes.length) comPendentes++;
    if (esperado.naoComecou) naoComecadas++;
    if (JSON.stringify(esperado) !== JSON.stringify(Object.fromEntries(Object.keys(esperado).map((k) => [k, r3[i][k]])))) {
      diferentes++;
      if (!primeiro) primeiro = { caso: c, esperado, obtido: r3[i] };
    }
  });
  confere(diferentes === 0, 'sequência, recorde, dia X, pendentes, conclusão e previsão iguais à referência nos 4.000 casos', primeiro);
  confere(concluidas > 50 && comPendentes > 500 && naoComecadas > 20, 'os casos cobrem jornadas concluídas (' + concluidas + '), com pendências (' + comPendentes + ') e ainda não começadas (' + naoComecadas + ')');

  console.log('\n3. Liberação de recompensas: “quando a sequência chega ao dia dela, e para sempre”');
  // Histórias dia a dia (um check-in por dia). Cada recompensa deve ser liberada no primeiro dia em que a sequência chega ao dia dela.
  const r4 = await p.evaluate((dados) => {
    const j = window.__j60, falhas = [];
    for (const h of dados) {
      j.definirHoje(h.inicio);
      j.definirEstado({ app: 'jornada60', versao: 1, perfil: { nome: 'T', inicio: h.inicio, motivos: ['m'] }, recompensas: h.dias.map((d, i) => ({ id: 'x' + i, dia: d, nome: 'R' + d })) });
      let seq = 0; const esperado = {};
      for (let i = 0; i < h.marcas.length; i++) {
        const dia = j.util.somarDias(h.inicio, i);
        j.definirHoje(dia);
        j.mudarCheckins((ck) => { ck[dia] = h.marcas[i]; });
        seq = h.marcas[i] === 'v' ? seq + 1 : 0;
        h.dias.forEach((d) => { if (seq >= d && !esperado[d]) esperado[d] = dia; });
      }
      const e = j.estado();
      for (const r of e.recompensas) {
        if ((r.liberadaEm || null) !== (esperado[r.dia] || null)) falhas.push({ h, dia: r.dia, obtido: r.liberadaEm, esperado: esperado[r.dia] || null });
      }
    }
    return falhas.slice(0, 3).concat(falhas.length ? [{ total: falhas.length }] : []);
  }, Array.from({ length: 300 }, () => {
    const inicio = somar('2026-01-01', Math.floor(sorteio() * 300));
    const n = 5 + Math.floor(sorteio() * 55), pr = sorteio() * 0.25;
    return { inicio, marcas: Array.from({ length: n }, () => (sorteio() < pr ? 'r' : 'v')), dias: [1, 2, 3, 5, 7, 14, 21, 30].filter(() => sorteio() < 0.7) };
  }));
  confere(r4.length === 0, '300 histórias: cada recompensa é liberada no primeiro dia em que a sequência a alcança, e continua liberada depois de recaídas', r4);

  console.log('\n4. Telefone do WhatsApp e links');
  const r5 = await p.evaluate(() => {
    const u = window.__j60.util;
    return {
      fones: ['(11) 91234-5678', '11912345678', '+55 11 91234-5678', '5511912345678', '011 91234 5678', '(11) 3123-4567', '123', '', '+1 415 555 2671', '+351 912 345 678'].map(u.foneWhats),
      links: ['https://loja.com/p/1', 'loja.com/p/1', 'http://loja.com', 'javascript:alert(1)', 'data:text/html,x', 'file:///etc/passwd', 'ftp://x.com/a', 'nada', '', ' https://a.b/c?d=1&e=2 ', 'HTTPS://LOJA.COM/X'].map(u.linkSeguro),
    };
  });
  confere(JSON.stringify(r5.fones) === JSON.stringify(['5511912345678', '5511912345678', '5511912345678', '5511912345678', '5511912345678', '551131234567', '', '', '14155552671', '351912345678']), 'números brasileiros ganham o 55; números com código de outro país ficam como estão', r5.fones);
  confere(JSON.stringify(r5.links) === JSON.stringify(['https://loja.com/p/1', 'https://loja.com/p/1', 'http://loja.com/', '', '', '', '', '', '', 'https://a.b/c?d=1&e=2', 'https://loja.com/X']), 'só links http(s) são aceitos', r5.links);

  confere(registro.erros.length === 0 && registro.console.length === 0 && registro.rede.length === 0, 'sem erros, avisos ou rede', registro);
  await contexto.close();
  await nav.close();
  process.exit(A.resumo() ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
