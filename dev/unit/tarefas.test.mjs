// Tarefas: prioridade, repetição, datas, listas, o jeito rápido de adicionar —
// e as tarefas que o painel sugere a partir do que está registrado.
import assert from "node:assert/strict";
import { test } from "node:test";
import { backupCounts, buildBackup, parseBackup } from "../../src/lib/backup.ts";
import { buildSheets } from "../../src/lib/backup-sheets.ts";
import { stepLabel } from "../../src/lib/funnels.ts";
import { buildAutoTasks, nextRestDay, restingWithStructure } from "../../src/lib/smart-tasks.ts";
import {
  bucketTasks,
  compareTasks,
  completedDay,
  dayHeading,
  describeDue,
  dueTone,
  encodeRecurrence,
  monthlyAnchor,
  nextDue,
  parseQuickAdd,
  priorityLabel,
  readPriority,
  readRecurrence,
  recurrenceLabel,
} from "../../src/lib/tasks.ts";
import { buildDays, DEFAULT_WARMUP_PLAN } from "../../src/lib/warmup.ts";

const TODAY = "2026-11-24"; // uma terça-feira

const task = (id, extra = {}) => ({
  id, user_id: "u1", avatar_id: null, title: id, notes: null, due_date: null, due_time: null, priority: 4,
  recurrence: null, completed_at: null, is_example: false,
  created_at: "2026-11-01T10:00:00Z", updated_at: "2026-11-01T10:00:00Z", ...extra,
});

test("prioridade e repetição: o que não é conhecido vira o padrão", () => {
  assert.deepEqual([1, "2", 3, 4].map(readPriority), [1, 2, 3, 4]);
  for (const bad of [0, 5, null, undefined, "p1", NaN]) assert.equal(readPriority(bad), 4);
  assert.equal(priorityLabel(1), "Urgente");
  assert.equal(priorityLabel("lixo"), "Normal");
  assert.equal(readRecurrence("semanal"), "semanal");
  assert.equal(readRecurrence("mensal:31"), "mensal");
  for (const bad of ["Semanal", "mensal:15", "mensal:", "anual", null, 3]) assert.equal(readRecurrence(bad), null);
  assert.equal(recurrenceLabel("diaria", null), "Todo dia");
  assert.equal(recurrenceLabel("dias_uteis", TODAY), "Dias úteis");
  assert.equal(recurrenceLabel("semanal", "2026-11-30"), "Toda segunda");
  assert.equal(recurrenceLabel("semanal", "2026-11-28"), "Todo sábado");
  assert.equal(recurrenceLabel("semanal", null), "Toda semana");
  assert.equal(recurrenceLabel("mensal", "2026-12-15"), "Todo dia 15");
  assert.equal(recurrenceLabel("mensal:31", "2027-02-28"), "Todo dia 31"); // em fevereiro cai no dia 28, mas é "todo dia 31"
  assert.equal(recurrenceLabel(null, TODAY), "");
});

test("repetição: a próxima data é sempre depois de hoje", () => {
  assert.equal(nextDue(TODAY, "diaria", TODAY), "2026-11-25");
  assert.equal(nextDue("2026-11-20", "diaria", TODAY), "2026-11-25"); // atrasada não volta para o passado
  assert.equal(nextDue(null, "diaria", TODAY), "2026-11-25");
  assert.equal(nextDue("2026-11-23", "semanal", TODAY), "2026-11-30"); // continua na segunda
  assert.equal(nextDue("2026-11-09", "semanal", TODAY), "2026-11-30");
  assert.equal(nextDue("2026-11-30", "semanal", TODAY), "2026-12-07"); // feita antes da hora: a próxima semana
  assert.equal(nextDue("2026-11-27", "dias_uteis", "2026-11-27"), "2026-11-30"); // sexta → segunda
  assert.equal(nextDue("2026-11-15", "mensal", TODAY), "2026-12-15");
  assert.equal(nextDue("2027-01-31", "mensal", "2027-01-31"), "2027-02-28"); // fevereiro não tem dia 31
  // sem o dia guardado, o dia 31 viraria 28 para sempre; com ele, volta ao 31
  assert.equal(nextDue("2027-02-28", "mensal", "2027-02-28"), "2027-03-28");
  assert.equal(nextDue("2027-02-28", "mensal", "2027-02-28", 31), "2027-03-31");
  assert.equal(nextDue("2027-03-31", "mensal", "2027-03-31", 31), "2027-04-30");
});

