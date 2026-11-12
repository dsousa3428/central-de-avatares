// Estrutura do avatar (site, entregável, checkout, automação) e o lembrete durante o aquecimento.
import assert from "node:assert/strict";
import { test } from "node:test";
import { structuresToBuild } from "../../src/lib/selectors.ts";
import { pendingLabels, readStructure, setStructureDone, STRUCTURE, structureProgress } from "../../src/lib/structure.ts";
import { buildDays, DEFAULT_WARMUP_PLAN } from "../../src/lib/warmup.ts";
import { buildWarnings } from "../../src/lib/warnings.ts";

const TODAY = "2026-11-12";

test("estrutura: os quatro passos, na ordem em que são feitos", () => {
  assert.deepEqual(STRUCTURE.map((step) => step.key), ["site", "entregavel", "checkout", "automacao"]);
  assert.deepEqual(readStructure(null).map((step) => step.done), [false, false, false, false]);
  assert.deepEqual(structureProgress(undefined), { done: 0, total: 4, pending: readStructure(null), complete: false });
});

test("estrutura: marcar e desmarcar guarda só o que está pronto, sem mexer no resto do kit", () => {
  const kit = { bio: "Frate erborista", highlights: [{ id: "1", title: "Chi sono", text: "" }] };
  const one = setStructureDone(kit, "site", true);
  assert.deepEqual(one, { ...kit, structure: { site: true } });
  assert.equal(kit.structure, undefined); // o kit original não é alterado
  assert.equal(setStructureDone(one, "site", true), one); // já estava assim: devolve o mesmo (ninguém grava à toa)
  const two = setStructureDone(one, "checkout", true);
  assert.deepEqual(two.structure, { site: true, checkout: true });
  assert.deepEqual(setStructureDone(two, "site", false).structure, { checkout: true });
  const progress = structureProgress(two);
  assert.equal(progress.done, 2);
  assert.equal(progress.complete, false);
  assert.equal(pendingLabels(progress), "Entregável e Automação");
  const all = ["site", "entregavel", "checkout", "automacao"].reduce((acc, key) => setStructureDone(acc, key, true), kit);
  assert.equal(structureProgress(all).complete, true);
  assert.equal(pendingLabels(structureProgress(all)), "");
  assert.equal(pendingLabels(structureProgress(setStructureDone(all, "automacao", false))), "Automação");
});

test("estrutura: dado estranho guardado no kit não quebra a leitura", () => {
  for (const structure of ["texto", 3, null, ["site"], { site: "sim", checkout: 1, outro: true }]) {
    assert.deepEqual(readStructure({ structure }).map((step) => step.done), [false, false, false, false]);
  }
  assert.deepEqual(readStructure({ structure: { site: true, automacao: true } }).map((step) => step.done), [true, false, false, true]);
});

// --- quem aparece em "Montar a estrutura" na tela Hoje, e o aviso no fim do aquecimento ---

const avatar = (id, name, extra = {}) => ({ id, name, country_id: "it", status: "ativo", position: 0, kit: {}, ...extra });
const account = (id, avatar_id, extra = {}) => ({
  id, avatar_id, generation: 1, handle: id, email: null, phone_id: null, profile_id: null, proxy: null,
  created_on: "2026-11-01", status: "aquecendo", fell_on: null, fall_reason: null, checklist: null, ...extra,
});
const warmup = (id, account_id, start, doneUpTo = 0) => ({
  id, account_id, start_date: start, finished_at: null, created_at: id,
  days: buildDays(start, DEFAULT_WARMUP_PLAN).map((day) => (day.use && day.n <= doneUpTo ? { ...day, done: true, done_at: "x" } : day)),
});
const base = (extra = {}) => ({
  countries: [{ id: "it", name: "Itália", flag: "🇮🇹", currency: "EUR", position: 0 }],
  avatars: [], accounts: [], phones: [], profiles: [], warmups: [], sales: [], activity: [], settings: null, ...extra,
});

