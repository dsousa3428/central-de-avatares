"use client";

import { useState } from "react";
import { Check, Pencil } from "lucide-react";
import { formatWeekdayDate, isValidISODate, todayISO } from "@/lib/dates";
import { errorMessage } from "@/lib/errors";
import { cn } from "@/lib/format";
import { nextRestDay } from "@/lib/smart-tasks";
import { useStore } from "@/lib/store";
import { rescheduleTask } from "@/lib/task-actions";
import { describeDue, quickDates, readRecurrence, recurrenceLabel } from "@/lib/tasks";
import type { Task } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Field, FormError, Input } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";

/**
 * Mudar só a data de uma tarefa, com um toque (como o "agendar" do Todoist):
 * hoje, amanhã, o próximo dia de descanso da conta do avatar, o fim de semana,
 * a próxima semana — ou outro dia e horário. O resto se edita em "Editar tudo".
 */
export function TaskDateMenu({ task, onClose, onEditAll }: { task: Task; onClose: () => void; onEditAll: () => void }) {
  const db = useStore();
  const toast = useToast();
  const today = todayISO();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [date, setDate] = useState(task.due_date ?? "");
  const [time, setTime] = useState(task.due_time ?? "");
  const recurrence = readRecurrence(task.recurrence);
  const rest = task.avatar_id ? nextRestDay(db, task.avatar_id, today) : null;

  // o próximo descanso da conta (o melhor dia para adiantar o que é daquele avatar): se cai num
  // dos atalhos, o atalho diz isso; senão, vira um atalho a mais
  const restNote = rest ? `dia de descanso de @${rest.handle}` : "";
  const quick = quickDates(today).map((option) => ({ ...option, note: rest && option.date === rest.date ? restNote : "" }));
  const options: Array<{ key: string; label: string; date: string; note: string }> = [...quick.slice(0, 2)];
  if (rest && !quick.some((option) => option.date === rest.date)) {
    options.push({ key: "descanso", label: "Descanso da conta", date: rest.date, note: restNote });
  }
  options.push(...quick.slice(2));

  async function apply(due: string | null, newTime?: string | null) {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      await rescheduleTask(task, due, newTime);
      const shownTime = due ? (newTime === undefined ? task.due_time : newTime) : null;
      toast.success(due ? `Nova data: ${describeDue(due, shownTime, today)}` : "Tarefa sem data");
      onClose();
    } catch (err) {
      setError(errorMessage(err));
      setSaving(false);
    }
  }

  function applyOther() {
    if (!date) {
      setError("Escolha o dia.");
      return;
    }
    if (!isValidISODate(date)) {
      setError("A data não existe. Confira o dia e o mês.");
      return;
    }
    if (time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
      setError("Horário inválido. Use o formato 14:30.");
      return;
    }
    void apply(date, time || null);
  }

  const now = task.due_date
    ? `${describeDue(task.due_date, task.due_time, today)}${recurrence ? ` · ${recurrenceLabel(task.recurrence, task.due_date)}` : ""}`
    : "sem data";

  return (
    <Modal open onClose={onClose} title="Mudar a data" description={task.title} size="sm" canClose={!saving}>
      <p className="mb-3 text-sm text-muted">
        Agora: <span className="font-medium text-fg">{now}</span>
      </p>
      <div className="grid gap-2">
        {options.map((option) => {
          const current = option.date === task.due_date;
          return (
            <button
              key={option.key}
              type="button"
              disabled={saving || current}
              onClick={() => void apply(option.date)}
              className={cn(
                "flex min-h-12 items-center justify-between gap-3 rounded-xl border px-4 py-2.5 text-left transition-colors",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-default",
                current ? "border-primary/40 bg-primary-soft" : "border-line hover:bg-surface-2 disabled:opacity-60",
              )}
            >
              <span className="min-w-0">
                <span className="flex items-center gap-2 font-medium">
                  {current ? <Check className="size-4 shrink-0 text-primary" aria-hidden /> : null}
                  {option.label}
                </span>
                {option.note ? <span className="block text-xs text-muted">{option.note}</span> : null}
              </span>
              <span className="shrink-0 text-sm text-muted">{formatWeekdayDate(option.date)}</span>
            </button>
          );
        })}
        {task.due_date && !recurrence ? (
          <button
            type="button"
            disabled={saving}
            onClick={() => void apply(null)}
            className="flex min-h-12 items-center rounded-xl border border-line px-4 py-2.5 text-left font-medium transition-colors hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-60"
          >
            Sem data
          </button>
        ) : null}
      </div>

      <div className="mt-4 border-t border-line pt-4">
        <p className="text-[15px] font-medium">Outro dia</p>
        <div className="mt-2 grid grid-cols-2 gap-3">
          <Field label="Data">
            <Input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          </Field>
          <Field label="Horário" optional>
            <Input type="time" value={time} onChange={(event) => setTime(event.target.value)} />
          </Field>
        </div>
        <Button className="mt-3" block onClick={applyOther} loading={saving}>
          Salvar a data
        </Button>
      </div>

      {recurrence ? (
        <p className="mt-3 text-xs leading-relaxed text-muted">
          Esta tarefa se repete ({recurrenceLabel(task.recurrence, task.due_date).toLowerCase()}): muda só desta vez — depois,
          a repetição continua igual. Para mudar a repetição, use “Editar tudo”.
        </p>
      ) : null}
      {error ? (
        <div className="mt-3">
          <FormError message={error} />
        </div>
      ) : null}

      <div className="mt-3 border-t border-line pt-3">
        <Button variant="ghost" onClick={onEditAll} disabled={saving}>
          <Pencil className="size-4" /> Editar tudo
        </Button>
      </div>
    </Modal>
  );
}