test("repetição todo mês: os dias 29 a 31 ficam guardados", () => {
  assert.equal(encodeRecurrence("mensal", "2027-01-31"), "mensal:31");
  assert.equal(encodeRecurrence("mensal", "2026-12-15"), "mensal");
  assert.equal(encodeRecurrence("mensal", null), "mensal");
  assert.equal(encodeRecurrence("semanal", "2027-01-31"), "semanal");
  assert.equal(encodeRecurrence(null, "2027-01-31"), null);
  // editar em fevereiro (data no dia 28) sem mexer na data mantém o dia 31
  assert.equal(encodeRecurrence("mensal", "2027-02-28", "mensal:31"), "mensal:31");
  // mudar a data de propósito troca o dia
  assert.equal(encodeRecurrence("mensal", "2027-02-27", "mensal:31"), "mensal");
  assert.equal(encodeRecurrence("mensal", "2027-03-30", "mensal:31"), "mensal:30");
  assert.equal(monthlyAnchor("mensal:30"), 30);
  for (const bad of ["mensal:28", "mensal", "mensal:32", null]) assert.equal(monthlyAnchor(bad), null);
});

test("datas na tela", () => {
  assert.equal(describeDue(TODAY, null, TODAY), "Hoje");
  assert.equal(describeDue("2026-11-25", "14:00", TODAY), "Amanhã 14:00");
  assert.equal(describeDue("2026-11-23", null, TODAY), "Ontem");
  assert.equal(describeDue("2026-11-26", null, TODAY), "qui, 26/11");
  assert.equal(describeDue("2027-01-02", null, TODAY), "02/01/2027");
  assert.equal(describeDue(null, "09:00", TODAY), "09:00");
  assert.equal(describeDue(null, null, TODAY), "");
  assert.deepEqual(
    ["2026-11-23", TODAY, "2026-12-01", "2026-12-02", null].map((due) => dueTone(due, TODAY)),
    ["late", "today", "soon", "later", "none"],
  );
  assert.equal(dayHeading("2026-11-25", TODAY), "Amanhã · qua, 25/11");
  assert.equal(dayHeading("2026-11-26", TODAY), "qui, 26/11");
  assert.match(dayHeading("2027-01-04", TODAY), /04\/01\/2027$/);
});

test("listas: atrasadas, hoje (com horário primeiro), próximos dias, sem data e feitas", () => {
  const tasks = [
    task("sem-data"),
    task("atrasada", { due_date: "2026-11-20" }),
    task("hoje-p4", { due_date: TODAY }),
    task("hoje-14h", { due_date: TODAY, due_time: "14:00" }),
    task("hoje-p1", { due_date: TODAY, priority: 1 }),
    task("hoje-9h", { due_date: TODAY, due_time: "09:00", priority: 4 }),
    task("quinta-b", { due_date: "2026-11-26", created_at: "2026-11-02T10:00:00Z" }),
    task("quinta-a", { due_date: "2026-11-26" }),
    task("sexta", { due_date: "2026-11-27" }),
    task("feita-ontem", { due_date: "2026-11-23", completed_at: "2026-11-23T15:00:00Z" }),
    task("feita-hoje", { completed_at: "2026-11-24T12:00:00Z" }),
    task("feita-faz-tempo", { completed_at: "2026-09-01T12:00:00Z" }),
  ];
  const buckets = bucketTasks(tasks, TODAY);
  const ids = (list) => list.map((item) => item.id);
  assert.deepEqual(ids(buckets.late), ["atrasada"]);
  assert.deepEqual(ids(buckets.today), ["hoje-9h", "hoje-14h", "hoje-p1", "hoje-p4"]);
  assert.deepEqual(
    buckets.upcoming.map((group) => `${group.date}:${ids(group.tasks).join(",")}`),
    ["2026-11-26:quinta-a,quinta-b", "2026-11-27:sexta"],
  );
  assert.deepEqual(ids(buckets.noDate), ["sem-data"]);
  assert.deepEqual(ids(buckets.done), ["feita-hoje", "feita-ontem"]); // as de mais de 30 dias saem da lista
  assert.ok(compareTasks(task("x", { due_date: TODAY }), task("y")) < 0); // sem data vai para o fim
});

