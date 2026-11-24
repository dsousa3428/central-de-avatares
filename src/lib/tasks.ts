// Tarefas no estilo do Todoist: as regras (sem tela e sem banco).
//
// - Prioridade de 1 (urgente) a 4 (normal), datas e horários opcionais, um
//   avatar opcional (funciona como o "projeto" do Todoist) e repetição.
// - Tarefa que se repete nunca fica "feita": ao concluir, a data anda para a
//   próxima vez (`nextDue`), como no Todoist.
// - O jeito rápido de adicionar (`parseQuickAdd`) entende o que se escreve na
//   frase: "Gravar vídeos amanhã 14h p1 #nonna toda segunda".

import { addDays, daysBetween, formatWeekdayDate, isValidISODate, parseISODate, toISODate } from "./dates";
import type { Avatar, Task, TaskPriority, TaskRecurrence } from "./types";

// ---------------------------------------------------------------------------
// Prioridade e repetição
// ---------------------------------------------------------------------------

export const PRIORITIES: ReadonlyArray<{ value: TaskPriority; label: string; short: string }> = [
  { value: 1, label: "Urgente", short: "P1" },
  { value: 2, label: "Alta", short: "P2" },
  { value: 3, label: "Média", short: "P3" },
  { value: 4, label: "Normal", short: "P4" },
];

export function readPriority(value: unknown): TaskPriority {
  const n = Number(value);
  return n === 1 || n === 2 || n === 3 ? n : 4;
}

export function priorityLabel(value: unknown): string {
  return PRIORITIES.find((item) => item.value === readPriority(value))?.label ?? "Normal";
}

export const RECURRENCES: ReadonlyArray<{ value: TaskRecurrence; label: string }> = [
  { value: "diaria", label: "Todo dia" },
  { value: "dias_uteis", label: "Dias úteis (seg a sex)" },
  { value: "semanal", label: "Toda semana" },
  { value: "mensal", label: "Todo mês" },
];

/**
 * "mensal:31" = todo mês no dia 31 (no último dia, nos meses mais curtos). Só os
 * dias 29, 30 e 31 guardam o dia: sem isso, depois de fevereiro a tarefa passaria a cair no dia 28.
 */
export function monthlyAnchor(value: unknown): number | null {
  const match = typeof value === "string" ? /^mensal:(29|30|31)$/.exec(value) : null;
  return match ? Number(match[1]) : null;
}

export function readRecurrence(value: unknown): TaskRecurrence | null {
  if (monthlyAnchor(value)) return "mensal";
  return RECURRENCES.some((item) => item.value === value) ? (value as TaskRecurrence) : null;
}

/**
 * O valor da repetição que vai para o banco (ver `monthlyAnchor`). `previous` é o
 * que a tarefa tinha: editar sem mudar a data mantém o dia 31 de uma tarefa que,
 * em fevereiro, está marcada para o dia 28.
 */
export function encodeRecurrence(recurrence: TaskRecurrence | null, due: string | null | undefined, previous?: unknown): string | null {
  if (recurrence !== "mensal" || !isValidISODate(due)) return recurrence;
  const date = parseISODate(due);
  const day = date.getDate();
  const anchor = monthlyAnchor(previous);
  if (anchor && day === Math.min(anchor, daysInMonth(date.getFullYear(), date.getMonth()))) return `mensal:${anchor}`;
  return day > 28 ? `mensal:${day}` : "mensal";
}

const WEEKDAYS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

