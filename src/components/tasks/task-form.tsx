"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { formatWeekdayDate, isValidISODate, todayISO } from "@/lib/dates";
import { nextRestDay } from "@/lib/smart-tasks";
import { useStore } from "@/lib/store";
import { createTask, deleteTask, updateTask } from "@/lib/task-actions";
import {
  alignStart,
  encodeRecurrence,
  PRIORITIES,
  quickDates,
  readPriority,
  readRecurrence,
  recurrenceLabel,
  RECURRENCES,
} from "@/lib/tasks";
import type { Task, TaskPriority, TaskRecurrence } from "@/lib/types";
import { invalid } from "@/components/common/validation";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { FormModal } from "@/components/ui/modal";
import { Segmented } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";

/** Criar ou editar uma tarefa com todos os detalhes (o jeito rápido fica no campo do topo da tela). */
export function TaskForm({
  task,
  initialAvatar,
  initialDate,
  onClose,
}: {
  task: Task | null;
  initialAvatar?: string | null;
  initialDate?: string | null;
  onClose: () => void;
}) {
  const db = useStore();
  const toast = useToast();
  const confirm = useConfirm();
  const today = todayISO();
  const [values, setValues] = useState(() => ({
    title: task?.title ?? "",
    notes: task?.notes ?? "",
    due_date: task ? (task.due_date ?? "") : (initialDate ?? ""),
    due_time: task?.due_time ?? "",
    priority: task ? readPriority(task.priority) : (4 as TaskPriority),
    avatar: task ? (task.avatar_id ?? "") : (initialAvatar ?? ""),
    recurrence: (task ? (readRecurrence(task.recurrence) ?? "") : "") as TaskRecurrence | "",
  }));
  const set = <K extends keyof typeof values>(key: K, value: (typeof values)[K]) => setValues((now) => ({ ...now, [key]: value }));
  const avatarId = db.avatars.some((avatar) => avatar.id === values.avatar) ? values.avatar : "";
  const rest = avatarId ? nextRestDay(db, avatarId, today) : null;
  // a data que vai ser gravada: repetir, ou ter horário, sem data, começa hoje (dias úteis: no próximo dia útil)
  const start = values.due_date || (values.recurrence || values.due_time ? today : "");
  const due = start && values.recurrence && isValidISODate(start) ? alignStart(start, values.recurrence) : start;
  // como a repetição vai ficar, do jeito que será gravada ("Toda quarta", "Todo dia 31")
  const pattern = values.recurrence
    ? recurrenceLabel(encodeRecurrence(values.recurrence, due || null, task?.recurrence, task ? task.due_date : undefined), due || null)
    : "";

  async function submit() {
    const title = values.title.trim();
    if (!title) invalid("Escreva o que fazer.");
    if (values.due_date && !isValidISODate(values.due_date)) invalid("A data não existe. Confira o dia e o mês.");
    if (values.due_time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(values.due_time)) invalid("Horário inválido. Use o formato 14:30.");
    const data = {
      title,
      notes: values.notes.trim() || null,
      due_date: due || null,
      due_time: values.due_time || null,
      priority: values.priority,
      avatar_id: avatarId || null,
      recurrence: values.recurrence || null,
    };
    if (task) {
      await updateTask(task, data);
      toast.success("Tarefa salva");
    } else {
      await createTask(data);
      toast.success("Tarefa adicionada");
    }
  }

  async function remove() {
    if (!task) return;
    const ok = await confirm({ title: "Apagar esta tarefa?", message: "Esta ação não pode ser desfeita.", confirmLabel: "Apagar", tone: "danger" });
    if (!ok) return;
    try {
      await deleteTask(task);
      toast.success("Tarefa apagada");
      onClose();
    } catch (err) {
      toast.error(err);
    }
  }

  // o próximo descanso da conta: se cai num dos atalhos, o atalho diz isso; senão, vira um atalho a mais
  const shortcuts = quickDates(today).map((option) => ({
    label: rest && option.date === rest.date ? `${option.label} (descanso da conta)` : option.label,
    date: option.date,
  }));
  const quick: Array<{ label: string; date: string }> = [
    ...shortcuts.slice(0, 2),
    ...(rest && !shortcuts.some((option) => option.date === rest.date)
      ? [{ label: `Descanso da conta (${formatWeekdayDate(rest.date)})`, date: rest.date }]
      : []),
    ...shortcuts.slice(2),
  ];

  return (
    <FormModal
      title={task ? "Editar tarefa" : "Nova tarefa"}
      onClose={onClose}
      onSubmit={submit}
      extraActions={
        task ? (
          <Button variant="danger-ghost" onClick={() => void remove()} className="md:mr-auto">
            <Trash2 className="size-4" /> Apagar
          </Button>
        ) : null
      }
    >
      <Field label="O que fazer">
        <Input value={values.title} onChange={(e) => set("title", e.target.value)} autoComplete="off" placeholder="Ex.: Gravar 3 vídeos da Nonna" />
      </Field>
      <Field label="Descrição" optional>
        <Textarea value={values.notes} onChange={(e) => set("notes", e.target.value)} rows={2} autoComplete="off" />
      </Field>
      <div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Data" optional>
            <Input type="date" value={values.due_date} onChange={(e) => set("due_date", e.target.value)} />
          </Field>
          <Field label="Horário" optional>
            <Input type="time" value={values.due_time} onChange={(e) => set("due_time", e.target.value)} />
          </Field>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {quick.map((option) => (
            <Button
              key={option.label}
              size="sm"
              variant={values.due_date === option.date ? "soft" : "secondary"}
              onClick={() => set("due_date", option.date)}
            >
              {option.label}
            </Button>
          ))}
          {values.due_date ? (
            <Button size="sm" variant="ghost" onClick={() => setValues((now) => ({ ...now, due_date: "", due_time: "", recurrence: "" }))}>
              Sem data
            </Button>
          ) : null}
        </div>
      </div>
      <Field label="Prioridade">
        <Segmented
          ariaLabel="Prioridade"
          value={String(values.priority)}
          onChange={(value) => set("priority", readPriority(value))}
          items={PRIORITIES.map((item) => ({ value: String(item.value), label: item.label }))}
        />
      </Field>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Avatar">
          <Select value={avatarId} onChange={(e) => set("avatar", e.target.value)}>
            <option value="">Geral (nenhum avatar)</option>
            {db.avatars.map((avatar) => {
              const flag = db.countries.find((country) => country.id === avatar.country_id)?.flag;
              return (
                <option key={avatar.id} value={avatar.id}>
                  {flag ? `${flag} ` : ""}
                  {avatar.name}
                </option>
              );
            })}
          </Select>
        </Field>
        <Field label="Repetir">
          <Select value={values.recurrence} onChange={(e) => set("recurrence", e.target.value as TaskRecurrence | "")}>
            <option value="">Não repete</option>
            {RECURRENCES.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      {values.recurrence ? (
        <p className="text-xs leading-relaxed text-muted">
          <strong className="font-semibold text-fg">{pattern}</strong> — tarefa que se repete não some ao concluir: a data
          anda para a próxima vez.
        </p>
      ) : null}
    </FormModal>
  );
}