test("feitas: o dia é o do horário de quem usa (o banco guarda em UTC)", () => {
  const before = process.env.TZ;
  try {
    process.env.TZ = "America/Sao_Paulo";
    // 22h30 de 24/11 em Brasília = 01h30 de 25/11 em UTC
    assert.equal(completedDay({ completed_at: "2026-11-25T01:30:00.000Z" }), "2026-11-24");
    const buckets = bucketTasks([task("tarde-da-noite", { completed_at: "2026-11-25T01:30:00.000Z" })], "2026-12-24");
    assert.equal(buckets.done.length, 1); // 30 dias contados a partir do dia local
  } finally {
    if (before === undefined) delete process.env.TZ;
    else process.env.TZ = before;
  }
  assert.equal(completedDay({ completed_at: null }), null);
});

// --- adicionar rápido ---

const AVATARS = [
  { id: "a1", name: "Fra' Salvio" },
  { id: "a2", name: "Nonna Rosa" },
  { id: "a3", name: "Nonno Beppe" },
];
const quick = (text, ignore) => parseQuickAdd(text, TODAY, AVATARS, ignore);
const brief = (text, ignore) => {
  const result = quick(text, ignore);
  return [result.title, result.due_date, result.due_time, result.priority, result.avatar_id, result.recurrence];
};

test("adicionar rápido: data, horário, prioridade e avatar na mesma frase", () => {
  const result = quick("Gravar vídeos amanhã 14h p1 #salvio");
  assert.deepEqual(
    [result.title, result.due_date, result.due_time, result.priority, result.avatar_id],
    ["Gravar vídeos", "2026-11-25", "14:00", 1, "a1"],
  );
  assert.deepEqual(result.found.map((piece) => `${piece.kind}:${piece.text}`), ["data:amanhã", "hora:14h", "prioridade:p1", "avatar:#salvio"]);
  assert.deepEqual(brief("Só um lembrete"), ["Só um lembrete", null, null, 4, null, null]);
});

test("adicionar rápido: datas", () => {
  const due = (text) => quick(text).due_date;
  const title = (text) => quick(text).title;
  assert.equal(due("Postar hoje"), TODAY);
  assert.equal(due("Revisar depois de amanhã"), "2026-11-26");
  assert.equal(title("Revisar depois de amanhã"), "Revisar");
  assert.equal(due("Entregar ebook até sexta"), "2026-11-27");
  assert.equal(title("Entregar ebook até sexta"), "Entregar ebook");
  assert.equal(due("Revisar o site na segunda-feira"), "2026-11-30");
  assert.equal(due("Postar terça"), "2026-12-01"); // hoje é terça: a próxima
  assert.equal(due("Fazer o checkout 15/12"), "2026-12-15");
  assert.equal(due("Renovar 10/01"), "2027-01-10"); // já passou este ano: o ano que vem
  assert.equal(due("Renovar 10/01/2028"), "2028-01-10");
  assert.equal(due("Comprar domínio dia 3"), "2026-12-03");
  assert.equal(due("Lançar 3 de dezembro"), "2026-12-03");
  assert.equal(due("Lançar 5 de jan"), "2027-01-05");
  assert.equal(due("Conferir em 3 dias"), "2026-11-27");
  assert.equal(due("Conferir daqui a duas semanas"), "2026-12-08");
  assert.equal(due("Conferir em 1 mês"), "2026-12-24");
  assert.equal(due("Planejar semana que vem"), "2026-11-30");
  assert.equal(due("Editar no fim de semana"), "2026-11-28");
  assert.equal(due("Renovar mês que vem"), "2026-12-24");
  // data que não existe fica no título
  assert.deepEqual(brief("Pagar 31/02"), ["Pagar 31/02", null, null, 4, null, null]);
  // duas datas: vale a última ("segunda mão" não é segunda-feira quando a frase diz amanhã)
  assert.deepEqual(brief("Ligar para a loja de segunda mão amanhã"), ["Ligar para a loja de segunda mão", "2026-11-25", null, 4, null, null]);
  // palavra que só começa igual não é data
  assert.equal(due("Comprar sextante"), null);
  assert.equal(due("Ver o amanhecer"), null);
  // sem acento e em maiúsculas também
  assert.deepEqual(brief("GRAVAR AMANHA"), ["GRAVAR", "2026-11-25", null, 4, null, null]);
  // a preposição que sobra no fim sai do título
  assert.equal(title("Gravar vídeo de amanhã"), "Gravar vídeo");
});