/** "Todo dia", "Dias úteis", "Toda segunda", "Todo sábado", "Todo dia 15". (Recebe o valor como está no banco.) */
export function recurrenceLabel(recurrence: unknown, due: string | null | undefined): string {
  const value = readRecurrence(recurrence);
  if (!value) return "";
  const anchor = monthlyAnchor(recurrence);
  if (anchor) return `Todo dia ${anchor}`;
  if (value === "diaria") return "Todo dia";
  if (value === "dias_uteis") return "Dias úteis";
  if (value === "semanal") {
    if (!isValidISODate(due)) return "Toda semana";
    const day = parseISODate(due).getDay();
    return `${day === 0 || day === 6 ? "Todo" : "Toda"} ${WEEKDAYS[day]}`;
  }
  return isValidISODate(due) ? `Todo dia ${parseISODate(due).getDate()}` : "Todo mês";
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

/** A mesma data `months` meses depois; o dia que não existe no mês vira o último (31/01 → 28/02). */
function addMonths(iso: string, months: number, anchorDay?: number): string {
  const date = parseISODate(iso);
  const day = anchorDay ?? date.getDate();
  const first = new Date(date.getFullYear(), date.getMonth() + months, 1);
  first.setDate(Math.min(day, daysInMonth(first.getFullYear(), first.getMonth())));
  return toISODate(first);
}

/**
 * A próxima data de uma tarefa que se repete, depois de concluída: sempre
 * depois de hoje (tarefa atrasada não "volta" para o passado). Toda semana
 * mantém o dia da semana; todo mês mantém o dia do mês.
 */
export function nextDue(due: string | null | undefined, recurrence: TaskRecurrence, today: string, anchorDay?: number | null): string {
  const base = isValidISODate(due) ? due : today;
  const anchor = anchorDay ?? parseISODate(base).getDate();
  const step = (date: string): string => {
    if (recurrence === "diaria") return addDays(date, 1);
    if (recurrence === "semanal") return addDays(date, 7);
    if (recurrence === "mensal") return addMonths(date, 1, anchor);
    // dias úteis: o próximo dia de segunda a sexta
    let next = addDays(date, 1);
    while ([0, 6].includes(parseISODate(next).getDay())) next = addDays(next, 1);
    return next;
  };
  let next = step(base);
  for (let guard = 0; next <= today && guard < 5000; guard++) next = step(next);
  return next;
}

// ---------------------------------------------------------------------------
// Datas na tela
// ---------------------------------------------------------------------------

/** "Hoje", "Amanhã", "Ontem", "qua, 26/11" ou "26/11/2027" — e o horário, se houver. */
export function describeDue(due: string | null | undefined, time: string | null | undefined, today: string): string {
  if (!isValidISODate(due)) return time ?? "";
  const diff = daysBetween(today, due);
  let text: string;
  if (diff === 0) text = "Hoje";
  else if (diff === 1) text = "Amanhã";
  else if (diff === -1) text = "Ontem";
  else if (due.slice(0, 4) !== today.slice(0, 4)) text = `${due.slice(8, 10)}/${due.slice(5, 7)}/${due.slice(0, 4)}`;
  else text = formatWeekdayDate(due);
  return time ? `${text} ${time}` : text;
}

export type DueTone = "late" | "today" | "soon" | "later" | "none";

/** Atrasada (antes de hoje), hoje, nos próximos 7 dias, depois, ou sem data. */
export function dueTone(due: string | null | undefined, today: string): DueTone {
  if (!isValidISODate(due)) return "none";
  const diff = daysBetween(today, due);
  if (diff < 0) return "late";
  if (diff === 0) return "today";
  return diff <= 7 ? "soon" : "later";
}

/** "ter, 25 nov · Amanhã" para o título de um dia na lista "Em breve". */
export function dayHeading(date: string, today: string): string {
  const diff = daysBetween(today, date);
  const base = formatWeekdayDate(date);
  if (diff === 0) return `Hoje · ${base}`;
  if (diff === 1) return `Amanhã · ${base}`;
  return date.slice(0, 4) !== today.slice(0, 4) ? `${base}/${date.slice(0, 4)}` : base;
}

// ---------------------------------------------------------------------------
// Listas
// ---------------------------------------------------------------------------

export function isOpen(task: Pick<Task, "completed_at">): boolean {
  return !task.completed_at;
}

/**
 * O dia (AAAA-MM-DD, no horário de quem usa o painel) em que a tarefa foi feita.
 * (O banco guarda a hora em UTC: no Brasil, depois das 21h, a data em UTC já é a de amanhã.)
 */
export function completedDay(task: Pick<Task, "completed_at">): string | null {
  if (!task.completed_at) return null;
  const moment = new Date(task.completed_at);
  return Number.isNaN(moment.getTime()) ? task.completed_at.slice(0, 10) : toISODate(moment);
}

/** Ordem dentro de um dia: as com horário primeiro (pelo horário), depois pela prioridade e pela mais antiga. */
export function compareTasks(a: Task, b: Task): number {
  const dueA = a.due_date ?? "9999-99-99";
  const dueB = b.due_date ?? "9999-99-99";
  if (dueA !== dueB) return dueA.localeCompare(dueB);
  if (a.due_time !== b.due_time) {
    if (!a.due_time) return 1;
    if (!b.due_time) return -1;
    return a.due_time.localeCompare(b.due_time);
  }
  return readPriority(a.priority) - readPriority(b.priority) || a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id);
}

