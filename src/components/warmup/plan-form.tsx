"use client";

import { useState } from "react";
import { addDays, formatDate, isValidISODate } from "@/lib/dates";
import type { Warmup } from "@/lib/types";
import { MAX_WARMUP_DAYS, sortedDays } from "@/lib/warmup";
import { editPlan } from "@/lib/warmup-actions";
import { invalid } from "@/components/common/validation";
import { Callout } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/field";
import { FormModal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";

/** Muda a data de início e a duração do calendário de uma conta. */
export function PlanForm({ warmup, onClose }: { warmup: Warmup; onClose: () => void }) {
  const toast = useToast();
  const days = sortedDays(warmup.days);
  const [startDate, setStartDate] = useState(days[0]?.date ?? warmup.start_date);
  const [total, setTotal] = useState(String(days.length));

  const totalNumber = Number(total);
  const validTotal = Number.isInteger(totalNumber) && totalNumber >= 1 && totalNumber <= MAX_WARMUP_DAYS;
  const removedDone = validTotal ? days.filter((d) => d.n > totalNumber && d.done).length : 0;

  async function submit() {
    if (!isValidISODate(startDate)) invalid("Informe uma data de início válida.");
    if (!validTotal) invalid(`A duração deve ser um número de 1 a ${MAX_WARMUP_DAYS} dias.`);
    await editPlan(warmup, startDate, totalNumber);
    toast.success("Calendário atualizado");
  }

  return (
    <FormModal title="Editar calendário" onClose={onClose} onSubmit={submit} size="sm">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Começa em">
          <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </Field>
        <Field label="Duração (dias)">
          <Input value={total} onChange={(e) => setTotal(e.target.value)} inputMode="numeric" autoComplete="off" />
        </Field>
      </div>
      <p className="text-sm leading-relaxed text-muted">
        Mudar o início move todos os dias junto. Aumentar a duração acrescenta dias no fim, alternando uso e descanso.
        {isValidISODate(startDate) && validTotal
          ? ` As datas vão de ${formatDate(startDate)} em diante, pelo menos até ${formatDate(addDays(startDate, totalNumber - 1))}.`
          : ""}
      </p>
      {removedDone > 0 ? (
        <Callout tone="warn">
          Com essa duração, {removedDone === 1 ? "1 dia já feito sai" : `${removedDone} dias já feitos saem`} do
          calendário.
        </Callout>
      ) : null}
    </FormModal>
  );
}
