"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { clean } from "@/lib/format";
import { deleteRow, insertRow, updateRow, useStore } from "@/lib/store";
import type { AntidetectProfile } from "@/lib/types";
import { invalid } from "@/components/common/validation";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm";
import { Field, Input, Textarea } from "@/components/ui/field";
import { FormModal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";

interface ProfileFormProps {
  profile?: AntidetectProfile;
  usedBy?: number;
  onClose: () => void;
  onSaved?: (profile: AntidetectProfile) => void;
}

export function ProfileForm({ profile, usedBy = 0, onClose, onSaved }: ProfileFormProps) {
  const toast = useToast();
  const confirm = useConfirm();
  const db = useStore();
  const [number, setNumber] = useState(profile?.number ?? "");
  const [name, setName] = useState(profile?.name ?? "");
  const [proxy, setProxy] = useState(profile?.proxy ?? "");
  const [notes, setNotes] = useState(profile?.notes ?? "");

  async function submit() {
    const num = number.trim();
    if (!num) invalid("Informe o número do perfil no anti-detect.");
    const duplicate = db.profiles.find((p) => p.id !== profile?.id && p.number.trim().toLowerCase() === num.toLowerCase());
    if (duplicate) invalid(`Já existe um perfil com o número ${num}.`);
    const values = { number: num, name: clean(name), proxy: clean(proxy), notes: clean(notes) };
    if (profile) {
      await updateRow("antidetect_profiles", profile.id, values);
      toast.success("Perfil atualizado");
    } else {
      const row = await insertRow("antidetect_profiles", values);
      toast.success("Perfil cadastrado");
      onSaved?.(row);
    }
  }

  async function remove() {
    if (!profile) return;
    const ok = await confirm({
      title: `Apagar o perfil ${profile.number}?`,
      message:
        usedBy > 0
          ? `Este perfil está ligado a ${usedBy === 1 ? "1 conta" : `${usedBy} contas`}. As contas continuam existindo, mas ficam sem perfil informado.`
          : "Esta ação não pode ser desfeita.",
      confirmLabel: "Apagar perfil",
      tone: "danger",
    });
    if (!ok) return;
    try {
      await deleteRow("antidetect_profiles", profile.id);
      toast.success("Perfil apagado");
      onClose();
    } catch (err) {
      toast.error(err);
    }
  }

  return (
    <FormModal
      title={profile ? "Editar perfil anti-detect" : "Novo perfil anti-detect"}
      onClose={onClose}
      onSubmit={submit}
      extraActions={
        profile ? (
          <Button variant="danger-ghost" onClick={remove} className="md:mr-auto">
            <Trash2 className="size-4" /> Apagar
          </Button>
        ) : null
      }
    >
      <Field label="Número do perfil" hint="O número que aparece no seu navegador anti-detect.">
        <Input value={number} onChange={(e) => setNumber(e.target.value)} placeholder="101" autoComplete="off" />
      </Field>
      <Field label="Nome" optional>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Fra' Salvio IT — 1ª conta" autoComplete="off" />
      </Field>
      <Field label="Proxy" optional hint="Endereço do proxy configurado neste perfil.">
        <Input
          value={proxy}
          onChange={(e) => setProxy(e.target.value)}
          placeholder="it-res-01.exemplo.net:8000"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
        />
      </Field>
      <Field label="Observação" optional>
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
      </Field>
    </FormModal>
  );
}
