"use client";

import { useRef, useState } from "react";
import { markAccountFallen } from "@/lib/account-actions";
import { todayISO } from "@/lib/dates";
import { clean } from "@/lib/format";
import { generationLabel } from "@/lib/selectors";
import type { Account } from "@/lib/types";
import { FormModal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { checkFallDate, FallFields } from "./fall-fields";

interface FallFormProps {
  account: Account;
  /** O número da geração que vai substituir esta conta. */
  nextGeneration: number;
  /** Ao fechar: `fell` diz se a conta foi mesmo marcada como caída (para abrir o passo seguinte). */
  onClose: (fell: boolean) => void;
}

/**
 * "Conta caiu", passo 1: a data e o motivo. Ao confirmar, a conta fica como
 * caída e quem abriu esta janela segue para a criação da nova geração.
 */
export function FallForm({ account, nextGeneration, onClose }: FallFormProps) {
  const toast = useToast();
  const [fellOn, setFellOn] = useState(todayISO());
  const [reason, setReason] = useState("");
  const fell = useRef(false);

  async function submit() {
    checkFallDate(fellOn, account.created_on);
    await markAccountFallen(account, fellOn, clean(reason));
    fell.current = true;
    toast.success("Conta marcada como caída");
  }

  return (
    <FormModal
      title="Conta caiu"
      description={`Passo 1 de 2 · @${account.handle} (${generationLabel(account.generation)})`}
      onClose={() => onClose(fell.current)}
      onSubmit={submit}
      submitLabel="Confirmar queda"
    >
      <FallFields fellOn={fellOn} onFellOn={setFellOn} reason={reason} onReason={setReason} />
      <p className="text-xs leading-relaxed text-muted">
        Ao confirmar, a conta fica como caída e o aquecimento dela é encerrado. Em seguida o painel abre a criação da{" "}
        {generationLabel(nextGeneration)}, com o mesmo @ e o checklist de reposição — você pode criar agora ou deixar
        para depois.
      </p>
    </FormModal>
  );
}
