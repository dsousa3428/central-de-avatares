"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { normalizeUrl, uid } from "@/lib/format";
import { invalid } from "@/components/common/validation";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { FormModal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";

export interface ItemField {
  key: string;
  label: string;
  kind?: "text" | "url" | "textarea" | "select";
  required?: boolean;
  placeholder?: string;
  hint?: string;
  rows?: number;
  /** Para textos que não devem começar com maiúscula (links, @). */
  plain?: boolean;
  options?: Array<{ value: string; label: string }>;
}

interface ItemFormModalProps<T extends { id: string }> {
  /** Ex.: "Novo link" / "Editar link". */
  title: string;
  fields: ItemField[];
  /** Item em edição (ausente = criando). */
  item?: T;
  /** Valores iniciais ao criar. */
  defaults?: Partial<T>;
  onSave: (item: T) => Promise<void>;
  onDelete?: () => Promise<void>;
  /** Nome do item na pergunta "Apagar …?". */
  deleteTitle?: string;
  onClose: () => void;
}

/**
 * Janela genérica para itens de listas simples (links, vídeos, perfis, destaques…).
 * Cada lista só descreve seus campos.
 */
export function ItemFormModal<T extends { id: string }>({
  title,
  fields,
  item,
  defaults,
  onSave,
  onDelete,
  deleteTitle,
  onClose,
}: ItemFormModalProps<T>) {
  const toast = useToast();
  const confirm = useConfirm();
  const source = (item ?? defaults ?? {}) as Record<string, unknown>;
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(fields.map((f) => [f.key, typeof source[f.key] === "string" ? (source[f.key] as string) : ""])),
  );

  function set(key: string, value: string) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  async function submit() {
    const cleaned: Record<string, string> = {};
    for (const field of fields) {
      let value = (values[field.key] ?? "").trim();
      if (field.required && !value) invalid(`Preencha o campo “${field.label}”.`);
      if (field.kind === "url" && value) value = normalizeUrl(value) ?? "";
      cleaned[field.key] = value;
    }
    await onSave({ ...(defaults ?? {}), ...(item ?? {}), ...cleaned, id: item?.id ?? uid() } as T);
  }

  async function remove() {
    if (!onDelete) return;
    const ok = await confirm({
      title: deleteTitle ?? "Apagar este item?",
      message: "Esta ação não pode ser desfeita.",
      confirmLabel: "Apagar",
      tone: "danger",
    });
    if (!ok) return;
    try {
      await onDelete();
      onClose();
    } catch (err) {
      toast.error(err);
    }
  }

  return (
    <FormModal
      title={title}
      onClose={onClose}
      onSubmit={submit}
      extraActions={
        item && onDelete ? (
          <Button variant="danger-ghost" onClick={remove} className="md:mr-auto">
            <Trash2 className="size-4" /> Apagar
          </Button>
        ) : null
      }
    >
      {fields.map((field) => {
        const common = {
          value: values[field.key] ?? "",
          placeholder: field.placeholder,
          autoComplete: "off",
          ...(field.plain || field.kind === "url" ? { autoCapitalize: "none" as const, spellCheck: false } : {}),
        };
        return (
          <Field key={field.key} label={field.label} hint={field.hint} optional={!field.required}>
            {field.kind === "textarea" ? (
              <Textarea {...common} rows={field.rows ?? 3} onChange={(e) => set(field.key, e.target.value)} />
            ) : field.kind === "select" ? (
              <Select value={values[field.key] ?? ""} onChange={(e) => set(field.key, e.target.value)}>
                {(field.options ?? []).map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            ) : (
              <Input
                {...common}
                inputMode={field.kind === "url" ? "url" : undefined}
                onChange={(e) => set(field.key, e.target.value)}
              />
            )}
          </Field>
        );
      })}
    </FormModal>
  );
}

/** Substitui (ou acrescenta) um item numa lista, pelo id. */
export function upsertById<T extends { id: string }>(list: T[] | null | undefined, item: T): T[] {
  const current = list ?? [];
  return current.some((x) => x.id === item.id) ? current.map((x) => (x.id === item.id ? item : x)) : [...current, item];
}

export function removeById<T extends { id: string }>(list: T[] | null | undefined, id: string): T[] {
  return (list ?? []).filter((x) => x.id !== id);
}
