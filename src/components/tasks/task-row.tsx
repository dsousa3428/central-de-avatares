"use client";

import { useState } from "react";
import Link from "next/link";
import { CalendarClock, CalendarDays, Check, Clock, ExternalLink, Repeat, Sparkles } from "lucide-react";
import { cn } from "@/lib/format";
import type { AutoTask } from "@/lib/smart-tasks";
import { completeAutoTask, completeTask, reopenTask } from "@/lib/task-actions";
import { completedDay, describeDue, dueTone, readRecurrence, recurrenceLabel } from "@/lib/tasks";
import type { Task } from "@/lib/types";
import { Button, buttonClass } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { TaskDateMenu } from "./date-menu";
import { dueText, priorityRing } from "./task-visuals";

/**
 * Uma tarefa escrita pelo dono: o círculo conclui (ou, nas feitas, desfaz), o texto
 * abre para editar tudo e o calendário muda só a data.
 */
export function TaskRow({
  task,
  today,
  avatarLabel,
  onEdit,
}: {
  task: Task;
  today: string;
  /** "🇮🇹 Fra' Salvio" — vazio quando a lista já é de um avatar só. */
  avatarLabel?: string;
  onEdit: () => void;
}) {
  const toast = useToast();
  // (toque duplo no círculo: o segundo é ignorado enquanto o primeiro grava)
  const [saving, setSaving] = useState(false);
  const [dating, setDating] = useState(false);
  const done = Boolean(task.completed_at);
  const doneOn = completedDay(task);
  const recurrence = readRecurrence(task.recurrence);
  const tone = done ? "none" : dueTone(task.due_date, today);

  async function toggle() {
    if (saving) return;
    setSaving(true);
    try {
      if (done) {
        await reopenTask(task);
        toast.success("Tarefa de volta à lista");
      } else {
        const next = await completeTask(task, today);
        toast.success(next ? `Feita! Próxima vez: ${describeDue(next, task.due_time, today)}` : "Tarefa concluída");
      }
    } catch (err) {
      toast.error(err);
    } finally {
      setSaving(false);
    }
  }

  const checked = done || saving;
  return (
    <li className="flex items-start gap-3 py-2.5">
      <button
        type="button"
        role="checkbox"
        aria-checked={done}
        aria-label={done ? `Desfazer: ${task.title}` : `Concluir: ${task.title}`}
        onClick={() => void toggle()}
        className={cn(
          "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
          checked ? "border-emerald-500 bg-emerald-500 text-white" : priorityRing(task.priority),
        )}
      >
        {checked ? <Check className="size-3.5" strokeWidth={3} /> : null}
      </button>
      <button
        type="button"
        onClick={onEdit}
        className="min-w-0 flex-1 rounded-lg text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        aria-label={`Editar: ${task.title}`}
      >
        <p className={cn("text-[15px] leading-snug", done && "text-muted line-through")}>{task.title}</p>
        {task.notes ? <p className="mt-0.5 line-clamp-2 whitespace-pre-wrap text-sm text-muted">{task.notes}</p> : null}
        <Meta
          due={done ? null : task.due_date}
          time={done ? null : task.due_time}
          tone={tone}
          today={today}
          repeat={recurrence ? recurrenceLabel(task.recurrence, task.due_date) : ""}
          avatar={avatarLabel}
          extra={done && doneOn ? `feita ${describeDue(doneOn, null, today).toLowerCase()}` : ""}
        />
      </button>
      {!done ? (
        <Button
          variant="ghost"
          size="sm"
          iconOnly
          aria-label={`Mudar a data: ${task.title}`}
          title="Mudar a data"
          onClick={() => setDating(true)}
          className="-mr-2 shrink-0 text-muted"
        >
          <CalendarClock className="size-4" />
        </Button>
      ) : null}
      {dating ? (
        <TaskDateMenu
          task={task}
          onClose={() => setDating(false)}
          onEditAll={() => {
            setDating(false);
            onEdit();
          }}
        />
      ) : null}
    </li>
  );
}

/** Uma tarefa que o painel sugere: concluir marca a coisa de verdade (ou, quando não dá, abre o lugar). */
export function AutoTaskRow({ task, today, avatarLabel }: { task: AutoTask; today: string; avatarLabel?: string }) {
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const tone = dueTone(task.due, today);

  async function complete() {
    if (saving) return;
    setSaving(true);
    try {
      await completeAutoTask(task);
      toast.success("Feito — marcado no painel");
    } catch (err) {
      toast.error(err);
    } finally {
      // (quando dá certo a linha some da lista; se ainda estiver aqui, o círculo volta a aceitar o toque)
      setSaving(false);
    }
  }

  return (
    <li className="flex items-start gap-3 py-2.5">
      {task.target ? (
        <button
          type="button"
          role="checkbox"
          aria-checked={false}
          aria-label={`Concluir: ${task.title}`}
          onClick={() => void complete()}
          className={cn(
            "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border-2 border-dashed transition-colors",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
            saving ? "border-solid border-emerald-500 bg-emerald-500 text-white" : priorityRing(task.priority),
          )}
        >
          {saving ? <Check className="size-3.5" strokeWidth={3} /> : null}
        </button>
      ) : (
        <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center text-primary" aria-hidden>
          <Sparkles className="size-4" />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-baseline gap-x-2 text-[15px] leading-snug">
          <span className="min-w-0">{task.title}</span>
          <span className="inline-flex items-center gap-1 text-xs font-medium text-primary">
            <Sparkles className="size-3" aria-hidden /> do painel
          </span>
        </p>
        <p className="mt-0.5 text-sm leading-relaxed text-muted">{task.reason}</p>
        <Meta due={task.due} time={null} tone={tone} today={today} repeat="" avatar={avatarLabel} extra="" />
      </div>
      <Link href={task.href} className={cn(buttonClass("ghost", "sm"), "-mr-2 shrink-0 text-muted")} aria-label={`Abrir: ${task.title}`}>
        <ExternalLink className="size-4" />
      </Link>
    </li>
  );
}

function Meta({
  due,
  time,
  tone,
  today,
  repeat,
  avatar,
  extra,
}: {
  due: string | null;
  time: string | null;
  tone: ReturnType<typeof dueTone>;
  today: string;
  repeat: string;
  avatar?: string;
  extra: string;
}) {
  if (!due && !time && !repeat && !avatar && !extra) return null;
  return (
    <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs">
      {due ? (
        <span className={cn("inline-flex items-center gap-1 font-medium", dueText(tone))}>
          <CalendarDays className="size-3.5" aria-hidden />
          {tone === "late" ? `${describeDue(due, null, today)} (atrasada)` : describeDue(due, null, today)}
        </span>
      ) : null}
      {time ? (
        <span className={cn("inline-flex items-center gap-1 font-medium", dueText(tone))}>
          <Clock className="size-3.5" aria-hidden />
          {time}
        </span>
      ) : null}
      {repeat ? (
        <span className="inline-flex items-center gap-1 text-muted">
          <Repeat className="size-3.5" aria-hidden />
          {repeat}
        </span>
      ) : null}
      {avatar ? <span className="min-w-0 text-muted">{avatar}</span> : null}
      {extra ? <span className="text-muted">{extra}</span> : null}
    </p>
  );
}
