// Etapa (e): avisos automáticos, checklist de reposição e estatísticas de quedas.
import assert from "node:assert/strict";
import { test } from "node:test";
import { buildDays, DEFAULT_WARMUP_PLAN } from "../../src/lib/warmup.ts";
import { fallenLifetime, fallStats, NO_REASON } from "../../src/lib/falls.ts";
import {
  CHECKLIST,
  checklistProgress,
  factsOf,
  newChecklist,
  readChecklist,
  setItemDone,
  syncChecklist,
} from "../../src/lib/replacement.ts";
import { buildWarnings, countAttention, ignoredIds, nextIgnored, splitWarnings } from "../../src/lib/warnings.ts";

const TODAY = "2026-11-12"; // quinta-feira; a semana passada é a de 2 a 8 de nov

// --- montagem de dados -------------------------------------------------------

const country = (id, name, extra = {}) => ({ id, name, flag: null, currency: "EUR", position: 0, ...extra });
const avatar = (id, name, extra = {}) => ({ id, name, country_id: "it", status: "ativo", position: 0, kit: {}, ...extra });
const account = (id, avatar_id, extra = {}) => ({
  id,
  avatar_id,
  generation: 1,
  handle: id,
  email: null,
  phone_id: null,
  profile_id: null,
  proxy: null,
  created_on: "2026-09-01",
  status: "ativa",
  fell_on: null,
  fall_reason: null,
  checklist: null,
  ...extra,
});
const sale = (avatar_id, week_start, amount = 10) => ({ id: `${avatar_id}-${week_start}`, avatar_id, week_start, amount, currency: "EUR" });
const base = (extra = {}) => ({
  countries: [country("it", "Itália", { flag: "🇮🇹" }), country("us", "Estados Unidos")],
  avatars: [],
  accounts: [],
  phones: [{ id: "p1", nickname: "iPhone 12", model: null }, { id: "p2", nickname: "Moto G", model: "G54" }],
  profiles: [{ id: "f1", number: "101", name: null, proxy: null }, { id: "f2", number: "102", name: null, proxy: null }],
  warmups: [],
  sales: [],
  activity: [],
  settings: null,
  ...extra,
});
const kinds = (warnings) => warnings.map((w) => w.kind);
const only = (warnings, kind) => warnings.filter((w) => w.kind === kind);

// --- avisos ------------------------------------------------------------------

test("sem nada fora do lugar, nenhum aviso", () => {
  const db = base({
    avatars: [avatar("a1", "Fra' Salvio")],
    accounts: [account("c1", "a1", { phone_id: "p1", profile_id: "f1", proxy: "host:1" })],
    sales: [sale("a1", "2026-11-02")],
  });
  assert.deepEqual(buildWarnings(db, TODAY), []);
});

