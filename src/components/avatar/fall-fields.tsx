"use client";

import { useMemo } from "react";
import { isValidISODate, todayISO } from "@/lib/dates";
import { FALL_REASONS } from "@/lib/reference";
import { useStore } from "@/lib/store";
import { invalid } from "@/components/common/validation";
import { Field, Input } from "@/components/ui/field";

/** Confere a data da queda; o erro aparece dentro do formulário. */
export function checkFallDate(fellOn: string, createdOn: string): void {
  if (!isValidISODate(fellOn)) invalid("Informe uma data válida para a queda da conta.");
  if (fellOn > todayISO()) invalid("A data da queda não pode ser no futuro.");
  if (fellOn < createdOn) invalid("A data da queda não pode ser anterior à data de criação.");
}

interface FallFieldsProps {
  fellOn: string;
  onFellOn: (value: string) => void;
  reason: string;
  onReason: (value: string) => void;
}

/** Data e motivo provável da queda, com sugestões de motivo (os que você já usou vêm primeiro). */
export function FallFields({ fellOn, onFellOn, reason, onReason }: FallFieldsProps) {
  const db = useStore();
  const suggestions = useMemo(() => {
    const used = db.accounts.map((account) => account.fall_reason).filter((text): text is string => Boolean(text));
    return [...new Set([...used, ...FALL_REASONS])].slice(0, 8);
  }, [db.accounts]);

  return (
    <>
      <Field label="Data da queda">
        <Input type="date" value={fellOn} max={todayISO()} onChange={(e) => onFellOn(e.target.value)} />
      </Field>
      <Field label="Motivo provável" optional>
        <Input
          value={reason}
          onChange={(e) => onReason(e.target.value)}
          placeholder="O que você acha que causou a queda"
          autoComplete="off"
        />
      </Field>
      <div className="flex flex-wrap gap-1.5">
        {suggestions.map((text) => (
          <button
            key={text}
            type="button"
            onClick={() => onReason(text)}
            className="rounded-full border border-line bg-surface px-2.5 py-1 text-xs text-muted transition-colors hover:text-fg"
          >
            {text}
          </button>
        ))}
      </div>
    </>
  );
}
