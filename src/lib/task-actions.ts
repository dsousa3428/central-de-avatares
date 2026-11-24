"use client";

// Tarefas: as gravações (as regras ficam em ./tasks e ./smart-tasks).
//
// Concluir uma tarefa espera o banco confirmar (a linha some da lista só depois):
// se sumisse antes, a de baixo subiria para debaixo do dedo — e um erro deixaria
// a tarefa "feita" na tela sem estar feita de verdade.

import { setStepDone } from "./funnels";
import { setChecklistItem } from "./replacement-actions";
import type { AutoTask } from "./smart-tasks";
import { deleteRow, getStore, insertRow, updateRow } from "./store";
import { setStructureDone } from "./structure";
import { encodeRecurrence, monthlyAnchor, nextDue, readRecurrence } from "./tasks";
import type { Task, TaskPriority, TaskRecurrence } from "./types";
import { markDay } from "./warmup-actions";

export interface TaskValues {
  title: string;
  notes: string | null;
  due_date: string | null;
  due_time: string | null;
  priority: TaskPriority;
  avatar_id: string | null;
  recurrence: TaskRecurrence | null;
}

export function createTask(values: TaskValues): Promise<Task> {
  return insertRow("tasks", { ...values, recurrence: encodeRecurrence(values.recurrence, values.due_date) });
}

export function updateTask(task: Task, values: TaskValues): Promise<void> {
  return updateRow("tasks", task.id, { ...values, recurrence: encodeRecurrence(values.recurrence, values.due_date, task.recurrence) });
}

/**
 * Conclui a tarefa. Se ela se repete, não fica feita: a data anda para a
 * próxima vez (devolvida, para a tela avisar). Senão, devolve null.
 */
export async function completeTask(task: Task, today: string): Promise<string | null> {
  const recurrence = readRecurrence(task.recurrence);
  let next: string | null = null;
  await updateRow("tasks", task.id, (row) => {
    if (row.completed_at) return null;
    const repeat = readRecurrence(row.recurrence) ?? recurrence;
    if (repeat) {
      next = nextDue(row.due_date, repeat, today, monthlyAnchor(row.recurrence));
      return { due_date: next };
    }
    next = null;
    return { completed_at: new Date().toISOString() };
  });
  return next;
}

/** Desfaz o "feito". */
export function reopenTask(task: Task): Promise<void> {
  return updateRow("tasks", task.id, (row) => (row.completed_at ? { completed_at: null } : null));
}

export function deleteTask(task: Task): Promise<void> {
  return deleteRow("tasks", task.id);
}

/** Passa as tarefas atrasadas para hoje (de uma vez). */
export async function moveToToday(tasks: readonly Task[], today: string): Promise<void> {
  await Promise.all(
    tasks.map((task) => updateRow("tasks", task.id, (row) => (row.completed_at || row.due_date === today ? null : { due_date: today }))),
  );
}

/** Conclui uma tarefa sugerida pelo painel: marca a coisa de verdade, no lugar dela. */
export async function completeAutoTask(task: AutoTask): Promise<void> {
  const target = task.target;
  if (!target) return;
  const wait = { optimistic: false };
  switch (target.kind) {
    case "estrutura":
      await updateRow(
        "avatars",
        target.avatarId,
        (row) => {
          const next = setStructureDone(row.kit, target.step, true);
          return next === row.kit ? null : { kit: next };
        },
        wait,
      );
      return;
    case "funil":
      await updateRow(
        "avatars",
        target.avatarId,
        (row) => {
          const next = setStepDone(row.kit, target.funnelId, target.stepId, true);
          return next ? { kit: next } : null;
        },
        wait,
      );
      return;
    case "video":
      await updateRow(
        "avatars",
        target.avatarId,
        (row) => {
          const videos = row.model_videos ?? [];
          if (!videos.some((video) => video.id === target.videoId && video.status !== "modelado")) return null;
          return { model_videos: videos.map((video) => (video.id === target.videoId ? { ...video, status: "modelado" as const } : video)) };
        },
        wait,
      );
      return;
    case "aquecimento": {
      const warmup = getStore().warmups.find((item) => item.id === target.warmupId);
      if (warmup) await markDay(warmup, target.day, true, wait);
      return;
    }
    case "reposicao": {
      const account = getStore().accounts.find((item) => item.id === target.accountId);
      if (account) await setChecklistItem(account, target.item, true, wait);
      return;
    }
  }
}