test("o mesmo celular, perfil ou proxy em duas contas vivas", () => {
  const db = base({
    avatars: [avatar("a1", "Fra' Salvio"), avatar("a2", "Nonna Maria")],
    accounts: [
      account("c1", "a1", { phone_id: "p1", profile_id: "f1", proxy: "http://Host:8000/" }),
      account("c2", "a2", { phone_id: "p1", profile_id: "f2", proxy: "host:8000", created_on: "2026-10-01" }),
    ],
    sales: [sale("a1", "2026-11-02"), sale("a2", "2026-11-02")],
  });
  const list = buildWarnings(db, TODAY);
  assert.deepEqual(kinds(list), ["recurso_duplicado", "recurso_duplicado"]); // celular e proxy (os perfis são diferentes)
  const [phone, proxy] = list;
  assert.equal(phone.level, "danger");
  assert.equal(phone.title, "Celular em 2 contas ao mesmo tempo");
  assert.match(phone.text, /^iPhone 12: Fra' Salvio · @c1 \(1ª geração\) e Nonna Maria · @c2 \(1ª geração\)\.$/);
  assert.equal(phone.href, "/avatar?id=a2&aba=conta"); // leva para a conta mais nova
  assert.deepEqual(phone.avatarIds.sort(), ["a1", "a2"]);
  assert.deepEqual(phone.accountIds, ["c1", "c2"]);
  assert.equal(phone.id, "duplo:celular:p1:c1+c2");
  // o proxy é comparado sem "http://", sem barra no fim e sem diferença de maiúsculas
  assert.equal(proxy.title, "Proxy em 2 contas ao mesmo tempo");
  assert.equal(proxy.id, "duplo:proxy:host:8000:c1+c2");
});

test("conta viva usando o que era de uma conta que caiu", () => {
  const db = base({
    avatars: [avatar("a1", "Fra' Salvio")],
    accounts: [
      account("c1", "a1", { phone_id: "p1", profile_id: "f1", status: "caida", fell_on: "2026-11-03", created_on: "2026-08-01" }),
      account("c2", "a1", { generation: 2, phone_id: "p1", profile_id: "f2", created_on: "2026-11-04" }),
    ],
    sales: [sale("a1", "2026-11-02")],
  });
  const list = buildWarnings(db, TODAY);
  assert.deepEqual(kinds(list), ["recurso_de_caida"]);
  assert.equal(list[0].title, "@c2 usa um celular de conta que caiu");
  assert.match(list[0].text, /^iPhone 12 já foi de Fra' Salvio · @c1 \(1ª geração\), caída em 03\/11\/2026\./);
  assert.deepEqual(list[0].accountIds, ["c2"]);
  assert.equal(list[0].id, "caida:c2:celular:p1:c1");
  // Reaproveitou celular, perfil e proxy: um aviso só. O que veio da mesma conta caída é dito de uma vez.
  const all = base({
    avatars: [avatar("a1", "Fra' Salvio"), avatar("a2", "Nonna Maria", { status: "pausado" })],
    accounts: [
      account("c1", "a1", { phone_id: "p1", profile_id: "f1", proxy: "host:1", status: "caida", fell_on: "2026-11-03" }),
      account("c9", "a2", { proxy: "HOST:9", status: "caida", fell_on: null }),
      account("c2", "a1", { generation: 2, phone_id: "p1", profile_id: "f1", proxy: "host:9", created_on: "2026-11-04" }),
    ],
    sales: [sale("a1", "2026-11-02")],
  });
  const [merged, ...others] = buildWarnings(all, TODAY);
  assert.equal(others.length, 0);
  assert.equal(merged.title, "@c2 usa celular, perfil e proxy de conta que caiu");
  assert.equal(
    merged.text,
    "iPhone 12 e Perfil 101 já foram de Fra' Salvio · @c1 (1ª geração), caída em 03/11/2026. host:9 já foi de Nonna Maria · @c9 (1ª geração). Reutilizar pode vincular as contas.",
  );
  assert.equal(merged.id, "caida:c2:celular:p1:c1|perfil:f1:c1|proxy:host:9:c9");
  // duas contas caídas no mesmo aparelho não geram aviso sozinhas (ninguém vivo está usando)
  const quiet = base({
    avatars: [avatar("a1", "Fra' Salvio", { status: "pausado" })],
    accounts: [
      account("c1", "a1", { phone_id: "p1", status: "caida", fell_on: "2026-11-03" }),
      account("c2", "a1", { generation: 2, phone_id: "p1", status: "caida", fell_on: "2026-11-05" }),
    ],
  });
  assert.deepEqual(buildWarnings(quiet, TODAY), []);
});

test("avatar ativo sem conta em operação (pausado não avisa)", () => {
  const db = base({
    avatars: [avatar("a1", "Fra' Salvio"), avatar("a2", "Nonna Maria"), avatar("a3", "Zio Pino", { status: "pausado" })],
    accounts: [account("c1", "a1", { status: "caida", fell_on: "2026-11-10", created_on: "2026-11-09" })],
  });
  const list = only(buildWarnings(db, TODAY), "avatar_sem_conta");
  assert.deepEqual(list.map((w) => w.title), ["Fra' Salvio está sem conta em operação", "Nonna Maria está sem conta em operação"]);
  assert.match(list[0].text, /A última conta caiu/);
  assert.match(list[1].text, /ainda não tem nenhuma conta/);
  assert.equal(list[0].action, "Subir conta");
});

test("aquecimento: atrasado, concluído e sem calendário", () => {
  const days = buildDays("2026-11-01", DEFAULT_WARMUP_PLAN); // usa nos dias 1, 3, 5, 7, 9
  const done = (list, upTo) => list.map((d) => (d.use && d.n <= upTo ? { ...d, done: true, done_at: "x" } : d));
  const db = base({
    avatars: [avatar("a1", "Atrasado"), avatar("a2", "Pronto"), avatar("a3", "Sem plano"), avatar("a4", "Em dia")],
    accounts: [
      account("c1", "a1", { status: "aquecendo" }),
      account("c2", "a2", { status: "aquecendo" }),
      account("c3", "a3", { status: "aquecendo" }),
      account("c4", "a4", { status: "aquecendo" }),
    ],
    warmups: [
      { id: "w1", account_id: "c1", start_date: "2026-11-01", days: done(days, 5), finished_at: null, created_at: "1" },
      { id: "w2", account_id: "c2", start_date: "2026-11-01", days: done(days, 9), finished_at: null, created_at: "2" },
      // (c3 já teve um calendário, mas ele foi encerrado)
      { id: "w3", account_id: "c3", start_date: "2026-10-01", days: done(days, 9), finished_at: "2026-10-12T10:00:00Z", created_at: "3" },
      { id: "w4", account_id: "c4", start_date: "2026-11-08", days: done(buildDays("2026-11-08", DEFAULT_WARMUP_PLAN), 3), finished_at: null, created_at: "4" },
    ],
    sales: ["a1", "a2", "a3", "a4"].map((id) => sale(id, "2026-11-02")),
  });
  const list = buildWarnings(db, TODAY);
  // pendências primeiro, boa notícia por último (o "Pronto" terminou de aquecer sem a estrutura montada: avisa também)
  assert.deepEqual(kinds(list), ["aquecimento_atrasado", "estrutura_pendente", "sem_calendario", "pronta"]);
  const late = list[0];
  assert.equal(late.level, "warn");
  assert.equal(late.title, "Atrasado · @c1: aquecimento atrasado");
  assert.match(late.text, /^2 dias de uso passaram sem ser marcados \(desde 07\/11\)\.$/);
  assert.equal(late.href, "/avatar?id=a1&aba=aquecimento");
  assert.equal(list[1].title, "Pronto: falta terminar a estrutura");
  assert.equal(list[2].title, "Sem plano · @c3: aquecendo sem calendário");
  assert.equal(list[3].level, "good");
  assert.equal(list[3].title, "Pronto · @c2: aquecimento concluído");
});

test("semana passada sem lançamento de vendas", () => {
  const db = base({
    avatars: [
      avatar("a1", "Lançou"),
      avatar("a2", "Faltou"),
      avatar("a3", "Pausado", { status: "pausado" }),
      avatar("a4", "Novo demais"),
      avatar("a5", "Também faltou"),
      avatar("a6", "Sem conta na semana"),
      avatar("a7", "Caiu no meio da semana"),
    ],
    accounts: [
      account("c1", "a1"),
      account("c2", "a2"),
      account("c3", "a3"),
      account("c4", "a4", { created_on: "2026-11-09" }), // a primeira conta nasceu depois do fim da semana passada
      account("c5", "a5", { created_on: "2026-11-08" }), // nasceu no domingo que fecha a semana: já conta
      account("c6", "a6", { status: "caida", fell_on: "2026-11-01" }), // caiu antes de a semana começar: nada para lançar
      account("c7", "a7", { status: "caida", fell_on: "2026-11-04" }), // estava no ar na segunda e na terça: lança
    ],
    sales: [sale("a1", "2026-11-02"), sale("a2", "2026-11-09"), sale("a2", "2026-10-26")],
  });
  const list = only(buildWarnings(db, TODAY), "semana_sem_vendas"); // (os avatares sem conta viva geram outro aviso, conferido em outro teste)
  assert.equal(list.length, 1);
  const [w] = list;
  assert.equal(w.id, "vendas:2026-11-02");
  assert.equal(w.level, "warn");
  assert.match(w.text, /^Semana de 2 a 8 de nov: falta lançar Faltou, Também faltou e Caiu no meio da semana\. Se não vendeu nada, lance 0\.$/);
  assert.equal(w.href, "/vendas?semana=2026-11-02");
  assert.deepEqual(w.avatarIds, ["a2", "a5", "a7"]);
  // lançar zero também é lançar
  db.sales.push(sale("a2", "2026-11-02", 0), sale("a5", "2026-11-02", 0), sale("a7", "2026-11-02", 0));
  assert.deepEqual(only(buildWarnings(db, TODAY), "semana_sem_vendas"), []);
});

test("checklist de reposição com itens por fazer", () => {
  const list = setItemDone(setItemDone(newChecklist(), "email", true), "perfil", true);
  const db = base({
    avatars: [avatar("a1", "Fra' Salvio")],
    accounts: [
      account("c1", "a1", { status: "caida", fell_on: "2026-11-03", checklist: newChecklist() }), // conta caída não cobra checklist
      account("c2", "a1", { generation: 2, checklist: list }),
    ],
    sales: [sale("a1", "2026-11-02")],
  });
  const [w, ...rest] = buildWarnings(db, TODAY);
  assert.equal(rest.length, 0);
  assert.equal(w.kind, "reposicao_pendente");
  assert.equal(w.level, "info");
  assert.equal(w.title, "Fra' Salvio · @c2: reposição em andamento");
  assert.match(w.text, /^Faltam 7 itens do checklist: Novo proxy, Celular, Bio e mais 4\.$/);
  // checklist completo: sem aviso
  db.accounts[1].checklist = newChecklist().map((item) => ({ ...item, done: true }));
  assert.deepEqual(buildWarnings(db, TODAY), []);
});

test("dispensar avisos: some da lista, não conta, e a lista de dispensados não cresce para sempre", () => {
  const db = base({
    avatars: [avatar("a1", "Fra' Salvio"), avatar("a2", "Nonna Maria")],
    accounts: [account("c1", "a1", { phone_id: "p1" }), account("c2", "a2", { phone_id: "p1" })],
  });
  const all = buildWarnings(db, TODAY); // celular em duas contas + vendas sem lançamento
  assert.deepEqual(kinds(all), ["recurso_duplicado", "semana_sem_vendas"]);
  assert.equal(countAttention(all), 2);

  assert.deepEqual(ignoredIds(null), []);
  assert.deepEqual(ignoredIds({ ignored_warnings: ["a", 3, "", null, "b"] }), ["a", "b"]);
  assert.deepEqual(ignoredIds({ ignored_warnings: "texto" }), []);

  let ignored = nextIgnored(["antigo:que-nao-existe-mais"], all, { add: [all[0].id, "inventado"] });
  assert.deepEqual(ignored, [all[0].id]); // só ids de avisos que existem; o velho foi descartado
  let split = splitWarnings(all, ignored);
  assert.deepEqual(kinds(split.active), ["semana_sem_vendas"]);
  assert.deepEqual(kinds(split.dismissed), ["recurso_duplicado"]);
  assert.equal(countAttention(split.active), 1);

  // uma terceira conta no mesmo celular: é outra situação, o aviso volta
  db.avatars.push(avatar("a3", "Zio Pino"));
  db.accounts.push(account("c3", "a3", { phone_id: "p1" }));
  split = splitWarnings(buildWarnings(db, TODAY), ignored);
  assert.ok(split.active.some((w) => w.kind === "recurso_duplicado" && w.title === "Celular em 3 contas ao mesmo tempo"));

  ignored = nextIgnored(ignored, all, { remove: [all[0].id] });
  assert.deepEqual(ignored, []);
});

// --- checklist de reposição --------------------------------------------------

test("checklist: os nove passos, na ordem pedida", () => {
  assert.deepEqual(
    CHECKLIST.map((item) => item.key),
    ["email", "perfil", "proxy", "celular", "bio", "link", "destaques", "provas", "aquecimento"],
  );
  const list = newChecklist();
  assert.equal(list.length, 9);
  assert.ok(list.every((item) => item.done === false && item.label));
  assert.deepEqual(checklistProgress(list), { done: 0, total: 9, pending: list, complete: false });
  assert.deepEqual(checklistProgress(null), { done: 0, total: 0, pending: [], complete: false });
});

test("checklist: o painel marca sozinho o que os dados da conta já respondem, e nunca desmarca", () => {
  const facts = factsOf({ email: " a@b.c ", profile_id: "f1", proxy: "  ", phone_id: null }, true);
  assert.deepEqual(facts, { email: true, perfil: true, proxy: false, celular: false, aquecimento: true });
  const list = newChecklist();
  const synced = syncChecklist(list, facts);
  assert.deepEqual(synced.filter((item) => item.done).map((item) => item.key), ["email", "perfil", "aquecimento"]);
  assert.equal(syncChecklist(synced, facts), synced); // nada mudou: devolve a mesma lista (ninguém grava à toa)
  // o e-mail foi apagado da conta depois: o item continua marcado
  const later = syncChecklist(synced, { ...facts, email: false, celular: true });
  assert.deepEqual(later.filter((item) => item.done).map((item) => item.key), ["email", "perfil", "celular", "aquecimento"]);
  assert.equal(list[0].done, false); // a lista original não é alterada
});

test("checklist: marcar e desmarcar à mão", () => {
  const list = newChecklist();
  const marked = setItemDone(list, "bio", true);
  assert.equal(marked.find((item) => item.key === "bio").done, true);
  assert.equal(setItemDone(marked, "bio", true), marked); // já estava assim
  assert.equal(setItemDone(marked, "nao-existe", true), marked);
  assert.equal(setItemDone(marked, "bio", false).find((item) => item.key === "bio").done, false);
  const all = list.map((item) => ({ ...item, done: true }));
  assert.equal(checklistProgress(all).complete, true);
  assert.equal(checklistProgress(setItemDone(all, "provas", false)).pending[0].key, "provas");
});

test("checklist guardado na conta: lê só o que está bem formado", () => {
  assert.equal(readChecklist(null), null);
  assert.equal(readChecklist("texto"), null);
  assert.equal(readChecklist([]), null);
  assert.deepEqual(
    readChecklist([{ key: "email", label: "Criar o e-mail", done: true }, { key: "email", done: false }, { label: "sem chave" }, null, { key: "extra", done: "sim" }]),
    [
      { key: "email", label: "Criar o e-mail", done: true },
      { key: "extra", label: "extra", done: false },
    ],
  );
});

// --- quedas ------------------------------------------------------------------

test("tempo de vida de uma conta que caiu", () => {
  assert.equal(fallenLifetime({ created_on: "2026-09-01", fell_on: "2026-09-11" }), 10);
  assert.equal(fallenLifetime({ created_on: "2026-09-01", fell_on: "2026-09-01" }), 0);
  assert.equal(fallenLifetime({ created_on: "2026-09-01", fell_on: null }), null);
  assert.equal(fallenLifetime({ created_on: "2026-09-10", fell_on: "2026-09-01" }), null); // datas trocadas não entram na média
});

test("quedas: média de vida geral, por país e por motivo", () => {
  const db = base({
    avatars: [avatar("a1", "Fra' Salvio"), avatar("a2", "Grandpa Joe", { country_id: "us" }), avatar("a3", "Órfão", { country_id: "sumiu" })],
    accounts: [
      account("c1", "a1", { status: "caida", created_on: "2026-08-01", fell_on: "2026-08-11", fall_reason: "Seguiu gente demais" }), // 10 dias
      account("c2", "a1", { generation: 2, status: "caida", created_on: "2026-08-20", fell_on: "2026-09-19", fall_reason: "  seguiu  gente DEMAIS " }), // 30 dias
      account("c3", "a2", { status: "caida", created_on: "2026-10-01", fell_on: "2026-11-10", fall_reason: "Denúncias" }), // 40 dias
      account("c4", "a2", { generation: 2, status: "caida", created_on: "2026-11-11", fell_on: null }), // sem data: conta no número, não na média
      account("c5", "a3", { status: "caida", created_on: "2026-10-01", fell_on: "2026-10-05", fall_reason: "" }), // 4 dias
      account("c6", "a1", { generation: 3 }), // viva: não entra
    ],
  });
  const stats = fallStats(db, TODAY);
  assert.equal(stats.rows.length, 5);
  assert.deepEqual(stats.rows.map((row) => row.account.id), ["c3", "c5", "c2", "c1", "c4"]); // da queda mais recente para a mais antiga; sem data por último
  assert.equal(stats.averageDays, 21); // (10 + 30 + 40 + 4) / 4
  assert.equal(stats.shortestDays, 4);
  assert.equal(stats.longestDays, 40);
  assert.equal(stats.recent, 1); // só a de 10/11 caiu nos últimos 30 dias
  assert.deepEqual(stats.byCountry, [
    { key: "us", label: "Estados Unidos", count: 2, averageDays: 40 },
    { key: "it", label: "🇮🇹 Itália", count: 2, averageDays: 20 },
    { key: "", label: "Sem país", count: 1, averageDays: 4 },
  ]);
  assert.deepEqual(stats.byReason, [
    { key: "seguiu gente demais", label: "seguiu gente DEMAIS", count: 2, averageDays: 20 },
    { key: NO_REASON.toLowerCase(), label: NO_REASON, count: 2, averageDays: 4 },
    { key: "denúncias", label: "Denúncias", count: 1, averageDays: 40 },
  ]);
  const empty = fallStats(base(), TODAY);
  assert.deepEqual(
    { rows: empty.rows.length, average: empty.averageDays, recent: empty.recent, countries: empty.byCountry, reasons: empty.byReason },
    { rows: 0, average: null, recent: 0, countries: [], reasons: [] },
  );
});
