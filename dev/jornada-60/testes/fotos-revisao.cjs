// Não é teste: fotografa as janelas que mudaram com as correções da revisão, para a conferência visual.
// Uso: node dev/jornada-60/testes/fotos-revisao.cjs      (grava em dev/jornada-60/capturas/)
const fs = require('fs');
const path = require('path');
const A = require('./apoio.cjs');

const CHAVE = 'jornada60:teste';
const somar = (s, n) => new Date(Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)) + n * 86400000).toISOString().slice(0, 10);
const vencidos = (inicio, n) => { const o = {}; for (let i = 0; i < n; i++) o[somar(inicio, i)] = 'v'; return o; };
const pronto = (p) => p.waitForFunction(() => window.JORNADA60_OK === true);
const estado = () => ({
  app: 'jornada60', versao: 1, criadoEm: '2026-12-01', salvamentoConferido: true,
  perfil: { nome: 'Davi', compromisso: '', inicio: '2026-12-01', motivos: ['Minha família'], confianca: { nome: '', whatsapp: '' } },
  recompensas: [{ id: 'a', dia: 3, nome: 'Livro novo', emoji: '📚', link: '', preco: '', liberadaEm: '2026-12-03', resgatadaEm: '2026-12-04' }],
  checkins: vencidos('2026-12-01', 6), saidas: ['Orar'], tentacoesVencidas: 0,
  mensagens: { vistas: {}, dia: null }, backup: { ultimoEm: '2026-12-05', lembreteEm: null }, finalVistoEm: null,
});

(async () => {
  fs.mkdirSync(A.CAPTURAS, { recursive: true });
  const nav = await A.novoNavegador();
  for (const [nome, viewport] of [['320', { width: 320, height: 640 }], ['390', { width: 390, height: 844 }], ['1280', { width: 1280, height: 800 }]]) {
    const { contexto, pagina: p } = await A.novaPagina(nav, { viewport, dpr: 2 });
    const foto = async (qual) => { await p.waitForTimeout(450); await p.screenshot({ path: path.join(A.CAPTURAS, 'revisao-' + qual + '-' + nome + '.png') }); };
    await p.goto(A.url('2026-12-06')); await pronto(p);
    await p.evaluate(([k, s]) => localStorage.setItem(k, s), [CHAVE, JSON.stringify(estado())]);
    await p.goto(A.url('2026-12-06')); await pronto(p);
    await p.click('#b-continuar'); await p.waitForSelector('#checkin');
    await p.click('#b-corrigir-hoje'); await foto('corrigir-hoje');
    await p.keyboard.press('Escape'); await p.waitForSelector('dialog', { state: 'detached' });
    await p.click('.premio-card.resg [data-acao="premio-desfazer"]'); await foto('desmarcar-resgate');
    await p.keyboard.press('Escape'); await p.waitForSelector('dialog', { state: 'detached' });
    await p.click('#b-historico'); await p.click('#hist-lista [data-data="2026-12-04"]'); await foto('corrigir-dia-passado');
    await p.keyboard.press('Escape'); await p.keyboard.press('Escape'); await p.waitForSelector('dialog', { state: 'detached' });
    // dados que o app não abre → restaurar um backup por cima
    await p.evaluate((k) => localStorage.setItem(k, '{{{ isto não é json'), CHAVE);
    await p.goto(A.url('2026-12-06')); await pronto(p);
    await p.click('[data-acao="importar"]'); await foto('restaurar-com-dados-ilegiveis');
    await p.fill('#i-texto', JSON.stringify(estado()));
    await p.click('#i-restaurar'); await foto('confirmar-substituir');
    await contexto.close();
  }
  await nav.close();
  console.log('fotos em', A.CAPTURAS);
})().catch((e) => { console.error(e); process.exit(1); });
