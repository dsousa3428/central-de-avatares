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

/*
 * A repetição fica guardada como texto: "diaria", "dias_uteis", "semanal" ou
 * "mensal" — o padrão sai da data da tarefa ("toda semana" no dia da semana dela,
 * "todo mês" no dia do mês dela). Quando o padrão não pode sair da data, ele vai junto:
 *  - "semanal:1" = toda segunda (0 = domingo … 6 = sábado), mesmo que esta vez
 *    tenha sido passada para outro dia ("Mudar a data", "Passar para hoje");
 *  - "mensal:15" = todo dia 15, do mesmo jeito; e "mensal:31" = todo dia 31 (o último
 *    dia, nos meses mais curtos — sem isso, depois de fevereiro a tarefa cairia no dia 28).
 */

/** O dia do mês guardado na repetição ("mensal:15" → 15), ou null. */
export function monthlyAnchor(value: unknown): number | null {
  const match = typeof value === "string" ? /^mensal:([1-9]|[12]\d|3[01])$/.exec(value) : null;
  return match ? Number(match[1]) : null;
}

/** O dia da semana guardado na repetição ("semanal:1" → 1, segunda), ou null. */
export function weeklyAnchor(value: unknown): number | null {
  const match = typeof value === "string" ? /^semanal:([0-6])$/.exec(value) : null;
  return match ? Number(match[1]) : null;
}

