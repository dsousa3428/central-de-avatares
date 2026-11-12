"use client";

import { useState } from "react";
import { Images, PackageOpen, Pencil, Plus, Star } from "lucide-react";
import { clean, normalizeUrl } from "@/lib/format";
import { updateRow } from "@/lib/store";
import type { Avatar, KitHighlight, LabeledLink, ReplacementKit } from "@/lib/types";
import { ExternalLinkText } from "@/components/common/detail-row";
import { ItemFormModal, removeById, upsertById, type ItemField } from "@/components/common/item-form-modal";
import { Button } from "@/components/ui/button";
import { Callout, EmptyState, Section } from "@/components/ui/card";
import { CopyButton } from "@/components/ui/copy-button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { FormModal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";

const HIGHLIGHT_FIELDS: ItemField[] = [
  { key: "title", label: "Título do destaque", required: true, placeholder: "Ex.: Recensioni" },
  { key: "text", label: "Texto", kind: "textarea", rows: 4, placeholder: "Texto usado neste destaque" },
];

const PROOF_FIELDS: ItemField[] = [
  { key: "label", label: "Rótulo", required: true, placeholder: "Ex.: Prova social 1" },
  { key: "url", label: "Link da foto / prova", kind: "url", required: true, placeholder: "https://…" },
];

/** Bloco "rótulo + texto + copiar" usado na ficha do perfil. */
function KitText({ label, text, copyMessage }: { label: string; text: string | undefined; copyMessage: string }) {
  return (
    <div className="flex items-start gap-2 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm text-muted">{label}</p>
        {text ? (
          <p className="mt-0.5 whitespace-pre-wrap text-[15px] leading-relaxed">{text}</p>
        ) : (
          <p className="mt-0.5 text-[15px] text-muted">—</p>
        )}
      </div>
      <CopyButton text={text} message={copyMessage} />
    </div>
  );
}

