// Regras do aquecimento: calendário, atraso, empurrar e data de fim.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DEFAULT_WARMUP_PLAN,
  buildDays,
  describePlan,
  moveStart,
  parsePlan,
  patchDay,
  planFromSettings,
  resizeDays,
  resizePlan,
  setDayDone,
  shiftFrom,
  warmupInfo,
  warmupShortLabel,
} from "../../src/lib/warmup.ts";

const START = "2026-11-01";
const fresh = () => buildDays(START, DEFAULT_WARMUP_PLAN);
const info = (days, today) => warmupInfo({ days, start_date: days[0]?.date ?? START }, today);
const doneUpTo = (days, lastN) => days.map((d) => (d.use && d.n <= lastN ? { ...d, done: true, done_at: "x" } : d));

test("o padrão é 10 dias: usa nos ímpares, descansa nos pares, com tempos diferentes", () => {
  const days = fresh();
  assert.equal(days.length, 10);
  assert.deepEqual(days.filter((d) => d.use).map((d) => d.n), [1, 3, 5, 7, 9]);
  assert.deepEqual(days.filter((d) => d.use).map((d) => d.minutes), [10, 15, 20, 25, 30]);
  assert.equal(days[0].date, "2026-11-01");
  assert.equal(days[9].date, "2026-11-10");
  assert.equal(describePlan(DEFAULT_WARMUP_PLAN), "10 dias · uso nos dias 1, 3, 5, 7 e 9");
});

test("data de fim prevista e progresso", () => {
  const days = doneUpTo(fresh(), 3); // dias 1 e 3 feitos
  const i = info(days, "2026-11-05");
  assert.equal(i.phase, "em_andamento");
  assert.equal(i.endDate, "2026-11-10");
  assert.equal(i.today.n, 5);
  assert.equal(i.doneUseDays, 2);
  assert.equal(i.useDays, 5);
  assert.equal(i.percent, 40);
  assert.equal(i.daysLeft, 5);
  assert.equal(i.nextUse.n, 7);
  assert.equal(warmupShortLabel(i), "Dia 5 de 10");
});

test("antes de começar fica agendado", () => {
  const i = info(fresh(), "2026-10-30");
  assert.equal(i.phase, "agendado");
  assert.equal(i.today, null);
  assert.equal(warmupShortLabel(i), "Começa em 2 dias");
  assert.equal(warmupShortLabel(info(fresh(), "2026-10-31")), "Começa amanhã");
});

test("dia de uso não marcado vira atraso — e só dia de uso", () => {
  const days = doneUpTo(fresh(), 1); // só o dia 1 feito
  assert.equal(info(days, "2026-11-03").phase, "em_andamento"); // o dia 3 é hoje: ainda dá tempo
  const late = info(days, "2026-11-04");
  assert.equal(late.phase, "atrasado");
  assert.deepEqual(late.late.map((d) => d.n), [3]);
  assert.equal(warmupShortLabel(late), "Dia 4 de 10 · atrasado");
  // dias de descanso nunca atrasam
  assert.equal(info(doneUpTo(fresh(), 9), "2026-11-10").late.length, 0);
});

test("empurrar o calendário: o dia pulado vem para hoje e os seguintes acompanham", () => {
  const days = doneUpTo(fresh(), 1);
  const pushed = shiftFrom(days, 3, 2); // hoje é 05/11; o dia 3 era 03/11
  assert.equal(pushed.find((d) => d.n === 2).date, "2026-11-02"); // o que já passou não muda
  assert.equal(pushed.find((d) => d.n === 3).date, "2026-11-05");
  assert.equal(pushed.find((d) => d.n === 4).date, "2026-11-06");
  assert.equal(pushed.find((d) => d.n === 10).date, "2026-11-12");
  const i = info(pushed, "2026-11-05");
  assert.equal(i.phase, "em_andamento");
  assert.equal(i.today.n, 3);
  assert.equal(i.endDate, "2026-11-12"); // data de fim recalculada
  // o padrão uso/descanso continua valendo dali em diante
  assert.equal(info(pushed, "2026-11-06").today.use, false);
  assert.equal(info(pushed, "2026-11-07").today.n, 5);
});

