"use client";

// Arquivos e prompts: as gravações (as regras ficam em ./library).
//
// Ordem das coisas, para nunca sobrar um item apontando para um arquivo que não existe:
//  - arquivo novo: primeiro envia o arquivo, depois grava o item. Se a gravação do
//    item falhar, o arquivo recém-enviado é apagado (fica no máximo um arquivo solto);
//  - trocar ou tirar o arquivo: grava o item primeiro, depois apaga o arquivo antigo;
//  - apagar o item: apaga o item primeiro, depois o arquivo.
// Apagar um arquivo que sobrou é sempre "melhor esforço": se falhar, ele só ocupa espaço.

import { AppError, toAppError } from "./errors";
import {
  BUCKET,
  canMakeThumbnail,
  categoryOfFile,
  fileProblem,
  storagePath,
  thumbnailPath,
  titleFromFileName,
} from "./library";
import { deleteRow, getStore, insertRow, updateRow } from "./store";
import { getSupabase } from "./supabase";
import type { LibraryCategory, LibraryItem, RowPatch } from "./types";

/**
 * Um id novo no formato do banco (uuid), que também dá nome à pasta do item no
 * armazenamento. (`crypto.randomUUID` não existe em celulares mais antigos, como o
 * iPhone com iOS 15.0–15.3: aí o id sai dos mesmos números aleatórios, montado à mão.)
 */
function newId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** O código do erro quando falta preparar o lugar dos arquivos no Supabase (rodar o script SQL atualizado). */
export const STORAGE_UNAVAILABLE = "storage_unavailable";

/** Transforma a resposta de erro do armazenamento numa mensagem clara. */
function storageError(err: unknown): AppError {
  if (err instanceof AppError) return err;
  const e = (err ?? {}) as { message?: unknown; statusCode?: unknown; status?: unknown; name?: unknown };
  const message = typeof e.message === "string" ? e.message : String(err ?? "");
  const status = Number(e.status ?? e.statusCode);
  if (/bucket not found/i.test(message)) {
    return new AppError(
      "schema",
      "Falta preparar o lugar dos arquivos no Supabase: rode o script SQL atualizado (o passo a passo está no topo desta tela).",
      STORAGE_UNAVAILABLE,
      message,
    );
  }
  if (status === 413 || /maximum allowed size|too large|payload/i.test(message)) {
    return new AppError("invalid", "O arquivo é grande demais: o limite é 50 MB por arquivo (plano gratuito do Supabase).", "413", message);
  }
  if (status === 403 || /row-level security|unauthorized|access ?denied/i.test(message)) {
    return new AppError(
      "schema",
      "O Supabase recusou o arquivo. Rode o script SQL atualizado (o passo a passo está no topo desta tela) e tente de novo.",
      STORAGE_UNAVAILABLE,
      message,
    );
  }
  const general = toAppError(err);
  if (general.kind === "network") return general;
  return new AppError("unknown", `Não consegui guardar o arquivo agora (${message}). Tente de novo.`, undefined, message);
}

function userId(): string {
  const id = getStore().userId;
  if (!id) throw new AppError("auth", "Sua sessão expirou. Entre novamente.");
  return id;
}

/** Apaga arquivos que sobraram. Nunca falha: um arquivo que não saiu só ocupa espaço. */
async function removeQuietly(paths: Array<string | null | undefined>): Promise<void> {
  const list = paths.filter((path): path is string => Boolean(path));
  if (list.length === 0) return;
  try {
    await getSupabase().storage.from(BUCKET).remove(list);
  } catch {
    // (fica para trás; não atrapalha nada)
  }
}

const THUMB_SIZE = 320;