export function KitTab({ avatar }: { avatar: Avatar }) {
  const toast = useToast();
  const kit: ReplacementKit = avatar.kit ?? {};
  const highlights = kit.highlights ?? [];
  const proofs = kit.proof_links ?? [];
  const [editingProfile, setEditingProfile] = useState(false);
  const [editingHighlight, setEditingHighlight] = useState<KitHighlight | "new" | null>(null);
  const [editingProof, setEditingProof] = useState<LabeledLink | "new" | null>(null);

  async function saveKit(patch: Partial<ReplacementKit>, message: string) {
    await updateRow("avatars", avatar.id, { kit: { ...kit, ...patch } });
    toast.success(message);
  }

  return (
    <div className="space-y-4">
      <Callout icon={<PackageOpen />}>
        Tudo que você precisa para subir uma conta nova rápido. Toque em <strong>copiar</strong> e cole direto no
        Instagram.
      </Callout>

      <Section
        title="Perfil"
        actions={
          <Button size="sm" onClick={() => setEditingProfile(true)}>
            <Pencil className="size-4" /> Editar
          </Button>
        }
      >
        <div className="divide-y divide-line">
          <KitText label="Nome de exibição" text={kit.display_name} copyMessage="Nome copiado" />
          <KitText label="Bio" text={kit.bio} copyMessage="Bio copiada" />
          <div className="flex items-start gap-2 py-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm text-muted">Link da bio</p>
              {kit.bio_link ? (
                <ExternalLinkText url={kit.bio_link} className="mt-0.5 text-[15px]" />
              ) : (
                <p className="mt-0.5 text-[15px] text-muted">—</p>
              )}
            </div>
            <CopyButton text={kit.bio_link} message="Link copiado" />
          </div>
        </div>
      </Section>

      <Section
        title="Destaques"
        subtitle="Títulos e textos dos destaques do perfil."
        actions={
          <Button size="sm" variant="soft" onClick={() => setEditingHighlight("new")}>
            <Plus className="size-4" /> Adicionar
          </Button>
        }
      >
        {highlights.length === 0 ? (
          <EmptyState icon={<Star />} title="Nenhum destaque" className="py-5" />
        ) : (
          <ul className="divide-y divide-line">
            {highlights.map((item) => (
              <li key={item.id} className="flex items-start gap-2 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-medium">{item.title}</p>
                  {item.text ? (
                    <p className="mt-0.5 whitespace-pre-wrap text-sm leading-relaxed text-muted">{item.text}</p>
                  ) : null}
                </div>
                <CopyButton text={item.text || item.title} message="Texto copiado" />
                <Button size="sm" variant="ghost" iconOnly aria-label={`Editar ${item.title}`} onClick={() => setEditingHighlight(item)}>
                  <Pencil className="size-4 text-muted" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section
        title="Fotos e provas sociais"
        subtitle="Links das imagens que você usa no perfil."
        actions={
          <Button size="sm" variant="soft" onClick={() => setEditingProof("new")}>
            <Plus className="size-4" /> Adicionar
          </Button>
        }
      >
        {proofs.length === 0 ? (
          <EmptyState icon={<Images />} title="Nenhuma foto ou prova social" className="py-5" />
        ) : (
          <ul className="divide-y divide-line">
            {proofs.map((item) => (
              <li key={item.id} className="flex min-h-12 items-center gap-2 py-1.5">
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-muted">{item.label}</p>
                  <ExternalLinkText url={item.url} className="text-[15px]" />
                </div>
                <CopyButton text={item.url} message="Link copiado" />
                <Button size="sm" variant="ghost" iconOnly aria-label={`Editar ${item.label}`} onClick={() => setEditingProof(item)}>
                  <Pencil className="size-4 text-muted" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {editingProfile ? <KitProfileForm kit={kit} onSave={saveKit} onClose={() => setEditingProfile(false)} /> : null}

      {editingHighlight ? (
        <ItemFormModal<KitHighlight>
          title={editingHighlight === "new" ? "Novo destaque" : "Editar destaque"}
          fields={HIGHLIGHT_FIELDS}
          item={editingHighlight === "new" ? undefined : editingHighlight}
          defaults={{ text: "" }}
          onSave={(item) => saveKit({ highlights: upsertById(highlights, item) }, "Destaque salvo")}
          onDelete={
            editingHighlight === "new"
              ? undefined
              : () => saveKit({ highlights: removeById(highlights, editingHighlight.id) }, "Destaque apagado")
          }
          deleteTitle="Apagar este destaque?"
          onClose={() => setEditingHighlight(null)}
        />
      ) : null}

      {editingProof ? (
        <ItemFormModal<LabeledLink>
          title={editingProof === "new" ? "Nova foto / prova social" : "Editar foto / prova social"}
          fields={PROOF_FIELDS}
          item={editingProof === "new" ? undefined : editingProof}
          onSave={(item) => saveKit({ proof_links: upsertById(proofs, item) }, "Link salvo")}
          onDelete={
            editingProof === "new"
              ? undefined
              : () => saveKit({ proof_links: removeById(proofs, editingProof.id) }, "Link apagado")
          }
          deleteTitle="Apagar este link?"
          onClose={() => setEditingProof(null)}
        />
      ) : null}
    </div>
  );
}

function KitProfileForm({
  kit,
  onSave,
  onClose,
}: {
  kit: ReplacementKit;
  onSave: (patch: Partial<ReplacementKit>, message: string) => Promise<void>;
  onClose: () => void;
}) {
  const [displayName, setDisplayName] = useState(kit.display_name ?? "");
  const [bio, setBio] = useState(kit.bio ?? "");
  const [bioLink, setBioLink] = useState(kit.bio_link ?? "");

  async function submit() {
    await onSave(
      {
        display_name: clean(displayName) ?? "",
        bio: clean(bio) ?? "",
        bio_link: normalizeUrl(bioLink) ?? "",
      },
      "Kit atualizado",
    );
  }

  return (
    <FormModal title="Perfil do kit de reposição" onClose={onClose} onSubmit={submit}>
      <Field label="Nome de exibição" optional>
        <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Fra' Salvio 🌿" autoComplete="off" />
      </Field>
      <Field label="Bio" optional hint={`${bio.length} de 150 caracteres (limite do Instagram).`}>
        <Textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={5} />
      </Field>
      <Field label="Link da bio" optional>
        <Input
          value={bioLink}
          onChange={(e) => setBioLink(e.target.value)}
          placeholder="https://…"
          inputMode="url"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
        />
      </Field>
    </FormModal>
  );
}