test("vários dias pulados: empurrar a partir do primeiro resolve todos", () => {
  const days = doneUpTo(fresh(), 1);
  const today = "2026-11-08"; // dias 3, 5 e 7 passaram sem marcar
  assert.deepEqual(info(days, today).late.map((d) => d.n), [3, 5, 7]);
  const pushed = shiftFrom(days, 3, 5);
  const i = info(pushed, today);
  assert.equal(i.late.length, 0);
  assert.equal(i.today.n, 3);
});

test("conclusão: todos os usos feitos e o último dia já passou", () => {
  const all = doneUpTo(fresh(), 9);
  assert.equal(info(all, "2026-11-09").phase, "em_andamento"); // ainda falta o descanso do dia 10
  assert.equal(info(all, "2026-11-10").phase, "em_andamento");
  assert.equal(info(all, "2026-11-11").phase, "concluido");
  assert.equal(warmupShortLabel(info(all, "2026-11-11")), "Concluído");
  // se o último dia for de uso, termina assim que ele é feito
  const nine = doneUpTo(resizeDays(fresh(), 9), 9);
  assert.equal(info(nine, "2026-11-09").phase, "concluido");
  // passou do fim sem fazer tudo: atrasado, não concluído
  assert.equal(info(doneUpTo(fresh(), 7), "2026-11-20").phase, "atrasado");
});

test("marcar e desmarcar um dia", () => {
  const marked = setDayDone(fresh(), 3, true, new Date("2026-11-03T15:00:00Z"));
  assert.equal(marked[2].done, true);
  assert.equal(marked[2].done_at, "2026-11-03T15:00:00.000Z");
  const unmarked = setDayDone(marked, 3, false);
  assert.equal(unmarked[2].done, false);
  assert.equal(unmarked[2].done_at, null);
});

test("editar um dia: minutos, tarefa e trocar uso por descanso", () => {
  let days = patchDay(fresh(), 3, { minutes: 45, task: "Tarefa do dia" });
  assert.equal(days[2].minutes, 45);
  assert.equal(days[2].task, "Tarefa do dia");
  days = patchDay(setDayDone(days, 3, true), 3, { use: false });
  assert.deepEqual([days[2].use, days[2].minutes, days[2].done], [false, 0, false]);
  days = patchDay(days, 2, { use: true, minutes: 12 });
  assert.deepEqual([days[1].use, days[1].minutes], [true, 12]);
});

test("mudar a duração e a data de início", () => {
  const longer = resizeDays(fresh(), 13);
  assert.equal(longer.length, 13);
  assert.deepEqual(longer.slice(10).map((d) => [d.n, d.date, d.use]), [
    [11, "2026-11-11", true],
    [12, "2026-11-12", false],
    [13, "2026-11-13", true],
  ]);
  assert.equal(resizeDays(fresh(), 4).length, 4);
  const moved = moveStart(doneUpTo(fresh(), 1), "2026-11-04");
  assert.equal(moved[0].date, "2026-11-04");
  assert.equal(moved[9].date, "2026-11-13");
  assert.equal(moved[0].done, true); // o que foi feito continua feito
});

test("molde das Configurações: aceita o que é válido, senão usa o padrão", () => {
  assert.equal(planFromSettings(null), DEFAULT_WARMUP_PLAN);
  assert.equal(planFromSettings({ warmup_defaults: { days: "x" } }), DEFAULT_WARMUP_PLAN);
  const custom = planFromSettings({ warmup_defaults: { days: [{ use: true, minutes: "20", task: "a" }, { use: false, minutes: 99 }] } });
  assert.deepEqual(custom.days, [
    { use: true, minutes: 20, task: "a" },
    { use: false, minutes: 0, task: "" },
  ]);
  assert.equal(parsePlan({ days: [] }), null);
  const grown = resizePlan(DEFAULT_WARMUP_PLAN, 12);
  assert.deepEqual(grown.days.slice(10), [
    { use: true, minutes: 30, task: "" },
    { use: false, minutes: 0, task: "" },
  ]);
  assert.equal(resizePlan(DEFAULT_WARMUP_PLAN, 3).days.length, 3);
});
