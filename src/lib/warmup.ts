// Regras do aquecimento (sem tela e sem banco): montar o calendário, saber em
// que pé está, empurrar os dias quando um é pulado e calcular a data de fim.

import { addDays, daysBetween, todayISO } from "./dates";
import type { Warmup, WarmupDay } from "./types";

/** Um dia do "molde" de aquecimento (sem data): usa ou descansa, por quantos minutos e o que fazer. */
export interface PlanDay {
  use: boolean;
  minutes: number;
  task: string;
}

export interface WarmupPlan {
  days: PlanDay[];
}

export const MAX_WARMUP_DAYS = 60;

/**
 * Padrão original: 10 dias, usa nos dias 1, 3, 5, 7 e 9 (um tempo diferente em
 * cada um) e descansa nos pares. Pode ser trocado em Configurações.
 */
export const DEFAULT_WARMUP_PLAN: WarmupPlan = {
  days: [10, 0, 15, 0, 20, 0, 25, 0, 30, 0].map((minutes) => ({ use: minutes > 0, minutes, task: "" })),
};

function cleanMinutes(value: unknown): number {
  const n = Math.round(Number(value));
  return Number.isFinite(n) && n > 0 ? Math.min(n, 24 * 60) : 0;
}

/** Confere e arruma um molde vindo do banco; se estiver inválido, devolve null. */
export function parsePlan(value: unknown): WarmupPlan | null {
  const days = (value as { days?: unknown } | null)?.days;
  if (!Array.isArray(days) || days.length === 0 || days.length > MAX_WARMUP_DAYS) return null;
  return {
    days: days.map((raw) => {
      const day = (raw ?? {}) as Partial<PlanDay>;
      const use = Boolean(day.use);
      return { use, minutes: use ? cleanMinutes(day.minutes) : 0, task: typeof day.task === "string" ? day.task : "" };
    }),
  };
}

/** O molde salvo em Configurações ou, se não houver, o padrão original. */
export function planFromSettings(settings: { warmup_defaults: unknown } | null | undefined): WarmupPlan {
  return parsePlan(settings?.warmup_defaults) ?? DEFAULT_WARMUP_PLAN;
}

/** Muda a duração do molde: corta o fim ou acrescenta dias alternando uso (ímpares) e descanso (pares). */
export function resizePlan(plan: WarmupPlan, total: number): WarmupPlan {
  const size = Math.max(1, Math.min(MAX_WARMUP_DAYS, Math.round(total) || 1));
  const days = plan.days.slice(0, size);
  const lastUse = [...plan.days].reverse().find((d) => d.use);
  while (days.length < size) {
    const use = (days.length + 1) % 2 === 1;
    days.push({ use, minutes: use ? (lastUse?.minutes ?? 10) : 0, task: "" });
  }
  return { days };
}

/** "Usa nos dias 1, 3, 5, 7 e 9" */
export function describePlan(plan: WarmupPlan): string {
  const useDays = plan.days.map((d, i) => (d.use ? i + 1 : 0)).filter(Boolean);
  const total = `${plan.days.length} ${plan.days.length === 1 ? "dia" : "dias"}`;
  if (useDays.length === 0) return `${total}, sem dias de uso`;
  const list =
    useDays.length === 1 ? String(useDays[0]) : `${useDays.slice(0, -1).join(", ")} e ${useDays[useDays.length - 1]}`;
  return `${total} · uso ${useDays.length === 1 ? "no dia" : "nos dias"} ${list}`;
}

/** Monta o calendário de uma conta a partir do molde e da data de início. */
export function buildDays(startDate: string, plan: WarmupPlan): WarmupDay[] {
  return plan.days.map((day, index) => ({
    n: index + 1,
    date: addDays(startDate, index),
    use: day.use,
    minutes: day.use ? cleanMinutes(day.minutes) : 0,
    task: day.task ?? "",
    done: false,
    done_at: null,
  }));
}

/** Dias em ordem, numerados de 1 a N (protege contra dados fora de ordem). */
export function sortedDays(days: WarmupDay[] | null | undefined): WarmupDay[] {
  return [...(days ?? [])].sort((a, b) => a.n - b.n);
}

/** Empurra o calendário: o dia `fromN` e todos os seguintes andam `delta` dias. */
export function shiftFrom(days: WarmupDay[], fromN: number, delta: number): WarmupDay[] {
  if (!delta) return days;
  return days.map((day) => (day.n >= fromN ? { ...day, date: addDays(day.date, delta) } : day));
}

/** Muda a data de início: o calendário inteiro anda junto. */
export function moveStart(days: WarmupDay[], newStart: string): WarmupDay[] {
  const ordered = sortedDays(days);
  if (ordered.length === 0) return ordered;
  return shiftFrom(ordered, 1, daysBetween(ordered[0].date, newStart));
}