export interface TaskBuckets {
  /** Por fazer, com data antes de hoje. */
  late: Task[];
  today: Task[];
  /** De amanhã em diante, agrupadas por dia. */
  upcoming: Array<{ date: string; tasks: Task[] }>;
  noDate: Task[];
  /** Feitas nos últimos 30 dias, da mais recente para a mais antiga. */
  done: Task[];
}

export function bucketTasks(tasks: readonly Task[], today: string, doneDays = 30): TaskBuckets {
  const open = tasks.filter(isOpen).sort(compareTasks);
  const upcoming = new Map<string, Task[]>();
  const buckets: TaskBuckets = { late: [], today: [], upcoming: [], noDate: [], done: [] };
  for (const task of open) {
    if (!isValidISODate(task.due_date)) buckets.noDate.push(task);
    else if (task.due_date < today) buckets.late.push(task);
    else if (task.due_date === today) buckets.today.push(task);
    else upcoming.set(task.due_date, [...(upcoming.get(task.due_date) ?? []), task]);
  }
  buckets.upcoming = [...upcoming.entries()].map(([date, list]) => ({ date, tasks: list }));
  const since = addDays(today, -doneDays);
  buckets.done = tasks
    .filter((task) => (completedDay(task) ?? "") >= since)
    .sort((a, b) => (b.completed_at ?? "").localeCompare(a.completed_at ?? ""));
  return buckets;
}

// ---------------------------------------------------------------------------
// Adicionar rápido: entender a frase
// ---------------------------------------------------------------------------

export type QuickKind = "data" | "hora" | "prioridade" | "avatar" | "repeticao";

export interface QuickAdd {
  title: string;
  due_date: string | null;
  due_time: string | null;
  priority: TaskPriority;
  avatar_id: string | null;
  recurrence: TaskRecurrence | null;
  /** O que foi reconhecido na frase (a tela mostra, e deixa desligar cada tipo). */
  found: Array<{ kind: QuickKind; text: string }>;
  /** "#nonna" que serve para mais de um avatar (fica no título). */
  ambiguous: string | null;
}

const LETTER = "\\p{L}\\p{N}";
/** Começo de palavra: o início do texto ou um caractere que não é letra nem número (sem "lookbehind", que celulares antigos não entendem). */
const START = `(^|[^${LETTER}])`;
/** Fim de palavra. */
const END = `(?=$|[^${LETTER}])`;

