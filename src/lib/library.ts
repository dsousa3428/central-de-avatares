// Arquivos e prompts: as regras (sem tela e sem banco).
//
// Cada item é um prompt (o texto que se cola na IA), um arquivo guardado no
// armazenamento do Supabase (foto, PDF, vídeo, áudio…) ou os dois juntos — o
// prompt e a imagem que ele gerou. Um item pode ser de um avatar ou geral.
//
// O arquivo fica no bucket privado "arquivos", na pasta do próprio usuário:
// "<id do usuário>/<id do item>/<marca>-<nome>". A regra de acesso do banco só
// deixa cada um mexer na própria pasta (ver supabase/schema.sql).

import { foldText } from "./search";
import type { LibraryCategory, LibraryItem } from "./types";

export const BUCKET = "arquivos";
/** O maior arquivo que o plano gratuito do Supabase aceita. */
export const MAX_FILE_BYTES = 50 * 1024 * 1024;
/** Quanto o plano gratuito do Supabase guarda, somando tudo. */
export const FREE_PLAN_BYTES = 1024 * 1024 * 1024;

export const CATEGORIES: ReadonlyArray<{ value: LibraryCategory; label: string }> = [
  { value: "imagem", label: "Imagem" },
  { value: "video", label: "Vídeo" },
  { value: "texto", label: "Texto" },
  { value: "voz", label: "Voz" },
  { value: "outro", label: "Outro" },
];

const CATEGORY_VALUES = new Set<string>(CATEGORIES.map((item) => item.value));

/** O tipo guardado no banco (texto livre lá): o que não for conhecido vira "outro". */
export function readCategory(value: unknown): LibraryCategory {
  return typeof value === "string" && CATEGORY_VALUES.has(value) ? (value as LibraryCategory) : "outro";
}

export function categoryLabel(value: unknown): string {
  const category = readCategory(value);
  return CATEGORIES.find((item) => item.value === category)?.label ?? "Outro";
}

// ---------------------------------------------------------------------------
// Arquivos
// ---------------------------------------------------------------------------

export type FileKind = "image" | "video" | "audio" | "pdf" | "text" | "archive" | "other";

function extensionOf(name: string | null | undefined): string {
  const match = /\.([a-z0-9]{1,8})$/i.exec((name ?? "").trim());
  return match ? match[1].toLowerCase() : "";
}

const EXTENSIONS: Record<string, FileKind> = {
  jpg: "image", jpeg: "image", png: "image", gif: "image", webp: "image", heic: "image", heif: "image", avif: "image", bmp: "image", svg: "image",
  mp4: "video", mov: "video", m4v: "video", webm: "video", avi: "video", mkv: "video",
  mp3: "audio", m4a: "audio", wav: "audio", ogg: "audio", aac: "audio", flac: "audio", opus: "audio",
  pdf: "pdf",
  txt: "text", md: "text", doc: "text", docx: "text", rtf: "text", odt: "text", epub: "text", csv: "text", json: "text",
  zip: "archive", rar: "archive", "7z": "archive",
};

/** Que tipo de arquivo é (para o ícone e para o tipo sugerido), pelo tipo informado pelo aparelho ou pela extensão. */
export function fileKind(type: string | null | undefined, name: string | null | undefined): FileKind {
  const mime = (type ?? "").toLowerCase();
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  if (mime === "application/pdf") return "pdf";
  if (mime.startsWith("text/")) return "text";
  return EXTENSIONS[extensionOf(name)] ?? "other";
}

/** O tipo sugerido para um arquivo enviado (dá para trocar depois). */
export function categoryOfFile(type: string | null | undefined, name: string | null | undefined): LibraryCategory {
  const kind = fileKind(type, name);
  if (kind === "image") return "imagem";
  if (kind === "video") return "video";
  if (kind === "audio") return "voz";
  if (kind === "pdf" || kind === "text") return "texto";
  return "outro";
}

/** Imagem que o navegador sabe mostrar e reduzir (a miniatura é feita no próprio aparelho). */
export function canMakeThumbnail(type: string | null | undefined, name: string | null | undefined): boolean {
  if (fileKind(type, name) !== "image") return false;
  return !/svg/i.test(type ?? "") && extensionOf(name) !== "svg";
}

/** "850 KB", "2,4 MB", "1,2 GB". */
export function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined) return "";
  const n = Number(bytes);
  if (!Number.isFinite(n) || n < 0) return "";
  const format = (value: number, unit: string) =>
    `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: value < 10 ? 1 : 0 }).format(value)} ${unit}`;
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return format(n / 1024, "KB");
  if (n < 1024 ** 3) return format(n / 1024 ** 2, "MB");
  return format(n / 1024 ** 3, "GB");
}

/**
 * O nome do arquivo como ele vai para o armazenamento: sem acentos nem espaços,
 * só letras, números, ponto, hífen e sublinhado (o nome original fica guardado
 * no item e é o que aparece na tela e no download).
 */