test("montar a estrutura: só avatares ativos com a conta aquecendo e algo por fazer; quem descansa hoje vem primeiro", () => {
  const db = base({
    avatars: [
      avatar("a1", "Usa hoje"), // 12/11 é o dia 1 do calendário dele: dia de uso
      avatar("a2", "Descansa hoje", { kit: { structure: { site: true } } }), // 12/11 é o dia 2: descanso
      avatar("a3", "Estrutura pronta", { kit: { structure: { site: true, entregavel: true, checkout: true, automacao: true } } }),
      avatar("a4", "Conta ativa"), // já saiu do aquecimento: não é mais cobrado aqui
      avatar("a5", "Pausado", { status: "pausado" }),
      avatar("a6", "Sem calendário"),
      avatar("a7", "Sem conta"),
    ],
    accounts: [
      account("c1", "a1"), account("c2", "a2"), account("c3", "a3"),
      account("c4", "a4", { status: "ativa" }), account("c5", "a5"), account("c6", "a6"),
    ],
    warmups: [warmup("w1", "c1", "2026-11-12"), warmup("w2", "c2", "2026-11-11", 1), warmup("w3", "c3", "2026-11-11", 1), warmup("w5", "c5", "2026-11-11", 1)],
  });
  const rows = structuresToBuild(db, TODAY);
  assert.deepEqual(rows.map((row) => `${row.avatar.name}|${row.restingToday}|${row.progress.done}`), [
    "Descansa hoje|true|1",
    "Sem calendário|false|0",
    "Usa hoje|false|0",
  ]);
});

test("aviso: o aquecimento terminou e a estrutura ainda não está pronta", () => {
  const db = base({
    avatars: [avatar("a1", "Fra' Salvio", { kit: { structure: { site: true, entregavel: true } } })],
    accounts: [account("c1", "a1", { handle: "fra.salvio" })],
    warmups: [warmup("w1", "c1", "2026-11-01", 9)], // todos os dias de uso feitos e o calendário já acabou
    sales: [{ id: "s1", avatar_id: "a1", week_start: "2026-11-02", amount: 0, currency: "EUR" }], // (semana passada lançada)
  });
  const list = buildWarnings(db, TODAY);
  assert.deepEqual(list.map((warning) => warning.kind), ["estrutura_pendente", "pronta"]);
  const [pending] = list;
  assert.equal(pending.level, "warn");
  assert.equal(pending.title, "Fra' Salvio: falta terminar a estrutura");
  assert.equal(pending.text, "O aquecimento de @fra.salvio terminou, mas ainda falta: Checkout e Automação.");
  assert.equal(pending.href, "/avatar?id=a1");
  assert.equal(pending.id, "estrutura:a1:checkout+automacao"); // o que falta faz parte da identidade: dispensado, volta se a lista mudar
  // estrutura completa: só a boa notícia
  db.avatars[0].kit = { structure: { site: true, entregavel: true, checkout: true, automacao: true } };
  assert.deepEqual(buildWarnings(db, TODAY).map((warning) => warning.kind), ["pronta"]);
  // durante o aquecimento não há aviso (a tela Hoje mostra "Montar a estrutura")
  db.avatars[0].kit = {};
  db.warmups = [warmup("w1", "c1", "2026-11-10", 3)];
  assert.deepEqual(buildWarnings(db, TODAY).map((warning) => warning.kind), []);
});

test("aviso: conta já ativa com a estrutura começada e não terminada", () => {
  const sales = (id) => ({ id: `s-${id}`, avatar_id: id, week_start: "2026-11-02", amount: 0, currency: "EUR" }); // (semana passada lançada)
  const db = base({
    avatars: [
      avatar("a1", "Pela metade", { kit: { structure: { site: true, checkout: true } } }),
      avatar("a2", "Nunca marcou"), // já vendia antes de a estrutura existir no painel: não é cobrado
      avatar("a3", "Completo", { kit: { structure: { site: true, entregavel: true, checkout: true, automacao: true } } }),
      avatar("a4", "Pausado", { status: "pausado", kit: { structure: { site: true } } }),
      avatar("a5", "Restrita", { kit: { structure: { site: true } } }),
    ],
    accounts: [
      account("c1", "a1", { status: "ativa", handle: "metade" }),
      account("c2", "a2", { status: "ativa" }),
      account("c3", "a3", { status: "ativa" }),
      account("c4", "a4", { status: "ativa" }),
      account("c5", "a5", { status: "restrita" }),
    ],
    sales: ["a1", "a2", "a3", "a5"].map(sales),
  });
  const list = buildWarnings(db, TODAY);
  assert.deepEqual(list.map((warning) => `${warning.kind}|${warning.avatarIds}`), ["estrutura_pendente|a1"]);
  assert.equal(list[0].text, "@metade já está ativa, mas ainda falta: Entregável e Automação.");
  assert.equal(list[0].id, "estrutura:a1:entregavel+automacao"); // o mesmo id do aviso do fim do aquecimento
  assert.deepEqual(list[0].accountIds, ["c1"]);
});