const WEEKDAY_WORDS: Record<string, number> = { domingo: 0, segunda: 1, terca: 2, quarta: 3, quinta: 4, sexta: 5, sabado: 6 };
const WEEKDAY = "(segunda|terca|quarta|quinta|sexta)(?:[- ]feira)?|(sabado|domingo)";
const MONTHS = ["janeiro", "fevereiro", "marco", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const NUMBERS: Record<string, number> = {
  um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10, quinze: 15, vinte: 20, trinta: 30,
};
/** Palavras que vêm antes de uma data e saem junto com ela ("até sexta", "na segunda"). */
const BEFORE_DATE = "(?:(?:na|no|nesta|neste|nessa|nesse|ate|para|pra|em|a partir de|a partir da|a partir do)\\s+)?";

function regex(core: string): RegExp {
  return new RegExp(`${START}(${core})${END}`, "gu");
}

/** A data da próxima vez que cai aquele dia da semana (com `includeToday`, hoje vale). */
function nextWeekday(today: string, weekday: number, includeToday: boolean): string {
  const diff = (weekday - parseISODate(today).getDay() + 7) % 7;
  return addDays(today, diff === 0 && !includeToday ? 7 : diff);
}

/** O próximo dia N do mês (este mês, se ainda não passou; senão, o mês que vem). */
function nextDayOfMonth(today: string, day: number): string | null {
  if (day < 1 || day > 31) return null;
  const now = parseISODate(today);
  for (let add = 0; add < 3; add++) {
    const first = new Date(now.getFullYear(), now.getMonth() + add, 1);
    if (day > daysInMonth(first.getFullYear(), first.getMonth())) continue;
    const candidate = toISODate(new Date(first.getFullYear(), first.getMonth(), day));
    if (candidate >= today) return candidate;
  }
  return null;
}

/** Uma data dia/mês(/ano) que exista; sem ano, a próxima vez que ela cai. */
function explicitDate(today: string, day: number, month: number, year?: number): string | null {
  const build = (y: number) => {
    const date = new Date(y, month - 1, day);
    return date.getMonth() === month - 1 && date.getDate() === day ? toISODate(date) : null;
  };
  if (year !== undefined) return build(year < 100 ? 2000 + year : year);
  const thisYear = parseISODate(today).getFullYear();
  const candidate = build(thisYear);
  if (candidate && candidate >= today) return candidate;
  return build(thisYear + 1);
}

function amount(word: string): number | null {
  const n = Number(word);
  if (Number.isInteger(n) && n > 0 && n < 1000) return n;
  return NUMBERS[word] ?? null;
}

interface Hit {
  start: number;
  end: number;
}

/**
 * Lê a frase de uma tarefa nova e separa o que é data, horário, prioridade,
 * avatar (#nome) e repetição — o resto é o título. Quando há duas datas na
 * frase, vale a última ("loja de segunda mão amanhã" = amanhã).
 */
export function parseQuickAdd(
  text: string,
  today: string,
  avatars: ReadonlyArray<Pick<Avatar, "id" | "name">>,
  ignore: ReadonlySet<QuickKind> = new Set(),
): QuickAdd {
  const original = text.normalize("NFC");
  // a frase sem acentos e em minúsculas, do mesmo tamanho (as posições valem para as duas)
  let folded = original.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  if (folded.length !== original.length) folded = original.toLowerCase();
  if (folded.length !== original.length) folded = original;

  const taken: Hit[] = [];
  const overlaps = (start: number, end: number, list: readonly Hit[]) => list.some((hit) => start < hit.end && end > hit.start);
  /** As ocorrências de uma regra que não encostam no que já foi reconhecido (nem em `also`). */
  const scan = (pattern: RegExp, also: readonly Hit[] = []): Array<Hit & { groups: string[] }> => {
    const hits: Array<Hit & { groups: string[] }> = [];
    for (const match of folded.matchAll(pattern)) {
      const start = (match.index ?? 0) + match[1].length;
      const end = start + match[2].length;
      if (!overlaps(start, end, taken) && !overlaps(start, end, also)) {
        hits.push({ start, end, groups: match.slice(3).map((group) => group ?? "") });
      }
    }
    return hits;
  };
  const result: QuickAdd = {
    title: "",
    due_date: null,
    due_time: null,
    priority: 4,
    avatar_id: null,
    recurrence: null,
    found: [],
    ambiguous: null,
  };
  const found: Array<{ kind: QuickKind; text: string; start: number }> = [];
  const take = (kind: QuickKind, start: number, end: number) => {
    taken.push({ start, end });
    found.push({ kind, text: original.slice(start, end).trim(), start });
  };

  // --- prioridade: p1 … p4 (vale a última)
  if (!ignore.has("prioridade")) {
    const hits = scan(regex("p([1-4])"));
    const hit = hits[hits.length - 1];
    if (hit) {
      result.priority = readPriority(hit.groups[0]);
      take("prioridade", hit.start, hit.end);
    }
  }

  // --- avatar: #nome (pelo começo do nome ou de uma das palavras dele)
  if (!ignore.has("avatar")) {
    const named = avatars.map((avatar) => {
      const words = avatar.name
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .split(/[^\p{L}\p{N}]+/u)
        .filter(Boolean);
      return { avatar, compact: words.join(""), words };
    });
    for (const match of folded.matchAll(new RegExp(`#([${LETTER}][${LETTER}'’._-]*)`, "gu"))) {
      const start = match.index ?? 0;
      const end = start + match[0].length;
      if (overlaps(start, end, taken)) continue;
      const token = match[1].replace(/[^\p{L}\p{N}]/gu, "");
      const candidates = named.filter((entry) => entry.compact.startsWith(token) || entry.words.some((word) => word.startsWith(token)));
      const exact = candidates.filter((entry) => entry.compact === token || entry.words.includes(token));
      const chosen = candidates.length === 1 ? candidates[0] : exact.length === 1 ? exact[0] : null;
      if (chosen) {
        result.avatar_id = chosen.avatar.id;
        take("avatar", start, end);
        break;
      }
      if (candidates.length > 1) result.ambiguous = original.slice(start, end);
    }
  }

  // --- repetição (antes das datas: "toda segunda" não é "segunda")
  if (!ignore.has("repeticao")) {
    const rules: Array<{ core: string; apply: (groups: string[]) => void }> = [
      { core: "todos os dias uteis|todo dia util|dias uteis|de segunda a sexta", apply: () => (result.recurrence = "dias_uteis") },
      {
        core: "(?:todo dia|todos os dias) (\\d{1,2})",
        apply: ([day]) => {
          result.recurrence = "mensal";
          result.due_date = nextDayOfMonth(today, Number(day));
        },
      },
      { core: "todos os dias|todo dia|diariamente|diario", apply: () => (result.recurrence = "diaria") },
      { core: "todo mes|todos os meses|mensalmente", apply: () => (result.recurrence = "mensal") },
      { core: "toda semana|todas as semanas|semanalmente", apply: () => (result.recurrence = "semanal") },
      {
        core: "toda (segunda|terca|quarta|quinta|sexta)(?:[- ]feira)?|todas as (segundas|tercas|quartas|quintas|sextas)(?:[- ]feiras)?|todo (sabado|domingo)|todos os (sabados|domingos)",
        apply: (groups) => {
          const word = (groups.find(Boolean) ?? "").replace(/s$/, "");
          result.recurrence = "semanal";
          result.due_date = nextWeekday(today, WEEKDAY_WORDS[word] ?? 1, true);
        },
      },
    ];
    for (const rule of rules) {
      const hit = scan(regex(rule.core))[0];
      if (!hit) continue;
      rule.apply(hit.groups);
      take("repeticao", hit.start, hit.end);
      break;
    }
  }

  // --- data: vale a última da frase ("loja de segunda mão amanhã" = amanhã)
  if (!ignore.has("data")) {
    const rules: Array<{ core: string; date: (groups: string[]) => string | null }> = [
      { core: `${BEFORE_DATE}depois de amanha`, date: () => addDays(today, 2) },
      { core: `${BEFORE_DATE}amanha`, date: () => addDays(today, 1) },
      { core: `${BEFORE_DATE}hoje`, date: () => today },
      { core: `${BEFORE_DATE}(?:proxima semana|semana que vem)`, date: () => nextWeekday(today, 1, false) },
      {
        core: `${BEFORE_DATE}(?:(?:o |este |esse |neste |nesse )?(?:fim|final) de semana)`,
        date: () => ([0, 6].includes(parseISODate(today).getDay()) ? today : nextWeekday(today, 6, false)),
      },
      { core: `${BEFORE_DATE}(?:proximo mes|mes que vem)`, date: () => addMonths(today, 1) },
      {
        core: "(?:em|daqui a|daqui|dentro de) (\\d{1,3}|um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez|quinze|vinte|trinta) (dias?|semanas?|mes|meses)",
        date: ([n, unit]) => {
          const count = amount(n);
          if (count === null) return null;
          if (unit.startsWith("dia")) return addDays(today, count);
          if (unit.startsWith("semana")) return addDays(today, 7 * count);
          return addMonths(today, count);
        },
      },
      {
        core: `${BEFORE_DATE}(?:dia )?(\\d{1,2})/(\\d{1,2})(?:/(\\d{4}|\\d{2}))?`,
        date: ([day, month, year]) => explicitDate(today, Number(day), Number(month), year ? Number(year) : undefined),
      },
      {
        core: `${BEFORE_DATE}(?:dia )?(\\d{1,2}) de (${MONTHS.join("|")}|jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)(?: de (\\d{4}))?`,
        date: ([day, month, year]) => {
          const index = MONTHS.findIndex((name) => name.startsWith(month));
          return index < 0 ? null : explicitDate(today, Number(day), index + 1, year ? Number(year) : undefined);
        },
      },
      { core: `${BEFORE_DATE}dia (\\d{1,2})`, date: ([day]) => nextDayOfMonth(today, Number(day)) },
      {
        core: `${BEFORE_DATE}(?:(?:proxima|proximo) )?(?:${WEEKDAY})`,
        date: (groups) => {
          const word = groups.find((group) => group in WEEKDAY_WORDS) ?? "";
          return word ? nextWeekday(today, WEEKDAY_WORDS[word], false) : null;
        },
      },
    ];
    // (as regras mais compridas vêm primeiro: "depois de amanhã" é lido antes de "amanhã")
    const candidates: Array<Hit & { date: string }> = [];
    for (const rule of rules) {
      for (const hit of scan(regex(rule.core), candidates)) {
        const date = rule.date(hit.groups);
        if (date) candidates.push({ start: hit.start, end: hit.end, date });
      }
    }
    const chosen = candidates.reduce<(Hit & { date: string }) | null>((best, hit) => (!best || hit.start > best.start ? hit : best), null);
    if (chosen) {
      result.due_date = chosen.date;
      take("data", chosen.start, chosen.end);
    }
  }

  // --- horário: 14h, 14h30, 14:30, às 9h, meio-dia
  if (!ignore.has("hora")) {
    const rules: Array<{ core: string; time: (groups: string[]) => string | null }> = [
      {
        core: "(?:(?:as|a partir das|ate as|por volta das)\\s+)?(\\d{1,2})(?:h(\\d{2})?|:(\\d{2}))",
        time: ([hour, minutesA, minutesB]) => {
          const h = Number(hour);
          const m = Number(minutesA || minutesB || 0);
          return h <= 23 && m <= 59 ? `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}` : null;
        },
      },
      { core: "(?:(?:ao|as|a partir do)\\s+)?meio[- ]dia", time: () => "12:00" },
    ];
    for (const rule of rules) {
      const hit = scan(regex(rule.core)).find((entry) => rule.time(entry.groups));
      if (!hit) continue;
      result.due_time = rule.time(hit.groups);
      take("hora", hit.start, hit.end);
      break;
    }
    // horário sem data: hoje
    if (result.due_time && !result.due_date) result.due_date = today;
  }

  // repetição sem data: começa hoje
  if (result.recurrence && !result.due_date) result.due_date = today;

  // o título: a frase sem o que foi reconhecido
  let title = "";
  let cursor = 0;
  for (const range of [...taken].sort((a, b) => a.start - b.start)) {
    title += `${original.slice(cursor, range.start)} `;
    cursor = Math.max(cursor, range.end);
  }
  title += original.slice(cursor);
  title = title
    .replace(/\s+/g, " ")
    .trim()
    // palavra solta que sobrou no fim ("Gravar vídeo de" → "Gravar vídeo")
    .replace(/[\s,;:–-]+(de|do|da|na|no|em|para|pra|até|ate|às|as|a|e)$/iu, "")
    .replace(/^[\s,;:–-]+|[\s,;:–-]+$/g, "");
  result.title = title ? title.charAt(0).toUpperCase() + title.slice(1) : "";
  result.found = found.sort((a, b) => a.start - b.start).map(({ kind, text: piece }) => ({ kind, text: piece }));
  return result;
}
