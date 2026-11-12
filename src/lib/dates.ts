// Datas simples no formato "AAAA-MM-DD" (sem hora), sempre no horário local
// de quem está usando o painel.

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function toISODate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function todayISO(): string {
  return toISODate(new Date());
}

/** Converte "AAAA-MM-DD" em Date à meia-noite local (evita o erro de -1 dia do UTC). */
export function parseISODate(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

/** Data existente de verdade ("2026-02-31" e anos como "0026" não passam). */
export function isValidISODate(iso: string | null | undefined): iso is string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return false;
  const day = iso.slice(0, 10);
  const date = parseISODate(day);
  return !Number.isNaN(date.getTime()) && toISODate(date) === day;
}

export function addDays(iso: string, days: number): string {
  const d = parseISODate(iso);
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

/** Quantos dias de `from` até `to` (positivo se `to` é depois). */
export function daysBetween(from: string, to: string): number {
  const a = parseISODate(from);
  const b = parseISODate(to);
  const utcA = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const utcB = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((utcB - utcA) / MS_PER_DAY);
}

const dateFmt = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});
const shortFmt = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "short" });
const longFmt = new Intl.DateTimeFormat("pt-BR", {
  weekday: "long",
  day: "numeric",
  month: "long",
});
const dateTimeFmt = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/** 12/11/2026 */
export function formatDate(iso: string | null | undefined): string {
  if (!isValidISODate(iso)) return "—";
  return dateFmt.format(parseISODate(iso));
}

/** 12 de nov. */
export function formatDateShort(iso: string | null | undefined): string {
  if (!isValidISODate(iso)) return "—";
  return shortFmt.format(parseISODate(iso)).replace(".", "");
}

const weekdayFmt = new Intl.DateTimeFormat("pt-BR", { weekday: "short" });
const dayMonthFmt = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" });

/** "qui, 12/11" — dia da semana curto + dia e mês. */
export function formatWeekdayDate(iso: string | null | undefined): string {
  if (!isValidISODate(iso)) return "—";
  const date = parseISODate(iso);
  return `${weekdayFmt.format(date).replace(".", "")}, ${dayMonthFmt.format(date)}`;
}

/** "12/11" */
export function formatDayMonth(iso: string | null | undefined): string {
  if (!isValidISODate(iso)) return "—";
  return dayMonthFmt.format(parseISODate(iso));
}

/** quinta-feira, 12 de novembro */
export function formatDateLong(iso: string): string {
  return longFmt.format(parseISODate(iso));
}

/** 12/11/2026, 14:30 — para carimbos de data e hora completos. */
export function formatDateTime(timestamp: string | null | undefined): string {
  if (!timestamp) return "—";
  const d = new Date(timestamp);
  if (Number.isNaN(d.getTime())) return "—";
  return dateTimeFmt.format(d);
}

/** "hoje", "ontem", "há 5 dias", "em 3 dias" */
export function relativeDay(iso: string | null | undefined, today = todayISO()): string {
  if (!isValidISODate(iso)) return "—";
  const diff = daysBetween(iso, today);
  if (diff === 0) return "hoje";
  if (diff === 1) return "ontem";
  if (diff === -1) return "amanhã";
  if (diff > 1) return `há ${formatDuration(diff)}`;
  return `em ${formatDuration(-diff)}`;
}

/** 45 -> "45 dias"; 75 -> "2 meses e 15 dias" */
export function formatDuration(days: number): string {
  const n = Math.max(0, Math.round(days));
  if (n < 60) return n === 1 ? "1 dia" : `${n} dias`;
  const months = Math.floor(n / 30);
  const rest = n % 30;
  const m = months === 1 ? "1 mês" : `${months} meses`;
  if (rest === 0) return m;
  return `${m} e ${rest === 1 ? "1 dia" : `${rest} dias`}`;
}

/** Hora atual em um fuso (ex.: "14:32"), ou null se o fuso for inválido. */
export function timeInZone(timezone: string | null | undefined, now = new Date()): string | null {
  if (!timezone) return null;
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: timezone,
    }).format(now);
  } catch {
    return null;
  }
}
