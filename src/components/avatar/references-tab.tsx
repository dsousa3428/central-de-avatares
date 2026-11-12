"use client";

import { useState } from "react";
import { Pencil, Plus, UsersRound } from "lucide-react";
import { updateRow } from "@/lib/store";
import type { Avatar, ReferenceProfile } from "@/lib/types";
import { ExternalLinkText } from "@/components/common/detail-row";
import { ItemFormModal, removeById, upsertById, type ItemField } from "@/components/common/item-form-modal";
import { Button } from "@/components/ui/button";
import { EmptyState, Section } from "@/components/ui/card";
import { CopyButton } from "@/components/ui/copy-button";
import { useToast } from "@/components/ui/toast";

const FIELDS: ItemField[] = [
  { key: "handle", label: "@ ou link do perfil", required: true, plain: true, placeholder: "@perfil.de.referencia" },
  { key: "note", label: "Observação", kind: "textarea", rows: 2, placeholder: "O que observar neste perfil" },
];

function isLink(value: string): boolean {
  return /^https?:\/\//i.test(value) || /^[\w-]+(\.[\w-]+)+\//.test(value);
}

export function ReferencesTab({ avatar }: { avatar: Avatar }) {
  const toast = useToast();
  const [editing, setEditing] = useState<ReferenceProfile | "new" | null>(null);
  const profiles = avatar.reference_profiles ?? [];

  async function save(item: ReferenceProfile) {
    await updateRow("avatars", avatar.id, { reference_profiles: upsertById(profiles, item) });
    toast.success("Perfil salvo");
  }

  async function remove(id: string) {
    await updateRow("avatars", avatar.id, { reference_profiles: removeById(profiles, id) });
    toast.success("Perfil apagado");
  }

  return (
    <>
      <Section
        title="Perfis de exemplo"
        subtitle="Perfis de referência para se inspirar."
        actions={
          <Button size="sm" variant="soft" onClick={() => setEditing("new")}>
            <Plus className="size-4" /> Adicionar
          </Button>
        }
      >
        {profiles.length === 0 ? (
          <EmptyState icon={<UsersRound />} title="Nenhum perfil de exemplo" className="py-5">
            Guarde aqui os @ (ou links) dos perfis que servem de referência para este avatar.
          </EmptyState>
        ) : (
          <ul className="divide-y divide-line">
            {profiles.map((profile) => (
              <li key={profile.id} className="flex items-start gap-2 py-3">
                <div className="min-w-0 flex-1">
                  {isLink(profile.handle) ? (
                    <ExternalLinkText url={profile.handle} className="text-[15px]" />
                  ) : (
                    <p className="break-all text-[15px] font-medium">{profile.handle}</p>
                  )}
                  {profile.note ? (
                    <p className="mt-0.5 whitespace-pre-wrap text-sm leading-relaxed text-muted">{profile.note}</p>
                  ) : null}
                </div>
                <CopyButton text={profile.handle} message="Perfil copiado" />
                <Button size="sm" variant="ghost" iconOnly aria-label={`Editar ${profile.handle}`} onClick={() => setEditing(profile)}>
                  <Pencil className="size-4 text-muted" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {editing ? (
        <ItemFormModal<ReferenceProfile>
          title={editing === "new" ? "Novo perfil de exemplo" : "Editar perfil de exemplo"}
          fields={FIELDS}
          item={editing === "new" ? undefined : editing}
          defaults={{ note: "" }}
          onSave={save}
          onDelete={editing === "new" ? undefined : () => remove(editing.id)}
          deleteTitle="Apagar este perfil de exemplo?"
          onClose={() => setEditing(null)}
        />
      ) : null}
    </>
  );
}
