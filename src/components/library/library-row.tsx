"use client";

import { useState } from "react";
import {
  Download,
  ExternalLink,
  File,
  FileArchive,
  FileText,
  Film,
  ImageIcon,
  MessageSquareText,
  Music,
  Paperclip,
  Pencil,
} from "lucide-react";
import { cn } from "@/lib/format";
import { categoryLabel, downloadUrl, fileKind, formatBytes, hasFile, hasPrompt, type FileKind } from "@/lib/library";
import type { LibraryItem } from "@/lib/types";
import { LongText } from "@/components/common/long-text";
import { Button, buttonClass } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import type { FileLinks } from "./use-file-links";

const ICONS: Record<FileKind, typeof File> = {
  image: ImageIcon,
  video: Film,
  audio: Music,
  pdf: FileText,
  text: FileText,
  archive: FileArchive,
  other: File,
};

/** Um item da lista: o prompt (com o botão de copiar) e/ou o arquivo (abrir e baixar). */
export function LibraryRow({
  item,
  links,
  avatarLabel,
  onEdit,
}: {
  item: LibraryItem;
  links: FileLinks;
  /** "🇮🇹 Fra' Salvio" ou "Geral". */
  avatarLabel: string;
  onEdit: () => void;
}) {
  const prompt = hasPrompt(item) ? (item.content ?? "") : "";
  const withFile = hasFile(item);
  const fileUrl = item.file_path ? links.links.get(item.file_path) : undefined;
  const missing = Boolean(item.file_path && links.missing.has(item.file_path));
  const meta = [avatarLabel, categoryLabel(item.category), withFile ? formatBytes(item.file_size) : ""].filter(Boolean);
  return (
    <li className="flex gap-3 py-3">
      <Preview item={item} links={links} />
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-1">
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-medium leading-snug">{item.title}</p>
            <p className="mt-0.5 text-xs text-muted">{meta.join(" · ")}</p>
          </div>
          <Button size="sm" variant="ghost" iconOnly aria-label={`Editar ${item.title}`} onClick={onEdit} className="-mr-2 -mt-1">
            <Pencil className="size-4 text-muted" />
          </Button>
        </div>

        {prompt ? (
          <LongText text={prompt} className="mt-2" textClassName="rounded-lg border border-line bg-surface-2 px-3 py-2 text-fg" />
        ) : null}
        {withFile && prompt ? (
          <p className="mt-1.5 flex items-center gap-1.5 text-sm text-muted">
            <Paperclip className="size-3.5 shrink-0" aria-hidden />
            <span className="min-w-0">{item.file_name}</span>
          </p>
        ) : null}
        {withFile && !prompt && item.file_name && item.file_name !== item.title ? (
          <p className="mt-1 text-sm text-muted">{item.file_name}</p>
        ) : null}
        {item.notes ? <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-muted">{item.notes}</p> : null}

        <div className="mt-2 flex flex-wrap gap-2">
          {prompt ? <CopyButton text={prompt} message="Prompt copiado" label="Copiar prompt" variant="soft" /> : null}
          {withFile ? (
            fileUrl ? (
              <>
                <a
                  href={fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={buttonClass("secondary", "sm")}
                  aria-label={`Abrir ${item.title}`}
                >
                  <ExternalLink className="size-4" /> Abrir
                </a>
                <a href={downloadUrl(fileUrl, item.file_name)} className={buttonClass("secondary", "sm")} aria-label={`Baixar ${item.title}`}>
                  <Download className="size-4" /> Baixar
                </a>
              </>
            ) : missing ? (
              <p className="text-sm text-muted">
                Arquivo não encontrado no armazenamento (pode ter sido apagado).{prompt ? " O prompt continua aqui." : ""}
              </p>
            ) : (
              <Button size="sm" disabled>
                Preparando o link…
              </Button>
            )
          ) : null}
        </div>
      </div>
    </li>
  );
}

/** A miniatura (imagens) ou o ícone do tipo de item. */
function Preview({ item, links }: { item: LibraryItem; links: FileLinks }) {
  const [broken, setBroken] = useState(false);
  const thumb = item.thumb_path ? links.links.get(item.thumb_path) : undefined;
  const fileUrl = item.file_path ? links.links.get(item.file_path) : undefined;
  const box = "flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-line bg-surface-2 text-muted";
  if (thumb && !broken) {
    const image = (
      // (as miniaturas vêm de um link temporário do Supabase: o otimizador de imagens do Next.js não tem como usá-las)
      // eslint-disable-next-line @next/next/no-img-element
      <img src={thumb} alt="" loading="lazy" className="size-full object-cover" onError={() => setBroken(true)} />
    );
    return fileUrl ? (
      <a href={fileUrl} target="_blank" rel="noopener noreferrer" className={box} aria-label={`Ver ${item.title}`} tabIndex={-1}>
        {image}
      </a>
    ) : (
      <span className={box}>{image}</span>
    );
  }
  const Icon = hasFile(item) ? ICONS[fileKind(item.file_type, item.file_name)] : MessageSquareText;
  return (
    <span className={cn(box, !hasFile(item) && "bg-primary-soft text-primary-soft-fg")} aria-hidden>
      <Icon className="size-6" />
    </span>
  );
}
