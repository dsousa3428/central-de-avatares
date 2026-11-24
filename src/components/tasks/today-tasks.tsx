"use client";

import { useMemo } from "react";
import Link from "next/link";
import { ChevronRight, ListChecks, Sparkles } from "lucide-react";
import { todayISO } from "@/lib/dates";
import { plural } from "@/lib/format";
import { buildAutoTasks } from "@/lib/smart-tasks";
import { useStore } from "@/lib/store";
import { bucketTasks } from "@/lib/tasks";
import { buttonClass } from "@/components/ui/button";
import { Card, Section } from "@/components/ui/card";
import { QuickAdd } from "./quick-add";
import { TaskList } from "./task-list";
import { useAvatarLabels } from "./use-avatar-labels";

/** Na tela Hoje: as suas tarefas atrasadas e de hoje, e o campo para anotar mais uma. */
export function TodayTasks() {
  const db = useStore();
  const today = todayISO();
  const labelOf = useAvatarLabels();
  const buckets = useMemo(() => bucketTasks(db.tasks, today), [db.tasks, today]);
  const suggested = useMemo(
    () => (db.tasksReady ? buildAutoTasks(db, today).filter((task) => task.today).length : 0),
    [db, today],
  );

  if (!db.tasksReady) {
    // (a tabela das tarefas só existe depois que o script SQL atualizado roda uma vez)
    return (
      <Link
        href="/tarefas"
        className="block rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <Card className="flex items-center gap-3 p-4 transition-colors hover:bg-surface-2/60">
          <ListChecks className="size-5 shrink-0 text-primary" aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="block font-medium">Tarefas (novidade)</span>
            <span className="block text-sm text-muted">Para começar a usar, falta atualizar o banco uma vez. Toque para ver como.</span>
          </span>
          <ChevronRight className="size-4 shrink-0 text-muted" aria-hidden />
        </Card>
      </Link>
    );
  }

  const list = [...buckets.late, ...buckets.today];
  const summary = [
    buckets.late.length > 0 ? plural(buckets.late.length, "atrasada", "atrasadas") : "",
    buckets.today.length > 0 ? `${buckets.today.length} para hoje` : "",
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <Section
      title="Minhas tarefas"
      subtitle={summary || "Nada seu marcado para hoje."}
      actions={
        <Link href="/tarefas" className={buttonClass("secondary", "sm")}>
          Ver todas
        </Link>
      }
    >
      {list.length > 0 ? <TaskList tasks={list} today={today} avatarLabel={labelOf} /> : null}
      <QuickAdd defaultDate={today} className={list.length > 0 ? "mt-2" : undefined} />
      {suggested > 0 ? (
        <Link href="/tarefas" className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline">
          <Sparkles className="size-4 shrink-0" aria-hidden />
          {suggested === 1 ? "Ver a sugestão do painel" : `Ver as ${suggested} sugestões do painel`}
        </Link>
      ) : null}
    </Section>
  );
}