/** Uma miniatura JPEG da imagem (até 320 px), feita no próprio aparelho. null se o navegador não souber abrir a imagem. */
async function makeThumbnail(file: File): Promise<Blob | null> {
  if (!canMakeThumbnail(file.type, file.name)) return null;
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = "async";
    image.src = url;
    await image.decode();
    const width = image.naturalWidth;
    const height = image.naturalHeight;
    if (!width || !height) return null;
    const scale = Math.min(1, THUMB_SIZE / Math.max(width, height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext("2d");
    if (!context) return null;
    // (imagem com fundo transparente fica com fundo branco: o JPEG não tem transparência)
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob | null>((resolve) => canvas.toBlob((blob) => resolve(blob), "image/jpeg", 0.82));
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

type StoredFile = Pick<LibraryItem, "file_path" | "thumb_path" | "file_name" | "file_size" | "file_type">;

/** Envia o arquivo (e a miniatura, se for imagem) para a pasta do item. */
async function sendFile(itemId: string, file: File): Promise<StoredFile> {
  const problem = fileProblem(file);
  if (problem) throw new AppError("invalid", problem);
  const owner = userId();
  const stamp = Date.now().toString(36);
  const path = storagePath(owner, itemId, stamp, file.name);
  const bucket = getSupabase().storage.from(BUCKET);
  const type = file.type || "application/octet-stream";
  try {
    const { error } = await bucket.upload(path, file, { contentType: type, upsert: false });
    if (error) throw error;
  } catch (err) {
    throw storageError(err);
  }
  // a miniatura é um extra: se não der, o item fica só com o ícone do tipo de arquivo
  let thumb: string | null = null;
  const small = await makeThumbnail(file);
  if (small) {
    const target = thumbnailPath(owner, itemId, stamp);
    try {
      const { error } = await bucket.upload(target, small, { contentType: "image/jpeg", upsert: false });
      if (!error) thumb = target;
    } catch {
      thumb = null;
    }
  }
  return { file_path: path, thumb_path: thumb, file_name: file.name, file_size: file.size, file_type: type };
}

export interface ItemValues {
  title: string;
  category: LibraryCategory;
  avatar_id: string | null;
  content: string | null;
  notes: string | null;
}

/** Um item novo: um prompt, um arquivo ou os dois. */
export async function createLibraryItem(values: ItemValues, file: File | null): Promise<LibraryItem> {
  const id = newId();
  const stored = file ? await sendFile(id, file) : null;
  try {
    return await insertRow("library_items", { id, ...values, ...(stored ?? {}) });
  } catch (err) {
    await removeQuietly([stored?.file_path, stored?.thumb_path]);
    throw err;
  }
}

export interface UploadResult {
  file: File;
  item: LibraryItem | null;
  error: string | null;
}

/**
 * Vários arquivos de uma vez (cada um vira um item, com o nome do arquivo como
 * título e o tipo sugerido pelo próprio arquivo). Envia um de cada vez; um que
 * falha não impede os outros.
 */
export async function uploadFiles(
  files: readonly File[],
  avatarId: string | null,
  onProgress?: (index: number, state: "sending" | "done" | "error", message?: string) => void,
): Promise<UploadResult[]> {
  const results: UploadResult[] = [];
  for (const [index, file] of files.entries()) {
    onProgress?.(index, "sending");
    try {
      const item = await createLibraryItem(
        {
          title: titleFromFileName(file.name),
          category: categoryOfFile(file.type, file.name),
          avatar_id: avatarId,
          content: null,
          notes: null,
        },
        file,
      );
      results.push({ file, item, error: null });
      onProgress?.(index, "done");
    } catch (err) {
      const message = toAppError(err).message;
      results.push({ file, item: null, error: message });
      onProgress?.(index, "error", message);
    }
  }
  return results;
}

export interface FileChange {
  /** Um arquivo novo (no lugar do que havia, ou o primeiro). */
  file?: File | null;
  /** Tirar o arquivo do item (o prompt continua). */
  removeFile?: boolean;
}

/** Corrige um item; com `change.file` troca (ou acrescenta) o arquivo, com `change.removeFile` tira o arquivo. */
export async function updateLibraryItem(item: LibraryItem, values: ItemValues, change: FileChange = {}): Promise<void> {
  const stored = change.file ? await sendFile(item.id, change.file) : null;
  const dropFile = !stored && change.removeFile === true;
  // os arquivos que o item tinha de fato no momento da gravação (não os da tela, que podem estar velhos)
  let previous: Array<string | null> = [];
  try {
    await updateRow("library_items", item.id, (row) => {
      const patch: RowPatch<"library_items"> = { ...values };
      if (stored) Object.assign(patch, stored);
      if (dropFile) Object.assign(patch, { file_path: null, thumb_path: null, file_name: null, file_size: null, file_type: null });
      previous = stored || dropFile ? [row.file_path, row.thumb_path] : [];
      return patch;
    });
  } catch (err) {
    await removeQuietly([stored?.file_path, stored?.thumb_path]);
    throw err;
  }
  await removeQuietly(previous);
}

/** Apaga o item e, depois, o arquivo dele. */
export async function deleteLibraryItem(item: LibraryItem): Promise<void> {
  await deleteRow("library_items", item.id);
  await removeQuietly([item.file_path, item.thumb_path]);
}

/**
 * Links temporários (assinados) para abrir os arquivos: o bucket é privado, sem eles
 * nada abre. `missing` = arquivos que não estão mais no armazenamento (ex.: um item
 * que voltou com um backup antigo, de um arquivo que já tinha sido apagado).
 */
export async function signLinks(
  paths: readonly string[],
  seconds: number,
): Promise<{ links: Map<string, string>; missing: Set<string> }> {
  const links = new Map<string, string>();
  const missing = new Set<string>();
  const bucket = getSupabase().storage.from(BUCKET);
  for (let start = 0; start < paths.length; start += 100) {
    const chunk = paths.slice(start, start + 100);
    const { data, error } = await bucket.createSignedUrls(chunk, seconds);
    if (error) throw storageError(error);
    for (const entry of data ?? []) {
      if (!entry.path) continue;
      if (entry.signedUrl && !entry.error) links.set(entry.path, entry.signedUrl);
      else missing.add(entry.path);
    }
  }
  return { links, missing };
}