export function safeFileName(name: string | null | undefined): string {
  const original = (name ?? "").trim();
  const extension = extensionOf(original);
  const base = (extension ? original.slice(0, -(extension.length + 1)) : original)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 80);
  return `${base || "arquivo"}${extension ? `.${extension}` : ""}`;
}

/** Onde o arquivo de um item fica no bucket. A marca muda a cada troca de arquivo (o nome nunca repete). */
export function storagePath(userId: string, itemId: string, stamp: string, name: string): string {
  return `${userId}/${itemId}/${stamp}-${safeFileName(name)}`;
}

/** Onde fica a miniatura de uma imagem. */
export function thumbnailPath(userId: string, itemId: string, stamp: string): string {
  return `${userId}/${itemId}/${stamp}-miniatura.jpg`;
}

/** "Rosto do frade.png" vira "Rosto do frade" (o título sugerido de um arquivo enviado). */
export function titleFromFileName(name: string | null | undefined): string {
  const original = (name ?? "").trim();
  const extension = extensionOf(original);
  const base = (extension ? original.slice(0, -(extension.length + 1)) : original).trim();
  return (base || original || "Arquivo").slice(0, 120);
}

/** null = pode enviar; senão, o motivo (em português). */
export function fileProblem(file: { size: number; name: string }): string | null {
  if (file.size === 0) return "O arquivo está vazio.";
  if (file.size > MAX_FILE_BYTES) {
    return `O arquivo tem ${formatBytes(file.size)}: o limite é ${formatBytes(MAX_FILE_BYTES)} por arquivo (plano gratuito do Supabase).`;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Lista, busca e filtros
// ---------------------------------------------------------------------------

export function hasPrompt(item: Pick<LibraryItem, "content">): boolean {
  return Boolean(item.content?.trim());
}

export function hasFile(item: Pick<LibraryItem, "file_path">): boolean {
  return Boolean(item.file_path);
}

export type LibraryShow = "tudo" | "prompts" | "arquivos";
/** "todos" = qualquer avatar · "geral" = só os itens que não são de um avatar · senão, o id do avatar. */
export type AvatarFilter = "todos" | "geral" | string;

export interface LibraryFilter {
  show: LibraryShow;
  avatar: AvatarFilter;
  category: LibraryCategory | "todas";
  query: string;
}

export const NO_FILTER: LibraryFilter = { show: "tudo", avatar: "todos", category: "todas", query: "" };

export function isFiltering(filter: LibraryFilter): boolean {
  return filter.show !== "tudo" || filter.avatar !== "todos" || filter.category !== "todas" || filter.query.trim() !== "";
}

/**
 * Os itens que passam nos filtros, na ordem em que vieram. A busca ignora
 * acentos e maiúsculas, e cada palavra digitada precisa aparecer em algum lugar
 * do item (título, prompt, anotações, nome do arquivo, avatar ou tipo).
 */
export function filterLibrary(
  items: readonly LibraryItem[],
  filter: LibraryFilter,
  avatarName: (id: string) => string | undefined = () => undefined,
): LibraryItem[] {
  const words = foldText(filter.query).split(/\s+/).filter(Boolean);
  return items.filter((item) => {
    if (filter.show === "prompts" && !hasPrompt(item)) return false;
    if (filter.show === "arquivos" && !hasFile(item)) return false;
    if (filter.avatar === "geral" && item.avatar_id) return false;
    if (filter.avatar !== "todos" && filter.avatar !== "geral" && item.avatar_id !== filter.avatar) return false;
    if (filter.category !== "todas" && readCategory(item.category) !== filter.category) return false;
    if (words.length === 0) return true;
    const haystack = foldText(
      [
        item.title,
        item.content,
        item.notes,
        item.file_name,
        item.avatar_id ? avatarName(item.avatar_id) : "geral",
        categoryLabel(item.category),
      ]
        .filter(Boolean)
        .join(" \n "),
    );
    return words.every((word) => haystack.includes(word));
  });
}

export interface LibraryUsage {
  prompts: number;
  files: number;
  /** Soma dos arquivos (as miniaturas, pequenas, ficam de fora da conta). */
  bytes: number;
}

export function libraryUsage(items: readonly LibraryItem[]): LibraryUsage {
  let prompts = 0;
  let files = 0;
  let bytes = 0;
  for (const item of items) {
    if (hasPrompt(item)) prompts += 1;
    if (hasFile(item)) {
      files += 1;
      bytes += Number(item.file_size) || 0;
    }
  }
  return { prompts, files, bytes };
}

/** O link de download: o mesmo link assinado, pedindo ao Supabase para baixar com o nome original. */
export function downloadUrl(signedUrl: string, fileName: string | null | undefined): string {
  const name = (fileName ?? "").trim();
  return `${signedUrl}${signedUrl.includes("?") ? "&" : "?"}download=${encodeURIComponent(name)}`;
}
