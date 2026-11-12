"use client";

import { useState } from "react";
import { clean } from "@/lib/format";
import { updateRow } from "@/lib/store";
import type { Avatar } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Section } from "@/components/ui/card";
import { Textarea } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";

export function NotesTab({ avatar }: { avatar: Avatar }) {
  const toast = useToast();
  const saved = avatar.notes ?? "";
  const [text, setText] = useState(saved);
  const [baseline, setBaseline] = useState(saved);
  const [saving, setSaving] = useState(false);

  // Se as anotações mudaram por fora (ex.: editadas em outro aparelho) e não há
  // nada digitado aqui por salvar, acompanha o texto novo. O salvamento daqui só
  // mexe em `saved` depois que o servidor confirma, então um erro nunca apaga o rascunho.
  if (saved !== baseline) {
    if ((clean(text) ?? "") === baseline) setText(saved);
    setBaseline(saved);
  }

  const dirty = (clean(text) ?? "") !== saved;

  async function save() {
    setSaving(true);
    try {
      await updateRow("avatars", avatar.id, { notes: clean(text) });
      toast.success("Anotações salvas");
    } catch (err) {
      toast.error(err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Section title="Anotações" subtitle="Espaço livre para o que você quiser lembrar sobre este avatar.">
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={10}
        placeholder="Escreva aqui…"
        aria-label="Anotações do avatar"
      />
      <div className="mt-3 flex items-center justify-end gap-3">
        {dirty ? <span className="text-sm text-muted">Alterações não salvas</span> : null}
        {dirty ? (
          <Button variant="ghost" onClick={() => setText(saved)} disabled={saving}>
            Descartar
          </Button>
        ) : null}
        <Button variant="primary" onClick={save} disabled={!dirty} loading={saving}>
          Salvar
        </Button>
      </div>
    </Section>
  );
}
