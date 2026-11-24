"use client";

import { useState } from "react";
import type { Task } from "@/lib/types";
import { TaskForm } from "./task-form";
import { TaskRow } from "./task-row";

/** Uma lista das tarefas do dono, com a janela para editar (usada na tela Hoje e no avatar). */
export function TaskList({
  tasks,
  today,
  avatarLabel,
}: {
  tasks: readonly Task[];
  today: string;
  /** O nome do avatar em cada linha (omita quando a lista já é de um avatar só). */
  avatarLabel?: (id: string | null) => string;
}) {
  const [editing, setEditing] = useState<Task | null>(null);
  return (
    <>
      <ul className="divide-y divide-line">
        {tasks.map((task) => (
          <TaskRow
            key={task.id}
            task={task}
            today={today}
            avatarLabel={avatarLabel?.(task.avatar_id)}
            onEdit={() => setEditing(task)}
          />
        ))}
      </ul>
      {editing ? <TaskForm task={editing} onClose={() => setEditing(null)} /> : null}
    </>
  );
}