test("adicionar rápido: horário (sem data, é hoje)", () => {
  assert.deepEqual(brief("Gravar às 9h30"), ["Gravar", TODAY, "09:30", 4, null, null]);
  assert.deepEqual(brief("Almoço meio-dia"), ["Almoço", TODAY, "12:00", 4, null, null]);
  assert.deepEqual(brief("Call 18:45 sexta"), ["Call", "2026-11-27", "18:45", 4, null, null]);
  assert.equal(quick("Gravar 25h").due_time, null); // hora que não existe
});

test("adicionar rápido: repetição", () => {
  assert.deepEqual(brief("Responder directs todo dia"), ["Responder directs", TODAY, null, 4, null, "diaria"]);
  assert.deepEqual(brief("Conferir proxies dias úteis 9h"), ["Conferir proxies", TODAY, "09:00", 4, null, "dias_uteis"]);
  assert.deepEqual(brief("Backup toda segunda"), ["Backup", "2026-11-30", null, 4, null, "semanal"]);
  assert.deepEqual(brief("Reunião toda terça"), ["Reunião", TODAY, null, 4, null, "semanal"]); // hoje é terça: já vale hoje
  assert.deepEqual(brief("Relatório toda semana"), ["Relatório", TODAY, null, 4, null, "semanal"]);
  assert.deepEqual(brief("Pagar a VPS todo dia 5"), ["Pagar a VPS", "2026-12-05", null, 4, null, "mensal"]);
  assert.deepEqual(brief("Pagar o servidor todo dia 31"), ["Pagar o servidor", "2026-12-31", null, 4, null, "mensal"]);
  assert.equal(encodeRecurrence("mensal", quick("Pagar o servidor todo dia 31").due_date), "mensal:31");
});

test("adicionar rápido: #avatar pelo começo do nome; o que serve para dois fica no título", () => {
  assert.equal(quick("Foto #fra").avatar_id, "a1");
  assert.equal(quick("Foto #rosa").avatar_id, "a2");
  assert.equal(quick("Foto #nonna").avatar_id, "a2"); // palavra inteira de um só
  const both = quick("Foto #nonn");
  assert.equal(both.avatar_id, null);
  assert.equal(both.ambiguous, "#nonn");
  assert.equal(both.title, "Foto #nonn");
  const none = quick("Foto #ninguem");
  assert.deepEqual([none.avatar_id, none.ambiguous, none.title], [null, null, "Foto #ninguem"]);
});

test("adicionar rápido: o que o dono desliga volta para o título", () => {
  assert.deepEqual(brief("Gravar amanhã p2", new Set(["data"])), ["Gravar amanhã", null, null, 2, null, null]);
  assert.deepEqual(brief("Gravar amanhã p2", new Set(["prioridade"])), ["Gravar p2", "2026-11-25", null, 4, null, null]);
  assert.deepEqual(brief("Gravar 14h", new Set(["hora"])), ["Gravar 14h", null, null, 4, null, null]);
  assert.deepEqual(brief("Foto #rosa", new Set(["avatar"])), ["Foto #rosa", null, null, 4, null, null]);
  assert.equal(quick("Pagar app1").priority, 4); // "p1" no meio de uma palavra não é prioridade
});

// --- o que o painel sugere ---