/** Muda a duração do calendário de uma conta, mantendo o que já foi feito. */
export function resizeDays(days: WarmupDay[], total: number): WarmupDay[] {
  const size = Math.max(1, Math.min(MAX_WARMUP_DAYS, Math.round(total) || 1));
  const ordered = sortedDays(days).slice(0, size);
  const lastUse = [...ordered].reverse().find((d) => d.use);
  while (ordered.length < size) {
    const previous = ordered[ordered.length - 1];
    const n = ordered.length + 1;
    const use = previous ? !previous.use : true;
    ordered.push({
      n,
      date: previous ? addDays(previous.date, 1) : todayISO(),
      use,
      minutes: use ? (lastUse?.minutes ?? 10) : 0,
      task: "",
      done: false,
      done_at: null,
    });
  }
  return ordered;
}

/** Marca (ou desmarca) um dia como feito. */
export function setDayDone(days: WarmupDay[], n: number, done: boolean, now = new Date()): WarmupDay[] {
  return days.map((day) => (day.n === n ? { ...day, done, done_at: done ? now.toISOString() : null } : day));
}

/** Altera um dia: tipo (uso/descanso), minutos e o que fazer. */
export function patchDay(
  days: WarmupDay[],
  n: number,
  patch: Partial<Pick<WarmupDay, "use" | "minutes" | "task">>,
): WarmupDay[] {
  return days.map((day) => {
    if (day.n !== n) return day;
    const use = patch.use ?? day.use;
    return {
      ...day,
      use,
      minutes: use ? cleanMinutes(patch.minutes ?? day.minutes) : 0,
      task: patch.task ?? day.task,
      // dia de descanso não tem "feito"
      done: use ? day.done : false,
      done_at: use ? day.done_at : null,
    };
  });
}

export type WarmupPhase = "agendado" | "em_andamento" | "atrasado" | "concluido";

export interface WarmupInfo {
  phase: WarmupPhase;
  totalDays: number;
  /** Quantos dias de uso o calendário tem, e quantos já foram feitos. */
  useDays: number;
  doneUseDays: number;
  /** 0 a 100, pelos dias de uso já feitos. */
  percent: number;
  startDate: string;
  /** Data de fim prevista (a data do último dia). */
  endDate: string;
  /** O dia do calendário que cai hoje. Não existe antes do início, depois do fim ou se foi adiado. */
  today: WarmupDay | null;
  /** Dias de uso que já passaram e não foram marcados como feitos. */
  late: WarmupDay[];
  /** Próximo dia de uso ainda por fazer, de amanhã em diante. */
  nextUse: WarmupDay | null;
  /** Dias que faltam até o fim previsto (0 = termina hoje; negativo = já passou). */
  daysLeft: number;
  /** Dias que faltam para começar (0 ou negativo = já começou). */
  daysUntilStart: number;
}

/** Em que pé está o aquecimento de uma conta, na data de hoje. */
export function warmupInfo(warmup: Pick<Warmup, "days" | "start_date">, today = todayISO()): WarmupInfo {
  const days = sortedDays(warmup.days);
  const useList = days.filter((d) => d.use);
  const doneUseDays = useList.filter((d) => d.done).length;
  const first = days[0];
  const last = days[days.length - 1];
  const startDate = first?.date ?? warmup.start_date;
  const endDate = last?.date ?? warmup.start_date;
  const late = useList.filter((d) => !d.done && d.date < today);
  const allUseDone = doneUseDays === useList.length;
  // Terminou quando todos os dias de uso foram feitos e o último dia do calendário já passou
  // (se o último dia for de uso e estiver feito, termina na hora).
  const finished = days.length === 0 || (allUseDone && (today > endDate || Boolean(last?.use && last.done)));

  let phase: WarmupPhase;
  if (finished) phase = "concluido";
  else if (late.length > 0) phase = "atrasado";
  else if (today < startDate) phase = "agendado";
  else phase = "em_andamento";

  return {
    phase,
    totalDays: days.length,
    useDays: useList.length,
    doneUseDays,
    percent: useList.length === 0 ? 100 : Math.round((doneUseDays / useList.length) * 100),
    startDate,
    endDate,
    today: days.find((d) => d.date === today) ?? null,
    late,
    nextUse: useList.find((d) => !d.done && d.date > today) ?? null,
    daysLeft: daysBetween(today, endDate),
    daysUntilStart: daysBetween(today, startDate),
  };
}

/** Texto curto da situação: "Dia 5 de 10", "Começa em 3 dias", "Concluído"… */
export function warmupShortLabel(info: WarmupInfo): string {
  if (info.phase === "concluido") return "Concluído";
  if (info.phase === "agendado") {
    return info.daysUntilStart === 1 ? "Começa amanhã" : `Começa em ${info.daysUntilStart} dias`;
  }
  const position = info.today ? `Dia ${info.today.n} de ${info.totalDays}` : `${info.doneUseDays} de ${info.useDays} usos`;
  return info.phase === "atrasado" ? `${position} · atrasado` : position;
}
