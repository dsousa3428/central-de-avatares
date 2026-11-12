"use client";

import { useState } from "react";
import { Link2, Pencil, Plus } from "lucide-react";
import { normalizeUrl } from "@/lib/format";
import { updateRow } from "@/lib/store";
import type { Avatar, LabeledLink } from "@/lib/types";
import { ExternalLinkText, LinkRow } from "@/components/common/detail-row";
import { ItemFormModal, removeById, upsertById, type ItemField } from "@/components/common/item-form-modal";
import { Button } from "@/components/ui/button";
import { EmptyState, Section } from "@/components/ui/card";
import { CopyButton } from "@/components/ui/copy-button";
import { Field, Input } from "@/components/ui/field";
import { FormModal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";

const MAIN_LINKS = [
  { key: "sales_site_url", label: "Site de vendas" },
  { key: "checkout_url", label: "Checkout" },
  { key: "delivery_page_url", label: "Página de entrega" },
  { key: "deliverables_folder_url", label: "Pasta de entregáveis" },
] as const;

const EXTRA_FIELDS: ItemField[] = [
  { key: "label", label: "Rótulo", required: true, placeholder: "Ex.: Grupo de suporte" },
  { key: "url", label: "Link", kind: "url", required: true, placeholder: "https://…" },
];

export function LinksTab({ avatar }: { avatar: Avatar }) {
  const toast = useToast();
  const [editingMain, setEditingMain] = useState(false);
  const [editingExtra, setEditingExtra] = useState<LabeledLink | "new" | null>(null);
  const extras = avatar.extra_links ?? [];

  async function saveExtra(item: LabeledLink) {
    await updateRow("avatars", avatar.id, (row) => ({ extra_links: upsertById(row.extra_links, item) }));
    toast.success("Link salvo");
  }

  async function deleteExtra(id: string) {
    await updateRow("avatars", avatar.id, (row) => ({ extra_links: removeById(row.extra_links, id) }));
    toast.success("Link apagado");
  }

  return (
    <div className="space-y-4">
      <Section
        title="Links principais"
        actions={
          <Button size="sm" onClick={() => setEditingMain(true)}>
            <Pencil className="size-4" /> Editar
          </Button>
        }
      >
        <div className="divide-y divide-line">
          {MAIN_LINKS.map((link) => (
            <LinkRow key={link.key} label={link.label} url={avatar[link.key]} />
          ))}
        </div>
      </Section>

      <Section
        title="Outros links"
        subtitle="Qualquer link extra, com um rótulo para você achar rápido."
        actions={
          <Button size="sm" variant="soft" onClick={() => setEditingExtra("new")}>
            <Plus className="size-4" /> Adicionar
          </Button>
        }
      >
        {extras.length === 0 ? (
          <EmptyState icon={<Link2 />} title="Nenhum link extra" className="py-5" />
        ) : (
          <ul className="divide-y divide-line">
            {extras.map((link) => (
              <li key={link.id} className="flex min-h-12 items-center gap-2 py-1.5">
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-muted">{link.label}</p>
                  <ExternalLinkText url={link.url} className="text-[15px]" />
                </div>
                <CopyButton text={link.url} message="Link copiado" />
                <Button size="sm" variant="ghost" iconOnly aria-label={`Editar ${link.label}`} onClick={() => setEditingExtra(link)}>
                  <Pencil className="size-4 text-muted" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {editingMain ? <MainLinksForm avatar={avatar} onClose={() => setEditingMain(false)} /> : null}
      {editingExtra ? (
        <ItemFormModal<LabeledLink>
          title={editingExtra === "new" ? "Novo link" : "Editar link"}
          fields={EXTRA_FIELDS}
          item={editingExtra === "new" ? undefined : editingExtra}
          onSave={saveExtra}
          onDelete={editingExtra === "new" ? undefined : () => deleteExtra(editingExtra.id)}
          deleteTitle="Apagar este link?"
          onClose={() => setEditingExtra(null)}
        />
      ) : null}
    </div>
  );
}

function MainLinksForm({ avatar, onClose }: { avatar: Avatar; onClose: () => void }) {
  const toast = useToast();
  const [values, setValues] = useState(() => ({
    sales_site_url: avatar.sales_site_url ?? "",
    checkout_url: avatar.checkout_url ?? "",
    delivery_page_url: avatar.delivery_page_url ?? "",
    deliverables_folder_url: avatar.deliverables_folder_url ?? "",
  }));

  async function submit() {
    await updateRow("avatars", avatar.id, {
      sales_site_url: normalizeUrl(values.sales_site_url),
      checkout_url: normalizeUrl(values.checkout_url),
      delivery_page_url: normalizeUrl(values.delivery_page_url),
      deliverables_folder_url: normalizeUrl(values.deliverables_folder_url),
    });
    toast.success("Links salvos");
  }

  return (
    <FormModal title="Links principais" onClose={onClose} onSubmit={submit}>
      {MAIN_LINKS.map((link) => (
        <Field
          key={link.key}
          label={link.label}
          optional
          hint={
            link.key === "checkout_url"
              ? "Vende pela Stripe? Cole aqui o link de pagamento (buy.stripe.com/…): é por ele que o painel busca as vendas deste avatar."
              : undefined
          }
        >
          <Input
            value={values[link.key]}
            onChange={(e) => setValues((current) => ({ ...current, [link.key]: e.target.value }))}
            placeholder="https://…"
            inputMode="url"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
          />
        </Field>
      ))}
    </FormModal>
  );
}
