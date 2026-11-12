"use client";

import { useState } from "react";
import { formatWeekdayDate } from "@/lib/dates";
import type { Warmup, WarmupDay } from "@/lib/types";
import { editDay } from "@/lib/warmup-actions";
import { invalid } from "@/components/common/validation";
import { Field, Input, Textarea } from "@/components/ui/field";
import { FormModal } from "@/components/ui/modal";
import { Segmented } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";

/** Edita um dia do calendário: uso ou descanso, minutos e o que fazer. */
export function DayForm({ warmup, day, onClose }: { warmup: Warmup; day: WarmupDay; onClose: () => void }) {
  const toast = useToast();
  const [use, setUse] = useState(day.use);
  const [minutes, setMinutes] = useState(day.use ? String(day.minutes) : "");
  const [task, setTask] = useState(day.task ?? "");

  async function submit() {
    const minutesNumber = Number(minutes);
    if (use && (!Number.isInteger(minutesNumber) || minutesNumber < 1 || minutesNumber > 600)) {
      invalid("Informe quantos minutos de uso (de 1 a 600).");
    }
    await editDay(warmup, day.n, { use, minutes: use ? minutesNumber : 0, task: task.trim() });
    toast.success(`Dia ${day.n} atualizado`);
  }

  return (
    <FormModal title={`Dia ${day.n} · ${formatWeekdayDate(day.date)}`} onClose={onClose} onSubmit={submit} size="sm">
      <Segmented
        ariaLabel="Tipo do dia"
        value={use ? "uso" : "descanso"}
        onChange={(value) => setUse(value === "uso")}
        items={[
          { value: "uso", label: "Dia de uso" },
          { value: "descanso", label: "Descanso" },
        ]}
      />
      {use ? (
        <>
          <Field label="Tempo de uso (minutos)">
            <Input value={minutes} onChange={(e) => setMinutes(e.target.value)} inputMode="numeric" autoComplete="off" />
          </Field>
          <Field label="O que fazer" optional>
            <Textarea
              value={task}
              onChange={(e) => setTask(e.target.value)}
              rows={3}
              placeholder="Anote aqui o que fazer na conta neste dia"
            />
          </Field>
        </>
      ) : (
        <p className="text-sm leading-relaxed text-muted">Neste dia a conta fica sem uso.</p>
      )}
    </FormModal>
  );
}
