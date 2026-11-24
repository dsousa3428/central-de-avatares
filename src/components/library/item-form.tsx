"use client";

import { useRef, useState } from "react";
import { Paperclip, Trash2, Undo2 } from "lucide-react";
import { CATEGORIES, fileProblem, formatBytes, readCategory } from "@/lib/library";
import { createLibraryItem, deleteLibraryItem, updateLibraryItem } from "@/lib/library-actions";
import { useStore } from "@/lib/store";
import type { LibraryCategory, LibraryItem } from "@/lib/types";
import { invalid } from "@/components/common/validation";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { FormModal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";

/** Novo prompt, ou corrigir qualquer item (o título, o texto, o avatar, o arquivo). */
export function ItemForm({
  item,
  initialAvatar,
  initialCategory,
  onClose,
}: {
  item: LibraryItem | null;
  /** Ao criar: o avatar que vem escolhido (o do filtro da tela). */
  initialAvatar?: string | null;
  initialCategory?: LibraryCategory | null;
  onClose: () => void;
}) {
  const db = useStore();
  const toast = useToast();
  const confirm = useConfirm();
  const picker = useRef<HTMLInputElement>(null);
  const [values, setValues] = useState(() => ({
    title: item?.title ?? "",
    category: item ? readCategory(item.category) : (initialCategory ?? "imagem"),
    avatar: item ? (item.avatar_id ?? "") : (initialAvatar ?? ""),
    content: item?.content ?? "",
    notes: item?.notes ?? "",
  }));
  // o arquivo escolhido agora (ainda não enviado) e se o arquivo que o item tem deve sair
  const [file, setFile] = useState<File | null>(null);
  const [dropFile, setDropFile] = useState(false);
  const keeps = Boolean(item?.file_path) && !dropFile && !file;
  const set = <K extends keyof typeof values>(key: K, value: (typeof values)[K]) => setValues((now) => ({ ...now, [key]: value }));
  // o avatar escolhido pode ter sido apagado em outra aba: aí o item fica geral
  const avatarId = db.avatars.some((avatar) => avatar.id === values.avatar) ? values.avatar : "";

  function pick(event: React.ChangeEvent<HTMLInputElement>) {
    const chosen = event.target.files?.[0] ?? null;
    event.target.value = ""; // escolher o mesmo arquivo de novo também funciona
    if (!chosen) return;
    const problem = fileProblem(chosen);
    if (problem) {
      toast.error(problem);
      return;
    }
    setFile(chosen);
    setDropFile(false);
  }

  async function submit() {
    const title = values.title.trim();
    const content = values.content.trim();
    if (!title) invalid("Dê um título ao item (ex.: “Rosto do Fra' Salvio”).");
    if (!content && !file && !keeps) invalid("Escreva o prompt ou anexe um arquivo.");
    const data = {
      title,
      category: values.category,
      avatar_id: avatarId || null,
      content: content || null,
      notes: values.notes.trim() || null,
    };
    if (item) {
      await updateLibraryItem(item, data, { file, removeFile: dropFile });
      toast.success("Item salvo");
    } else {
      await createLibraryItem(data, file);
      toast.success(content ? "Prompt guardado" : "Arquivo guardado");
    }
  }

  async function remove() {
    if (!item) return;
    const ok = await confirm({
      title: "Apagar este item?",
      message: item.file_path
        ? "O item e o arquivo guardado nele são apagados de vez. Esta ação não pode ser desfeita."
        : "Esta ação não pode ser desfeita.",
      confirmLabel: "Apagar",
      tone: "danger",
    });
    if (!ok) return;
    try {
      await deleteLibraryItem(item);
      toast.success("Item apagado");
      onClose();
    } catch (err) {
      toast.error(err);
    }
  }

  return (
    <FormModal
      title={item ? "Editar item" : "Novo prompt"}
      description={item ? undefined : "O texto que você cola na IA. Dá para anexar um arquivo junto (ex.: a imagem que ele gerou)."}
      onClose={onClose}
      onSubmit={submit}
      extraActions={
        item ? (
          <Button variant="danger-ghost" onClick={() => void remove()} className="md:mr-auto">
            <Trash2 className="size-4" /> Apagar
          </Button>
        ) : null
      }
    >
      <Field label="Título">
        <Input value={values.title} onChange={(e) => set("title", e.target.value)} autoComplete="off" placeholder="Ex.: Rosto do Fra' Salvio" />
      </Field>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Tipo">
          <Select value={values.category} onChange={(e) => set("category", e.target.value as LibraryCategory)}>
            {CATEGORIES.map((category) => (
              <option key={category.value} value={category.value}>
                {category.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Avatar">
          <Select value={avatarId} onChange={(e) => set("avatar", e.target.value)}>
            <option value="">Geral (todos os avatares)</option>
            {db.avatars.map((avatar) => {
              const flag = db.countries.find((country) => country.id === avatar.country_id)?.flag;
              return (
                <option key={avatar.id} value={avatar.id}>
                  {flag ? `${flag} ` : ""}
                  {avatar.name}
                </option>
              );
            })}
          </Select>
        </Field>
      </div>
      <Field label="Prompt" optional={Boolean(file || keeps)} hint="O texto exatamente como você cola na IA.">
        <Textarea
          value={values.content}
          onChange={(e) => set("content", e.target.value)}
          rows={6}
          autoComplete="off"
          spellCheck={false}
          placeholder="Ex.: retrato de um frade de 70 anos, barba branca, hábito marrom, luz natural…"
        />
      </Field>
      <Field label="Anotações" optional hint="Em qual IA usar, as configurações, o que funcionou.">
        <Textarea value={values.notes} onChange={(e) => set("notes", e.target.value)} rows={2} autoComplete="off" />
      </Field>

      <div>
        <p className="mb-1.5 text-sm font-medium">Arquivo</p>
        {file ? (
          <FileLine name={file.name} size={file.size} note="vai ser enviado ao salvar">
            <Button size="sm" variant="ghost" onClick={() => setFile(null)}>
              <Undo2 className="size-4" /> Desfazer
            </Button>
          </FileLine>
        ) : keeps && item ? (
          <FileLine name={item.file_name ?? "arquivo"} size={item.file_size}>
            <Button size="sm" onClick={() => picker.current?.click()}>
              Trocar
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setDropFile(true)}>
              Tirar
            </Button>
          </FileLine>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={() => picker.current?.click()}>
              <Paperclip className="size-4" /> Anexar arquivo
            </Button>
            {dropFile ? (
              <Button size="sm" variant="ghost" onClick={() => setDropFile(false)}>
                <Undo2 className="size-4" /> Manter o arquivo
              </Button>
            ) : null}
          </div>
        )}
        {dropFile && !file ? <p className="mt-1.5 text-xs text-muted">O arquivo sai do item ao salvar.</p> : null}
        <p className="mt-1.5 text-xs leading-relaxed text-muted">Foto, PDF, vídeo, áudio… até 50 MB.</p>
        <input
          ref={picker}
          type="file"
          onChange={pick}
          className="sr-only"
          tabIndex={-1}
          aria-label="Escolher o arquivo do item"
        />
      </div>
    </FormModal>
  );
}

function FileLine({ name, size, note, children }: { name: string; size: number | null | undefined; note?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-surface-2/60 px-3 py-2">
      <p className="flex items-start gap-1.5 text-sm">
        <Paperclip className="mt-0.5 size-3.5 shrink-0 text-muted" aria-hidden />
        <span className="min-w-0 font-medium">{name}</span>
      </p>
      <p className="mt-0.5 pl-5 text-xs text-muted">{[formatBytes(size), note].filter(Boolean).join(" · ")}</p>
      <div className="mt-1.5 flex flex-wrap gap-2 pl-3">{children}</div>
    </div>
  );
}
