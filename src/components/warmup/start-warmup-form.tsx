"use client";

import { useState } from "react";
import { changeAccountStatus } from "@/lib/account-actions";
import { addDays, formatDate, isValidISODate, todayISO } from "@/lib/dates";
import { getStore, useStore } from "@/lib/store";
import type { Account, Warmup } from "@/lib/types";
import { describePlan, MAX_WARMUP_DAYS, planFromSettings, resizePlan } from "@/lib/warmup";
import { restartWarmup, startWarmup } from "@/lib/warmup-actions";
import { invalid } from "@/components/common/validation";
import { Callout } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/field";
import { FormModal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";

interface StartWarmupFormProps {
  account: Account;
  /** Se já existe um calendário, este formulário recomeça do zero. */
  warmup?: Warmup;
  onClose: () => void;
}

/** Inicia (ou reinicia) o aquecimento de uma conta usando o padrão das Configurações. */
export function StartWarmupForm({ account, warmup, onClose }: StartWarmupFormProps) {
  const db = useStore();
  const toast = useToast();
  const basePlan = planFromSettings(db.settings);
  const [startDate, setStartDate] = useState(todayISO());
  const [total, setTotal] = useState(String(basePlan.days.length));

  const totalNumber = Number(total);
  const validTotal = Number.isInteger(totalNumber) && totalNumber >= 1 && totalNumber <= MAX_WARMUP_DAYS;
  const plan = resizePlan(basePlan, validTotal ? totalNumber : basePlan.days.length);
  const endDate = isValidISODate(startDate) ? addDays(startDate, plan.days.length - 1) : null;

  async function submit() {
    if (!isValidISODate(startDate)) invalid("Informe uma data de início válida.");
    if (!validTotal) invalid(`A duração deve ser um número de 1 a ${MAX_WARMUP_DAYS} dias.`);
    // Confere na hora de salvar se o calendário já existe (ele pode ter sido criado numa
    // tentativa anterior deste mesmo formulário que falhou no passo seguinte).
    const existing = warmup ?? getStore().warmups.find((w) => w.account_id === account.id);
    if (existing) await restartWarmup(existing, account, startDate, plan);
    else await startWarmup(account, startDate, plan);
    if (account.status !== "aquecendo") {
      await changeAccountStatus(account, "aquecendo", { optimistic: false });
    }
    toast.success(warmup ? "Aquecimento reiniciado" : "Aquecimento iniciado");
  }

  return (
    <FormModal
      title={warmup ? "Reiniciar aquecimento" : "Iniciar aquecimento"}
      description={`@${account.handle}`}
      onClose={onClose}
      onSubmit={submit}
      submitLabel={warmup ? "Reiniciar" : "Iniciar"}
    >
      {warmup ? (
        <Callout tone="warn">
          O calendário atual é substituído por um novo e as marcações de “feito” são apagadas.
        </Callout>
      ) : null}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Começa em">
          <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </Field>
        <Field label="Duração (dias)">
          <Input value={total} onChange={(e) => setTotal(e.target.value)} inputMode="numeric" autoComplete="off" />
        </Field>
      </div>
      <div className="rounded-xl bg-surface-2 px-3.5 py-3 text-sm leading-relaxed">
        <p className="font-medium">{describePlan(plan)}</p>
        {endDate ? <p className="text-muted">Fim previsto: {formatDate(endDate)}</p> : null}
        <p className="mt-1 text-muted">
          Segue o padrão das Configurações. Depois de iniciar, você ajusta cada dia (minutos, o que fazer, uso ou
          descanso).
        </p>
      </div>
      {account.status !== "aquecendo" ? (
        <p className="text-sm leading-relaxed text-muted">
          A conta volta para o status <strong className="text-fg">Aquecendo</strong>.
        </p>
      ) : null}
    </FormModal>
  );
}
