"use client";

import { useState } from "react";
import { Check, Clapperboard, Pencil, Plus } from "lucide-react";
import { cn } from "@/lib/format";
import { updateRow } from "@/lib/store";
import type { Avatar, ModelVideo, VideoStatus } from "@/lib/types";
import { ExternalLinkText } from "@/components/common/detail-row";
import { ItemFormModal, removeById, upsertById, type ItemField } from "@/components/common/item-form-modal";
import { Button } from "@/components/ui/button";
import { EmptyState, Section } from "@/components/ui/card";
import { Segmented } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";

const FIELDS: ItemField[] = [
  { key: "label", label: "Rótulo", required: true, placeholder: "Ex.: Receita de chá em 30 segundos" },
  { key: "url", label: "Link do vídeo", kind: "url", placeholder: "https://…" },
  {
    key: "status",
    label: "Situação",
    kind: "select",
    required: true,
    options: [
      { value: "a_modelar", label: "A modelar" },
      { value: "modelado", label: "Modelado" },
    ],
  },
  { key: "note", label: "Observação", kind: "textarea", rows: 2, placeholder: "O que modelar neste vídeo" },
];

type Filter = "todos" | VideoStatus;

export function VideosTab({ avatar }: { avatar: Avatar }) {
  const toast = useToast();
  const [filter, setFilter] = useState<Filter>("todos");
  const [editing, setEditing] = useState<ModelVideo | "new" | null>(null);
  const videos = avatar.model_videos ?? [];
  const pending = videos.filter((v) => v.status === "a_modelar").length;
  const visible = filter === "todos" ? videos : videos.filter((v) => v.status === filter);

  async function save(item: ModelVideo) {
    await updateRow("avatars", avatar.id, (row) => ({ model_videos: upsertById(row.model_videos, item) }));
    toast.success("Vídeo salvo");
  }

  async function remove(id: string) {
    await updateRow("avatars", avatar.id, (row) => ({ model_videos: removeById(row.model_videos, id) }));
    toast.success("Vídeo apagado");
  }

  async function toggle(video: ModelVideo) {
    const status: VideoStatus = video.status === "modelado" ? "a_modelar" : "modelado";
    try {
      await updateRow(
        "avatars",
        avatar.id,
        (row) => ({
          model_videos: (row.model_videos ?? []).map((v) => (v.id === video.id ? { ...v, status } : v)),
        }),
        { optimistic: true },
      );
    } catch (err) {
      toast.error(err);
    }
  }

  return (
    <>
      <Section
        title="Vídeos para modelar"
        subtitle={
          videos.length > 0 ? `${pending} a modelar · ${videos.length - pending} modelado(s)` : "Referências de vídeos para recriar."
        }
        actions={
          <Button size="sm" variant="soft" onClick={() => setEditing("new")}>
            <Plus className="size-4" /> Adicionar
          </Button>
        }
      >
        {videos.length === 0 ? (
          <EmptyState icon={<Clapperboard />} title="Nenhum vídeo ainda" className="py-5">
            Guarde aqui os links dos vídeos que você quer modelar para este avatar.
          </EmptyState>
        ) : (
          <>
            <Segmented
              ariaLabel="Filtrar vídeos"
              value={filter}
              onChange={setFilter}
              items={[
                { value: "todos", label: "Todos" },
                { value: "a_modelar", label: "A modelar" },
                { value: "modelado", label: "Modelados" },
              ]}
              className="mb-2"
            />
            {visible.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted">Nenhum vídeo nesta situação.</p>
            ) : (
              <ul className="divide-y divide-line">
                {visible.map((video) => {
                  const done = video.status === "modelado";
                  return (
                    <li key={video.id} className="flex items-start gap-3 py-3">
                      <button
                        type="button"
                        onClick={() => void toggle(video)}
                        aria-pressed={done}
                        aria-label={done ? "Marcar como a modelar" : "Marcar como modelado"}
                        title={done ? "Modelado — toque para desfazer" : "Toque para marcar como modelado"}
                        className={cn(
                          "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                          done
                            ? "border-emerald-500 bg-emerald-500 text-white"
                            : "border-line-strong text-transparent hover:border-emerald-500",
                        )}
                      >
                        <Check className="size-4" strokeWidth={3} />
                      </button>
                      <div className="min-w-0 flex-1">
                        <p className={cn("text-[15px] font-medium leading-snug", done && "text-muted line-through")}>
                          {video.label}
                        </p>
                        {video.url ? <ExternalLinkText url={video.url} className="mt-0.5 text-sm" /> : null}
                        {video.note ? (
                          <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-muted">{video.note}</p>
                        ) : null}
                      </div>
                      <Button size="sm" variant="ghost" iconOnly aria-label={`Editar ${video.label}`} onClick={() => setEditing(video)}>
                        <Pencil className="size-4 text-muted" />
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}
      </Section>

      {editing ? (
        <ItemFormModal<ModelVideo>
          title={editing === "new" ? "Novo vídeo para modelar" : "Editar vídeo"}
          fields={FIELDS}
          item={editing === "new" ? undefined : editing}
          defaults={{ status: "a_modelar", note: "", url: "" }}
          onSave={save}
          onDelete={editing === "new" ? undefined : () => remove(editing.id)}
          deleteTitle="Apagar este vídeo?"
          onClose={() => setEditing(null)}
        />
      ) : null}
    </>
  );
}
