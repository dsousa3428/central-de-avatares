"use client";

import { useMemo } from "react";
import Link from "next/link";
import { ListChecks, Sparkles } from "lucide-react";
import { todayISO } from "@/lib/dates";
import { plural } from "@/lib/format";
import { buildAutoTasks } from "@/lib/smart-tasks";
import { useStore } from "@/lib/store";
import { compareTasks, isOpen } from "@/lib/tasks";
import type { Avatar } from "@/lib/types";
import { buttonClass } from "@/components/ui/button";
import { Section } from "@/components/ui/card";
import { QuickAdd } from "./quick-add";
import { TaskList } from "./task-list";

const SHOWN = 5;

/** Na Visão geral do avatar: as tarefas dele (as primeiras), o campo para anotar mais uma e o atalho para a tela Tarefas. */
export function AvatarTasks({ avatar }: { avatar: Avatar }) {
  const db = useStore();
  const today = todayISO();
  const open = useMemo(
    () => db.tasks.filter((task) => task.avatar_id === avatar.id && isOpen(task)).sort(compareTasks),
    [db.tasks, avatar.id],
  );
  const suggested = useMemo(
    () => buildAutoTasks(db, today).filter((task) => task.avatarId === avatar.id).length,
    [db, today, avatar.id],
  );
  const href = `/tarefas?avatar=${avatar.id}`;
  return (
    <Section
      title="Tarefas"
      subtitle={open.length > 0 ? `${plural(open.length, "tarefa", "tarefas")} por fazer deste avatar.` : "Nenhuma tarefa sua deste avatar."}
      className="md:col-span-2"
      actions={
        <Link href={href} className={buttonClass("secondary", "sm")}>
          <ListChecks className="size-4" /> Ver todas
        </Link>
      }
    >
      {open.length > 0 ? <TaskList tasks={open.slice(0, SHOWN)} today={today} /> : null}
      {open.length > SHOWN ? (
        <Link href={href} className="mb-1 block py-1 text-sm text-muted hover:underline">
          e mais {open.length - SHOWN} — ver todas em Tarefas
        </Link>
      ) : null}
      <QuickAdd defaultAvatar={avatar.id} className={open.length > 0 ? "mt-2" : undefined} />
      {suggested > 0 ? (
        <Link href={href} className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline">
          <Sparkles className="size-4 shrink-0" aria-hidden />
          {suggested === 1 ? "Ver a sugestão do painel" : `Ver as ${suggested} sugestões do painel`}
        </Link>
      ) : null}
    </Section>
  );
}