const avatar = (id, name, extra = {}) => ({
  id, name, country_id: "it", status: "ativo", position: 0, kit: {}, model_videos: [], ...extra,
});
const account = (id, avatar_id, extra = {}) => ({
  id, avatar_id, generation: 1, handle: id, email: null, phone_id: null, profile_id: null, proxy: null,
  created_on: "2026-11-01", status: "aquecendo", fell_on: null, fall_reason: null, checklist: null, is_example: false, ...extra,
});
/** Calendário padrão (10 dias, uso nos dias ímpares) com os dias de uso até `doneUpTo` feitos. */
const warmup = (id, account_id, start, doneUpTo = 0) => ({
  id, account_id, start_date: start, finished_at: null, created_at: id,
  days: buildDays(start, DEFAULT_WARMUP_PLAN).map((day) => (day.use && day.n <= doneUpTo ? { ...day, done: true, done_at: "x" } : day)),
});
// vendas lançadas na semana passada (17/11) para os avatares dados: assim a tarefa das vendas não se mistura nos testes
const salesFor = (...ids) => ids.map((avatar_id) => ({ id: `s-${avatar_id}`, avatar_id, week_start: "2026-11-16", amount: 0, currency: "EUR" }));
const base = (extra = {}) => ({
  countries: [{ id: "it", name: "Itália", flag: "🇮🇹", currency: "EUR", position: 0 }],
  avatars: [], accounts: [], phones: [], profiles: [], warmups: [], sales: [], activity: [], settings: null,
  library: [], libraryReady: true, tasks: [], tasksReady: true, ...extra,
});
const keys = (list) => list.map((item) => item.key);

test("painel: estrutura com prazo no fim do aquecimento — no dia de descanso, entra na lista de hoje", () => {
  const db = base({
    avatars: [
      avatar("a1", "Fra' Salvio", { kit: { structure: { site: true } } }), // hoje é o dia 2 (descanso)
      avatar("a2", "Nonna Rosa"), // hoje é o dia 1 (uso)
      avatar("a3", "Pausado", { status: "pausado" }),
    ],
    accounts: [account("c1", "a1"), account("c2", "a2"), account("c3", "a3")],
    warmups: [warmup("w1", "c1", "2026-11-23", 1), warmup("w2", "c2", TODAY), warmup("w3", "c3", "2026-11-23", 1)],
    sales: salesFor("a1", "a2"),
  });
  const tasks = buildAutoTasks(db, TODAY);
  const resting = tasks.filter((item) => item.avatarId === "a1");
  assert.deepEqual(keys(resting), ["estrutura:a1:entregavel", "estrutura:a1:checkout", "estrutura:a1:automacao"]);
  for (const item of resting) {
    assert.equal(item.due, "2026-12-02"); // o último dia do calendário
    assert.equal(item.priority, 3);
    assert.equal(item.today, true);
    assert.equal(item.restDay, true);
    assert.match(item.reason, /descansa hoje/);
    assert.deepEqual(item.target, { kind: "estrutura", avatarId: "a1", step: item.key.split(":")[2] });
  }
  assert.deepEqual(resting.map((item) => item.title), ["Preparar o entregável", "Configurar o checkout", "Montar a automação"]);
  // quem usa a conta hoje: a estrutura fica com o prazo, fora da lista de hoje; e entra o uso do dia
  const working = tasks.filter((item) => item.avatarId === "a2");
  assert.equal(working.filter((item) => item.kind === "estrutura").length, 4);
  assert.ok(working.filter((item) => item.kind === "estrutura").every((item) => !item.today && item.due === "2026-12-03"));
  const use = working.find((item) => item.kind === "aquecimento");
  assert.deepEqual(
    [use.title, use.today, use.priority, use.target],
    ["Usar @c2 por 10 min", true, 2, { kind: "aquecimento", warmupId: "w2", day: 1 }],
  );
  // avatar pausado não recebe sugestões
  assert.equal(tasks.some((item) => item.avatarId === "a3"), false);
  // as de hoje vêm primeiro
  const firstLater = tasks.findIndex((item) => !item.today);
  assert.ok(tasks.slice(firstLater).every((item) => !item.today));
  // a dica do dia e o próximo descanso
  assert.deepEqual(restingWithStructure(db, tasks).map((item) => item.id), ["a1"]);
  assert.deepEqual(nextRestDay(db, "a1", TODAY), { date: "2026-11-26", handle: "c1" });
  assert.deepEqual(nextRestDay(db, "a2", TODAY), { date: "2026-11-25", handle: "c2" });
  assert.equal(nextRestDay(db, "a3x", TODAY), null);
});

