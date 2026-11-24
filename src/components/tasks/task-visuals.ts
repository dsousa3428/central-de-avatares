import { cn } from "@/lib/format";
import { readPriority, type DueTone } from "@/lib/tasks";

/** A cor do círculo pela prioridade, como no Todoist: P1 vermelho, P2 laranja, P3 azul, P4 neutro. */
export function priorityRing(priority: unknown): string {
  const p = readPriority(priority);
  return cn(
    p === 1 && "border-red-500 bg-red-500/10 dark:border-red-400",
    p === 2 && "border-orange-500 bg-orange-500/10 dark:border-orange-400",
    p === 3 && "border-sky-500 bg-sky-500/10 dark:border-sky-400",
    p === 4 && "border-line-strong",
  );
}

export function priorityText(priority: unknown): string {
  const p = readPriority(priority);
  return cn(
    p === 1 && "text-red-600 dark:text-red-400",
    p === 2 && "text-orange-600 dark:text-orange-400",
    p === 3 && "text-sky-700 dark:text-sky-400",
    p === 4 && "text-muted",
  );
}

/** A cor da data: atrasada em vermelho, hoje em verde, os próximos 7 dias na cor do painel. */
export function dueText(tone: DueTone): string {
  return cn(
    tone === "late" && "text-red-600 dark:text-red-400",
    tone === "today" && "text-emerald-700 dark:text-emerald-400",
    tone === "soon" && "text-primary",
    (tone === "later" || tone === "none") && "text-muted",
  );
}
