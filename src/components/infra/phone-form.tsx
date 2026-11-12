"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { clean } from "@/lib/format";
import { deleteRow, insertRow, updateRow } from "@/lib/store";
import type { Phone } from "@/lib/types";
import { invalid } from "@/components/common/validation";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm";
import { Field, Input, Textarea } from "@/components/ui/field";
import { FormModal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";

interface PhoneFormProps {
  phone?: Phone;
  /** Quantas contas usam este celular (para avisar antes de apagar). */
  usedBy?: number;
  onClose: () => void;
  onSaved?: (phone: Phone) => void;
}

export function PhoneForm({ phone, usedBy = 0, onClose, onSaved }: PhoneFormProps) {
  const toast = useToast();
  const confirm = useConfirm();
  const [nickname, setNickname] = useState(phone?.nickname ?? "");
  const [model, setModel] = useState(phone?.model ?? "");
  const [number, setNumber] = useState(phone?.number ?? "");
  const [notes, setNotes] = useState(phone?.notes ?? "");

  async function submit() {
    const name = nickname.trim();
    if (!name) invalid("Dê um apelido para o celular (ex.: Celular A).");
    const values = { nickname: name, model: clean(model), number: clean(number), notes: clean(notes) };
    if (phone) {
      await updateRow("phones", phone.id, values);
      toast.success("Celular atualizado");
    } else {
      const row = await insertRow("phones", values);
      toast.success("Celular cadastrado");
      onSaved?.(row);
    }
  }

  async function remove() {
    if (!phone) return;
    const ok = await confirm({
      title: `Apagar “${phone.nickname}”?`,
      message:
        usedBy > 0
          ? `Este celular está ligado a ${usedBy === 1 ? "1 conta" : `${usedBy} contas`}. As contas continuam existindo, mas ficam sem celular informado.`
          : "Esta ação não pode ser desfeita.",
      confirmLabel: "Apagar celular",
      tone: "danger",
    });
    if (!ok) return;
    try {
      await deleteRow("phones", phone.id);
      toast.success("Celular apagado");
      onClose();
    } catch (err) {
      toast.error(err);
    }
  }

  return (
    <FormModal
      title={phone ? "Editar celular" : "Novo celular"}
      onClose={onClose}
      onSubmit={submit}
      extraActions={
        phone ? (
          <Button variant="danger-ghost" onClick={remove} className="md:mr-auto">
            <Trash2 className="size-4" /> Apagar
          </Button>
        ) : null
      }
    >
      <Field label="Apelido" hint="Como você chama este aparelho no dia a dia.">
        <Input value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder="Celular A" autoComplete="off" />
      </Field>
      <Field label="Modelo" optional>
        <Input value={model} onChange={(e) => setModel(e.target.value)} placeholder="Samsung Galaxy A15" autoComplete="off" />
      </Field>
      <Field label="Número / chip" optional>
        <Input value={number} onChange={(e) => setNumber(e.target.value)} placeholder="+39 351 000 0000" autoComplete="off" inputMode="tel" />
      </Field>
      <Field label="Observação" optional>
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
      </Field>
    </FormModal>
  );
}