test("painel: prazo perto, aquecimento terminado, conta já no ar e sem calendário", () => {
  const db = base({
    avatars: [
      avatar("perto", "Perto"), // termina em 2 dias
      avatar("pronta", "Pronta"), // calendário terminado
      avatar("ativa", "Ativa", { kit: { structure: { site: true, entregavel: true, checkout: true } } }),
      avatar("antiga", "Antiga"), // conta ativa sem nenhum passo marcado: não é cobrada
      avatar("solta", "Sem calendário", { kit: { structure: { site: true, entregavel: true, checkout: true } } }),
    ],
    accounts: [
      account("c1", "perto"), account("c2", "pronta"), account("c3", "ativa", { status: "ativa" }),
      account("c4", "antiga", { status: "ativa" }), account("c5", "solta"),
    ],
    warmups: [warmup("w1", "c1", "2026-11-17", 9), warmup("w2", "c2", "2026-11-10", 9)],
    sales: salesFor("perto", "pronta", "ativa", "antiga", "solta"),
  });
  const tasks = buildAutoTasks(db, TODAY);
  const of = (id) => tasks.filter((item) => item.avatarId === id && item.kind === "estrutura");
  assert.ok(of("perto").every((item) => item.priority === 2 && item.due === "2026-11-26"));
  assert.ok(of("pronta").every((item) => item.priority === 1 && item.due === TODAY && item.today));
  assert.match(of("pronta")[0].reason, /terminou/);
  assert.deepEqual(of("ativa").map((item) => [item.title, item.due, item.priority]), [["Montar a automação", TODAY, 1]]);
  assert.equal(of("antiga").length, 0);
  assert.deepEqual(of("solta").map((item) => [item.due, item.priority, item.today]), [[null, 3, false]]);
});

test("painel: aquecimento atrasado, checklist de reposição e vendas da semana passada", () => {
  const db = base({
    avatars: [avatar("a1", "Fra' Salvio"), avatar("a2", "Nonna Rosa")],
    accounts: [
      account("c1", "a1"),
      account("c2", "a2", {
        status: "ativa",
        checklist: [
          { key: "email", label: "Criar o e-mail novo", done: true },
          { key: "foto", label: "Trocar a foto", done: false },
          { key: "bio", label: "Escrever a bio", done: false },
        ],
      }),
    ],
    // começou dia 20 e nada foi marcado: os dias 1 e 3 ficaram para trás
    warmups: [warmup("w1", "c1", "2026-11-20")],
    sales: salesFor("a1"),
  });
  const tasks = buildAutoTasks(db, TODAY);
  const late = tasks.find((item) => item.key.startsWith("aquecimento-atrasado:"));
  assert.deepEqual(
    [late.title, late.priority, late.target, late.href, late.due],
    ["Resolver o aquecimento atrasado de @c1", 1, null, "/", "2026-11-20"],
  );
  assert.match(late.reason, /2 dias de uso/);
  const checklist = tasks.filter((item) => item.kind === "reposicao");
  assert.deepEqual(checklist.map((item) => item.title), ["Reposição: Trocar a foto", "Reposição: Escrever a bio"]); // na ordem do checklist
  assert.ok(checklist.every((item) => item.today && item.priority === 2 && item.target.accountId === "c2"));
  assert.match(checklist[0].reason, /@c2: faltam 2 de 3 passos/);
  const sales = tasks.find((item) => item.kind === "vendas");
  assert.deepEqual(
    [sales.key, sales.avatarId, sales.href, sales.target, sales.today],
    ["vendas:2026-11-16", "a2", "/vendas?semana=2026-11-16", null, true],
  );
  assert.match(sales.reason, /Nonna Rosa/);
  // com as vendas lançadas, a tarefa some
  assert.equal(buildAutoTasks({ ...db, sales: salesFor("a1", "a2") }, TODAY).some((item) => item.kind === "vendas"), false);
});