export function readRecurrence(value: unknown): TaskRecurrence | null {
  if (monthlyAnchor(value) !== null) return "mensal";
  if (weeklyAnchor(value) !== null) return "semanal";
  return RECURRENCES.some((item) => item.value === value) ? (value as TaskRecurrence) : null;
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

/**
 * A repetição que vai para o banco quando o dono define a tarefa (ao criar, ou na
 * janela "Editar tarefa"): o padrão segue a data escolhida (guardando o dia 29, 30
 * ou 31). Se nem a data nem a repetição mudaram (`previous` e `previousDue` = como a
 * tarefa estava), fica tudo como estava — inclusive o dia guardado.
 */
export function encodeRecurrence(
  recurrence: TaskRecurrence | null,
  due: string | null | undefined,
  previous?: unknown,
  previousDue?: string | null,
): string | null {
  if (!recurrence) return null;
  const unchanged =
    typeof previous === "string" && readRecurrence(previous) === recurrence && previousDue !== undefined && (previousDue ?? null) === (due ?? null);
  if (unchanged) return previous;
  if (recurrence !== "mensal" || !isValidISODate(due)) return recurrence;
  const date = parseISODate(due);
  const day = date.getDate();
  const anchor = monthlyAnchor(previous);
  // (o dia 31 guardado continua quando a data nova é o "dia 31" daquele mês: 30/04, 28/02…)
  if (anchor !== null && anchor > 28 && day === Math.min(anchor, daysInMonth(date.getFullYear(), date.getMonth()))) return `mensal:${anchor}`;
  return day > 28 ? `mensal:${day}` : "mensal";
}

/**
 * A repetição de uma tarefa cuja data muda só desta vez ("Mudar a data", "Passar
 * para hoje"): o padrão continua o mesmo — "toda segunda" continua toda segunda,
 * "todo dia 15" continua dia 15 —, guardando o dia quando a data nova sai dele.
 */
export function keepPattern(previous: unknown, oldDue: string | null | undefined, newDue: string): string | null {
  const recurrence = readRecurrence(previous);
  if (recurrence !== "semanal" && recurrence !== "mensal") return recurrence;
  const base = isValidISODate(oldDue) ? oldDue : newDue;
  const target = parseISODate(newDue);
  if (recurrence === "semanal") {
    const weekday = weeklyAnchor(previous) ?? parseISODate(base).getDay();
    return target.getDay() === weekday ? "semanal" : `semanal:${weekday}`;
  }
  const day = monthlyAnchor(previous) ?? parseISODate(base).getDate();
  const onPattern = target.getDate() === Math.min(day, daysInMonth(target.getFullYear(), target.getMonth()));
  return onPattern && day <= 28 ? "mensal" : `mensal:${day}`;
}

/** Repetição em dias úteis não começa no fim de semana: a data anda até a segunda. */
export function alignStart(date: string, recurrence: TaskRecurrence | null): string {
  if (recurrence !== "dias_uteis") return date;
  let next = date;
  while ([0, 6].includes(parseISODate(next).getDay())) next = addDays(next, 1);
  return next;
}

const WEEKDAYS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

/** "Todo dia", "Dias úteis", "Toda segunda", "Todo sábado", "Todo dia 15". (Recebe o valor como está no banco.) */
export function recurrenceLabel(recurrence: unknown, due: string | null | undefined): string {
  const value = readRecurrence(recurrence);
  if (!value) return "";
  if (value === "diaria") return "Todo dia";
  if (value === "dias_uteis") return "Dias úteis";
  if (value === "semanal") {
    const day = weeklyAnchor(recurrence) ?? (isValidISODate(due) ? parseISODate(due).getDay() : null);
    if (day === null) return "Toda semana";
    return `${day === 0 || day === 6 ? "Todo" : "Toda"} ${WEEKDAYS[day]}`;
  }
  const monthDay = monthlyAnchor(recurrence) ?? (isValidISODate(due) ? parseISODate(due).getDate() : null);
  return monthDay === null ? "Todo mês" : `Todo dia ${monthDay}`;
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
 * A próxima data de uma tarefa que se repete, depois de concluída: sempre depois
 * de hoje (tarefa atrasada não "volta" para o passado) e depois da data desta vez.
 * Toda semana cai no dia da semana do padrão; todo mês, no dia do mês do padrão
 * (o guardado na repetição ou, sem ele, o da data). Recebe a repetição como está no banco.
 */
export function nextDue(due: string | null | undefined, recurrenceValue: unknown, today: string): string {
  const recurrence = readRecurrence(recurrenceValue) ?? "diaria";
  const base = isValidISODate(due) ? due : today;
  const weekday = weeklyAnchor(recurrenceValue) ?? parseISODate(base).getDay();
  const monthDay = monthlyAnchor(recurrenceValue) ?? parseISODate(base).getDate();
  // o dia do padrão num mês (o 31 vira o último dia nos meses mais curtos); o Date passa do mês 12 para janeiro sozinho
  const monthly = (year: number, month: number) => toISODate(new Date(year, month, Math.min(monthDay, daysInMonth(year, month))));
  const step = (date: string): string => {
    if (recurrence === "diaria") return addDays(date, 1);
    if (recurrence === "mensal") {
      // o próximo dia do padrão depois desta vez: no mesmo mês, se ainda não passou (esta vez pode ter sido
      // passada para outro dia: "todo dia 31" passado para o dia 20 volta no dia 30 de novembro)
      const current = parseISODate(date);
      const sameMonth = monthly(current.getFullYear(), current.getMonth());
      return sameMonth > date ? sameMonth : monthly(current.getFullYear(), current.getMonth() + 1);
    }
    let next = addDays(date, 1);
    if (recurrence === "semanal") {
      while (parseISODate(next).getDay() !== weekday) next = addDays(next, 1);
      return next;
    }
    // dias úteis: o próximo dia de segunda a sexta
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

export type QuickDateKey = "hoje" | "amanha" | "fim_de_semana" | "proxima_semana";

/**
 * Os atalhos de data (como no Todoist): hoje, amanhã, o fim de semana (o próximo
 * sábado; no sábado ou no domingo, hoje — a mesma regra da frase "fim de semana")
 * e a próxima semana (a próxima segunda). Um atalho que cairia no mesmo dia de um
 * anterior não aparece (na sexta, "Fim de semana" é "Amanhã").
 */
export function quickDates(today: string): Array<{ key: QuickDateKey; label: string; date: string }> {
  const weekend = [0, 6].includes(parseISODate(today).getDay()) ? today : nextWeekday(today, 6, false);
  const all: Array<{ key: QuickDateKey; label: string; date: string }> = [
    { key: "hoje", label: "Hoje", date: today },
    { key: "amanha", label: "Amanhã", date: addDays(today, 1) },
    { key: "fim_de_semana", label: "Fim de semana", date: weekend },
    { key: "proxima_semana", label: "Próxima semana", date: nextWeekday(today, 1, false) },
  ];
  return all.filter((option, index) => all.findIndex((other) => other.date === option.date) === index);
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
  /** A data escrita na frase (ou a primeira vez de "toda segunda", "todo dia 5"…). */
  due_date: string | null;
  /**
   * A data que a frase dá a entender sem dizer: horário ou repetição sem data valem
   * a partir de hoje (dias úteis, do próximo dia útil). Quem chama decide o que vale
   * mais: uma data escolhida fora da frase (a sugestão do dia de descanso, a lista de
   * hoje) ganha desta.
   */
  implied_date: string | null;
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
/** Fim de palavra no meio de uma regra. */
const WORD_END = `(?![${LETTER}])`;

const WEEKDAY_WORDS: Record<string, number> = { domingo: 0, segunda: 1, terca: 2, quarta: 3, quinta: 4, sexta: 5, sabado: 6 };
const WEEKDAY = "(segunda|terca|quarta|quinta|sexta)(?:[- ]feira)?|(sabado|domingo)";
/**
 * Palavras que, logo depois de "segunda", "terça"…, mostram que é um número
 * ordinal e não o dia da semana ("a segunda parte", "loja de segunda mão").
 */
const ORDINAL_NOUNS =
  "parte|partes|vez|vezes|versao|temporada|edicao|etapa|fase|aula|chance|opcao|via|mao|conta|geracao|rodada|tentativa|pagina|foto|imagem|linha|coluna|camada|serie|leva|turma|semana|metade";
const MONTHS = ["janeiro", "fevereiro", "marco", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const NUMBERS: Record<string, number> = {
  um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10, quinze: 15, vinte: 20, trinta: 30,
};
const AMOUNT = `\\d{1,3}|${Object.keys(NUMBERS).join("|")}`;
/** Palavras que vêm antes de uma data e saem junto com ela ("até sexta", "na segunda", "pro dia 5"). */
const BEFORE_DATE = "(?:(?:na|no|nesta|neste|nessa|nesse|ate|para|pra|pro|em|a partir de|a partir da|a partir do)\\s+)?";
/** Palavras soltas que ligavam a frase a um pedaço reconhecido e saem junto com ele ("até o", "para o"). */
const DANGLING = /(?:^|\s)(?:de|do|da|dos|das|na|no|nas|nos|em|para|pra|pro|até|ate|às|as|à|a|ao|o)\s*$/u;

function regex(core: string): RegExp {
  return new RegExp(`${START}(${core})${END}`, "gu");
}

/** A data da próxima vez que cai aquele dia da semana (com `includeToday`, hoje vale). */
function nextWeekday(today: string, weekday: number, includeToday: boolean): string {
  const diff = (weekday - parseISODate(today).getDay() + 7) % 7;
  return addDays(today, diff === 0 && !includeToday ? 7 : diff);
}

/** Aquele dia da semana, na semana que vem (de segunda a domingo). */
function weekdayOfNextWeek(today: string, weekday: number): string {
  return addDays(nextWeekday(today, 1, false), (weekday + 6) % 7);
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

/** O dia N do mês que vem (null se o mês não tem esse dia). */
function dayOfNextMonth(today: string, day: number): string | null {
  const now = parseISODate(today);
  const first = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  if (day < 1 || day > daysInMonth(first.getFullYear(), first.getMonth())) return null;
  return toISODate(new Date(first.getFullYear(), first.getMonth(), day));
}

/** N dias úteis (de segunda a sexta) depois de hoje. */
function addBusinessDays(today: string, count: number): string {
  let date = today;
  for (let left = count; left > 0; ) {
    date = addDays(date, 1);
    if (![0, 6].includes(parseISODate(date).getDay())) left -= 1;
  }
  return date;
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

type Found = Hit & { groups: string[] };

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
  const scan = (pattern: RegExp, also: readonly Hit[] = []): Found[] => {
    const hits: Found[] = [];
    for (const match of folded.matchAll(pattern)) {
      const start = (match.index ?? 0) + match[1].length;
      const end = start + match[2].length;
      if (!overlaps(start, end, taken) && !overlaps(start, end, also)) {
        hits.push({ start, end, groups: match.slice(3).map((group) => group ?? "") });
      }
    }
    return hits;
  };
  const before = (hit: Hit) => folded.slice(0, hit.start);
  const after = (hit: Hit) => folded.slice(hit.end);
  const result: QuickAdd = {
    title: "",
    due_date: null,
    implied_date: null,
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

  // --- avatar: #nome (o nome inteiro; ou o começo do nome ou de uma das palavras dele)
  if (!ignore.has("avatar")) {
    const named = avatars.map((avatar) => {
      const words = avatar.name
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
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
      // o nome inteiro vence ("#ana" é a Ana, mesmo existindo a Ana Clara); depois, uma palavra inteira
      const whole = candidates.filter((entry) => entry.compact === token);
      const word = candidates.filter((entry) => entry.words.includes(token));
      const chosen = whole.length === 1 ? whole[0] : candidates.length === 1 ? candidates[0] : word.length === 1 ? word[0] : null;
      if (chosen) {
        result.avatar_id = chosen.avatar.id;
        result.ambiguous = null;
        take("avatar", start, end);
        break;
      }
      if (candidates.length > 1) result.ambiguous = original.slice(start, end);
    }
  }

  // --- repetição (antes das datas: "toda segunda" não é "segunda")
  if (!ignore.has("repeticao")) {
    const validDay = (groups: string[]) => {
      const day = Number(groups.find(Boolean));
      return day >= 1 && day <= 31;
    };
    const monthlyOn = (groups: string[]) => {
      result.recurrence = "mensal";
      result.due_date = nextDayOfMonth(today, Number(groups.find(Boolean)));
    };
    const rules: Array<{ core: string; accept?: (hit: Found) => boolean; apply: (groups: string[]) => void }> = [
      {
        // ("em 5 dias úteis" é prazo, não repetição: fica para as datas)
        core: "todos os dias uteis|todo dia util|dias uteis|de segunda a sexta",
        accept: (hit) => !/\d\s*$/.test(before(hit)),
        apply: () => (result.recurrence = "dias_uteis"),
      },
      {
        // todo mês num dia certo, com todas as letras
        core: "todo dia (\\d{1,2}) (?:do|de cada) mes|todo mes (?:no )?dia (\\d{1,2})|todos os meses (?:no )?dia (\\d{1,2})|mensalmente (?:no )?dia (\\d{1,2})",
        accept: (hit) => validDay(hit.groups),
        apply: monthlyOn,
      },
      {
        // "todo dia 5" = todo mês no dia 5 — mas "todo dia 3 stories" é todo dia, 3 stories
        core: "todo dia (\\d{1,2})",
        accept: (hit) => {
          const next = /^\s+([\p{L}][\p{L}\p{N}]*)/u.exec(after(hit))?.[1];
          return validDay(hit.groups) && (!next || ["p1", "p2", "p3", "p4", "as", "ao", "ate", "a", "meio", "sem"].includes(next));
        },
        apply: monthlyOn,
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
      const hit = scan(regex(rule.core)).find((entry) => !rule.accept || rule.accept(entry));
      if (!hit) continue;
      rule.apply(hit.groups);
      take("repeticao", hit.start, hit.end);
      break;
    }
  }

  // --- data: vale a última da frase ("loja de segunda mão amanhã" = amanhã)
  if (!ignore.has("data")) {
    const weekdayOf = (groups: string[]) => {
      const word = groups.find((group) => group in WEEKDAY_WORDS);
      return word === undefined ? null : WEEKDAY_WORDS[word];
    };
    // (as regras mais compridas vêm primeiro: uma regra não reconhece o que uma anterior já pegou)
    const rules: Array<{ core: string; date: (groups: string[]) => string | null }> = [
      { core: `${BEFORE_DATE}depois de amanha`, date: () => addDays(today, 2) },
      { core: `${BEFORE_DATE}amanha`, date: () => addDays(today, 1) },
      { core: `${BEFORE_DATE}hoje`, date: () => today },
      {
        // "quarta da semana que vem" (sem esta regra, "semana que vem" daria a segunda)
        core: `${BEFORE_DATE}(?:${WEEKDAY}) (?:da|na) (?:proxima semana|semana que vem)`,
        date: (groups) => {
          const weekday = weekdayOf(groups);
          return weekday === null ? null : weekdayOfNextWeek(today, weekday);
        },
      },
      {
        // "fim de semana que vem" (antes de "semana que vem": não é a segunda)
        core: `${BEFORE_DATE}(?:o )?(?:proximo (?:fim|final) de semana|(?:fim|final) de semana que vem)`,
        date: () => nextWeekday(today, 6, false),
      },
      {
        core: `${BEFORE_DATE}(?:(?:o |este |esse |neste |nesse )?(?:fim|final) de semana)`,
        date: () => ([0, 6].includes(parseISODate(today).getDay()) ? today : nextWeekday(today, 6, false)),
      },
      { core: `${BEFORE_DATE}(?:proxima semana|semana que vem)`, date: () => nextWeekday(today, 1, false) },
      {
        // "dia 5 do mês que vem" (antes de "mês que vem" sozinho)
        core: `${BEFORE_DATE}(?:o )?dia (\\d{1,2}) (?:do|no) (?:mes que vem|proximo mes)`,
        date: ([day]) => dayOfNextMonth(today, Number(day)),
      },
      { core: `${BEFORE_DATE}(?:proximo mes|mes que vem)`, date: () => addMonths(today, 1) },
      {
        // prazo em dias úteis: conta só de segunda a sexta
        core: `(?:em|daqui a|daqui|dentro de) (${AMOUNT}) dias? uteis`,
        date: ([n]) => {
          const count = amount(n);
          return count === null ? null : addBusinessDays(today, count);
        },
      },
      {
        core: `(?:em|daqui a|daqui|dentro de) (${AMOUNT}) (dias?|semanas?|mes|meses)`,
        date: ([n, unit]) => {
          const count = amount(n);
          if (count === null) return null;
          if (unit.startsWith("dia")) return addDays(today, count);
          if (unit.startsWith("semana")) return addDays(today, 7 * count);
          return addMonths(today, count);
        },
      },
      {
        // dia/mês(/ano) — mas não "24/7" (o tempo todo) nem frações ("3/4 dos vídeos")
        core: `${BEFORE_DATE}(?:o )?(?:dia )?(?!24/7(?![\\p{L}\\p{N}/]))(\\d{1,2})/(\\d{1,2})(?:/(\\d{4}|\\d{2}))?(?!\\s+d(?:e|o|a|os|as)${WORD_END})`,
        date: ([day, month, year]) => explicitDate(today, Number(day), Number(month), year ? Number(year) : undefined),
      },
      {
        core: `${BEFORE_DATE}(?:o )?(?:dia )?(\\d{1,2}) de (${MONTHS.join("|")}|jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)(?: de (\\d{4}))?`,
        date: ([day, month, year]) => {
          const index = MONTHS.findIndex((name) => name.startsWith(month));
          return index < 0 ? null : explicitDate(today, Number(day), index + 1, year ? Number(year) : undefined);
        },
      },
      {
        // "dia 5" — mas não "dia 5 do aquecimento"
        core: `${BEFORE_DATE}(?:o )?dia (\\d{1,2})(?!\\s+d[oa]s?\\s+(?!mes${WORD_END})\\p{L})`,
        date: ([day]) => nextDayOfMonth(today, Number(day)),
      },
      {
        core: `${BEFORE_DATE}(?:(?:proxima|proximo) )?(?:${WEEKDAY})(?!\\s+(?:${ORDINAL_NOUNS})${WORD_END})(?: que vem)?`,
        date: (groups) => {
          const weekday = weekdayOf(groups);
          return weekday === null ? null : nextWeekday(today, weekday, false);
        },
      },
    ];
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

  // --- horário: 14h, 14h30, 14:30, às 9h, 3h da tarde, meio-dia (não: "2h de vídeo", "live de 2h")
  if (!ignore.has("hora")) {
    const duration = (hit: Found) =>
      /(?:^|[^\p{L}\p{N}])(?:de|por|durante|em|ha|uns|umas|cerca de)\s+$/u.test(before(hit)) || /^\s+(?:de|por)\s/u.test(after(hit));
    const rules: Array<{ core: string; accept?: (hit: Found) => boolean; time: (groups: string[]) => string | null }> = [
      {
        core: "(?:(?:as|a partir das|ate as|por volta das)\\s+)?(\\d{1,2})(?:h(\\d{2})?|:(\\d{2}))(?: (?:da (manha|tarde|noite)|de (madrugada)))?",
        accept: (hit) => !duration(hit),
        time: ([hour, minutesA, minutesB, period]) => {
          let h = Number(hour);
          const m = Number(minutesA || minutesB || 0);
          if (h > 23 || m > 59) return null;
          if ((period === "tarde" || period === "noite") && h < 12) h += 12;
          return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
        },
      },
      { core: "(?:(?:ao|as|a partir do)\\s+)?meio[- ]dia", time: () => "12:00" },
    ];
    for (const rule of rules) {
      const hit = scan(regex(rule.core)).find((entry) => (!rule.accept || rule.accept(entry)) && rule.time(entry.groups));
      if (!hit) continue;
      result.due_time = rule.time(hit.groups);
      take("hora", hit.start, hit.end);
      break;
    }
  }

  // horário ou repetição sem data: a partir de hoje (quem chama decide se outra data vale mais)
  if (!result.due_date && (result.due_time || result.recurrence)) result.implied_date = alignStart(today, result.recurrence);

  // o título: a frase sem o que foi reconhecido (e sem a palavra solta que ligava a frase a ele)
  let title = "";
  let cursor = 0;
  for (const range of [...taken].sort((a, b) => a.start - b.start)) {
    let piece = original.slice(cursor, range.start);
    for (let guard = 0; guard < 3 && DANGLING.test(piece); guard++) piece = piece.replace(DANGLING, "");
    title += `${piece} `;
    cursor = Math.max(cursor, range.end);
  }
  title += original.slice(cursor);
  title = title
    .replace(/\s+/g, " ")
    .replace(/ ([,.;:!?])/g, "$1")
    .trim()
    // (o "-" do começo fica quando foi escrito assim: "-10% no checkout")
    .replace(/^\s*[-–]/.test(original) ? /^\s+/ : /^[\s,;:–-]+/, "")
    .replace(/[\s,;:–-]+$/, "");
  // maiúscula no começo, se a primeira palavra estiver toda em minúsculas ("iPhone" fica como está)
  const first = title.split(" ")[0] ?? "";
  result.title = title && first === first.toLowerCase() ? title.charAt(0).toUpperCase() + title.slice(1) : title;
  result.found = found.sort((a, b) => a.start - b.start).map(({ kind, text: piece }) => ({ kind, text: piece }));
  return result;
}
