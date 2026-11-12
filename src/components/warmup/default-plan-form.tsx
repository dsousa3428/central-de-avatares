"use client";

import { useState } from "react";
import { RotateCcw } from "lucide-react";
import { saveSettings, useStore } from "@/lib/store";
import {
  DEFAULT_WARMUP_PLAN,
  describePlan,
  MAX_WARMUP_DAYS,
  planFromSettings,
  resizePlan,
  type PlanDay,
  type WarmupPlan,
} from "@/lib/warmup";
import { invalid } from "@/components/common/validation";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { FormModal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";

interface DraftDay {
  use: boolean;
  minutes: string;
  task: string;
}

function toDraft(plan: WarmupPlan): DraftDay[] {
  return plan.days.map((d) => ({ use: d.use, minutes: d.use ? String(d.minutes) : "", task: d.task }));
}

function toPlan(days: DraftDay[]): WarmupPlan {
  return {
    days: days.map<PlanDay>((d) => ({
      use: d.use,
      minutes: d.use ? Math.round(Number(d.minutes)) || 0 : 0,
      task: d.use ? d.task.trim() : "",
    })),
  };
}

function validTotal(value: string): number | null {
  const n = Number(value);
  return value.trim() !== "" && Number.isInteger(n) && n >= 1 && n <= MAX_WARMUP_DAYS ? n : null;
}

/** Acrescenta ao rascunho os dias que faltam para chegar a `size`; os que já existem não mudam. */
function grow(current: DraftDay[], size: number): DraftDay[] {
  if (current.length >= size) return current;
  const added = toDraft(resizePlan(toPlan(current), size)).slice(current.length);
  return [...current, ...added.map((d) => (d.use && !(Number(d.minutes) > 0) ? { ...d, minutes: "10" } : d))];
}

/** Edita o padrão de aquecimento usado nas contas novas (Configurações). */
export function DefaultPlanForm({ onClose }: { onClose: () => void }) {
  const db = useStore();
  const toast = useToast();
  // `days` é o rascunho inteiro e nunca encolhe enquanto a janela está aberta: a tela mostra (e o
  // botão Salvar grava) só os primeiros `count`. Assim, apagar o "10" da duração para digitar "12"
  // não joga fora o que já foi ajustado em cada dia.
  const [days, setDays] = useState<DraftDay[]>(() => toDraft(planFromSettings(db.settings)));
  const [total, setTotal] = useState(String(days.length));
  const [count, setCount] = useState(days.length);
  const shown = days.slice(0, count);

  function changeTotal(value: string) {
    setTotal(value);
    const n = validTotal(value);
    if (n === null) return;
    setCount(n);
    setDays((current) => grow(current, n));
  }

  function patch(index: number, change: Partial<DraftDay>) {
    setDays((current) => current.map((d, i) => (i === index ? { ...d, ...change } : d)));
  }

  function restore() {
    setDays(toDraft(DEFAULT_WARMUP_PLAN));
    setTotal(String(DEFAULT_WARMUP_PLAN.days.length));
    setCount(DEFAULT_WARMUP_PLAN.days.length);
    toast.info("Padrão original de volta na tela. Toque em Salvar para valer.");
  }

  async function submit() {
    if (validTotal(total) === null) {
      invalid(`A duração deve ser um número de 1 a ${MAX_WARMUP_DAYS} dias.`);
    }
    shown.forEach((day, index) => {
      const minutes = Number(day.minutes);
      if (day.use && (!Number.isInteger(minutes) || minutes < 1 || minutes > 600)) {
        invalid(`Dia ${index + 1}: informe os minutos de uso (de 1 a 600).`);
      }
    });
    if (!shown.some((d) => d.use)) invalid("O padrão precisa ter pelo menos um dia de uso.");
    await saveSettings({ warmup_defaults: toPlan(shown) as unknown as Record<string, unknown> });
    toast.success("Padrão de aquecimento salvo");
  }

  return (
    <FormModal
      title="Padrão de aquecimento"
      description="Vale para as contas novas. As que já estão aquecendo não mudam."
      onClose={onClose}
      onSubmit={submit}
      size="lg"
    >
      <div>
        <div className="flex items-end gap-3">
          <Field label="Duração (dias)" className="w-36">
            <Input value={total} onChange={(e) => changeTotal(e.target.value)} inputMode="numeric" autoComplete="off" />
          </Field>
          <p className="pb-2.5 text-sm text-muted">{describePlan(toPlan(shown))}</p>
        </div>
        <Button size="sm" variant="ghost" onClick={restore} className="mt-1.5 -ml-2 text-muted">
          <RotateCcw className="size-4" /> Voltar ao padrão original
        </Button>
      </div>

      <ol className="divide-y divide-line rounded-xl border border-line">
        {shown.map((day, index) => (
          <li key={index} className="space-y-2 px-3 py-2.5">
            <div className="flex items-center gap-2">
              <span className="w-14 shrink-0 text-sm font-semibold">Dia {index + 1}</span>
              <span className="min-w-0 flex-1">
                <Select
                  value={day.use ? "uso" : "descanso"}
                  onChange={(e) =>
                    patch(index, e.target.value === "uso" ? { use: true, minutes: day.minutes || "10" } : { use: false })
                  }
                  aria-label={`Tipo do dia ${index + 1}`}
                  className="h-10"
                >
                  <option value="uso">Uso</option>
                  <option value="descanso">Descanso</option>
                </Select>
              </span>
              {day.use ? (
                <span className="flex shrink-0 items-center gap-1.5">
                  <Input
                    value={day.minutes}
                    onChange={(e) => patch(index, { minutes: e.target.value })}
                    inputMode="numeric"
                    autoComplete="off"
                    aria-label={`Minutos do dia ${index + 1}`}
                    className="h-10 w-16 px-2 text-center"
                  />
                  <span className="text-sm text-muted">min</span>
                </span>
              ) : null}
            </div>
            {day.use ? (
              <Input
                value={day.task}
                onChange={(e) => patch(index, { task: e.target.value })}
                placeholder="O que fazer neste dia (opcional)"
                autoComplete="off"
                aria-label={`O que fazer no dia ${index + 1}`}
                className="h-10"
              />
            ) : null}
          </li>
        ))}
      </ol>
    </FormModal>
  );
}