test("painel: o próximo passo de cada funil e os vídeos para modelar", () => {
  const step = (id, kind, done = false, title = "") => ({ id, kind, title, detail: "", url: "", notes: "", done });
  const funnels = [
    { id: "f1", name: "@modelo", handle: "", niche: "", notes: "", steps: [step("s1", "pagina_vendas", true), step("s2", "captura"), step("s3", "isca")] },
    { id: "f2", name: "Tudo feito", handle: "", niche: "", notes: "", steps: [step("t1", "venda", true)] },
    { id: "f3", name: "", handle: "", niche: "", notes: "", steps: [] },
  ];
  const db = base({
    avatars: [
      avatar("a1", "Fra' Salvio", {
        kit: { funnels },
        model_videos: [
          { id: "v1", label: "Receita de chá", url: "", status: "a_modelar", note: "" },
          { id: "v2", label: "Já feito", url: "", status: "modelado", note: "" },
        ],
      }),
      avatar("a2", "Pausado", { status: "pausado", kit: { funnels } }),
    ],
    sales: salesFor("a1"),
  });
  const tasks = buildAutoTasks(db, TODAY);
  const funnel = tasks.filter((item) => item.kind === "funil");
  assert.deepEqual(funnel.map((item) => item.key), ["funil:a1:f1:s2"]);
  assert.equal(funnel[0].title, `Modelar: ${stepLabel(step("s2", "captura"))}`);
  assert.match(funnel[0].reason, /passo 2 de 3/);
  assert.deepEqual([funnel[0].priority, funnel[0].today, funnel[0].due], [4, false, null]);
  const videos = tasks.filter((item) => item.kind === "video");
  assert.deepEqual(videos.map((item) => [item.title, item.target.videoId]), [["Modelar o vídeo: Receita de chá", "v1"]]);
});

// --- backup ---

test("backup: as tarefas entram no arquivo e na planilha (só quando a tabela existe)", () => {
  const C = "11111111-1111-4111-8111-111111111111";
  const A = "22222222-2222-4222-8222-222222222222";
  const T1 = "33333333-3333-4333-8333-333333333333";
  const T2 = "44444444-4444-4444-8444-444444444444";
  const db = base({
    countries: [{ id: C, user_id: "u1", name: "Itália", position: 0 }],
    avatars: [{ ...avatar(A, "Fra' Salvio"), country_id: C, user_id: "u1", extra_links: [], reference_profiles: [] }],
    tasks: [
      task(T1, { title: "Pagar o servidor", avatar_id: A, due_date: "2027-02-28", recurrence: "mensal:31", priority: 2 }),
      task(T2, { title: "Feita", completed_at: "2026-11-20T15:00:00Z" }),
    ],
  });
  const file = buildBackup(db, new Date("2026-11-24T10:00:00Z"));
  assert.equal("user_id" in file.tables.tasks[0], false);
  const parsed = parseBackup(JSON.stringify(file));
  assert.equal(backupCounts(parsed).tasks, 2);
  // tarefa que cita um avatar que não veio no arquivo é recusada
  const orphan = { ...file, tables: { ...file.tables, avatars: [] } };
  assert.throws(() => parseBackup(JSON.stringify(orphan)), /avatars/);
  // backup antigo, sem a lista de tarefas, continua valendo
  const { tasks: _skip, ...older } = file.tables;
  assert.equal(backupCounts(parseBackup(JSON.stringify({ ...file, tables: older }))).tasks, 0);

  const sheet = buildSheets(db).find((entry) => entry.name === "tarefas");
  assert.deepEqual(sheet.table[0], ["Tarefa", "Avatar", "Data", "Horário", "Prioridade", "Repete", "Descrição", "Feita em", "Criada em"]);
  assert.deepEqual(sheet.table[1].slice(0, 6), ["Pagar o servidor", "Fra' Salvio", "28/02/2027", "", "Alta (P2)", "Todo dia 31"]);
  assert.deepEqual(sheet.table[2].slice(0, 2), ["Feita", "Geral"]);
  assert.notEqual(sheet.table[2][7], "");
  // sem a tabela no banco: nem no backup, nem nas planilhas
  const without = base({ tasks: [], tasksReady: false });
  assert.equal("tasks" in buildBackup(without, new Date("2026-11-24T10:00:00Z")).tables, false);
  assert.equal(buildSheets(without).some((entry) => entry.name === "tarefas"), false);
});
