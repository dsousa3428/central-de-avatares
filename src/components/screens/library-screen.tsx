"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Database, FolderOpen, Plus, RefreshCw, Search, TriangleAlert, Upload } from "lucide-react";
import { plural } from "@/lib/format";
import {
  CATEGORIES,
  filterLibrary,
  formatBytes,
  FREE_PLAN_BYTES,
  isFiltering,
  libraryUsage,
  NO_FILTER,
  type LibraryFilter,
  type LibraryShow,
} from "@/lib/library";
import { getStore, refresh, useStore } from "@/lib/store";
import type { LibraryCategory, LibraryItem } from "@/lib/types";
import { CopySchemaButton } from "@/components/common/copy-schema-button";
import { ItemForm } from "@/components/library/item-form";
import { LibraryRow } from "@/components/library/library-row";
import { UploadDialog } from "@/components/library/upload-dialog";
import { useFileLinks } from "@/components/library/use-file-links";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { Callout, Card, EmptyState, Section } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/field";
import { Segmented } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";

/** Arquivos e prompts: prompts para copiar e arquivos guardados (fotos, PDFs, vídeos, áudios). */
export function LibraryScreen() {
  const db = useStore();
  const picker = useRef<HTMLInputElement>(null);
  const [filter, setFilter] = useState<LibraryFilter>(NO_FILTER);
  const [editing, setEditing] = useState<LibraryItem | "new" | null>(null);
  const [uploading, setUploading] = useState<File[] | null>(null);

  // A página de um avatar abre esta tela com ?avatar=<id>: o endereço é só o pedido de chegada.
  // O avatar pedido vira o filtro uma vez e sai do endereço; daí em diante quem manda é a tela.
  const asked = useSearchParams().get("avatar");
  const [adopted, setAdopted] = useState<string | null>(null);
  if (asked !== adopted) {
    setAdopted(asked);
    if (asked) setFilter({ ...NO_FILTER, avatar: asked });
  }
  useEffect(() => {
    if (asked !== null) window.history.replaceState(null, "", "/arquivos");
  }, [asked]);

  // (um avatar apagado em outra aba não pode continuar filtrando aqui)
  const avatarFilter =
    filter.avatar === "todos" || filter.avatar === "geral" || db.avatars.some((avatar) => avatar.id === filter.avatar)
      ? filter.avatar
      : "todos";
  const current: LibraryFilter = { ...filter, avatar: avatarFilter };
  const chosenAvatar = avatarFilter !== "todos" && avatarFilter !== "geral" ? avatarFilter : null;

  const labelOf = useMemo(() => {
    const names = new Map(
      db.avatars.map((avatar) => {
        const flag = db.countries.find((country) => country.id === avatar.country_id)?.flag;
        return [avatar.id, `${flag ? `${flag} ` : ""}${avatar.name}`];
      }),
    );
    return (id: string | null) => (id ? (names.get(id) ?? "Geral") : "Geral");
  }, [db.avatars, db.countries]);

  const visible = useMemo(
    () => filterLibrary(db.library, current, (id) => db.avatars.find((avatar) => avatar.id === id)?.name),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [db.library, db.avatars, current.show, current.avatar, current.category, current.query],
  );
  const links = useFileLinks(visible);
  const usage = libraryUsage(db.library);

  if (!db.libraryReady) {
    return (
      <>
        <PageHeader title="Arquivos e prompts" subtitle="Prompts para copiar e arquivos guardados (fotos, PDFs, vídeos)." />
        <LibrarySetup />
      </>
    );
  }

  function choose(event: React.ChangeEvent<HTMLInputElement>) {
    const files = [...(event.target.files ?? [])];
    event.target.value = ""; // escolher os mesmos arquivos de novo também funciona
    if (files.length > 0) setUploading(files);
  }

  const set = (patch: Partial<LibraryFilter>) => setFilter((now) => ({ ...now, avatar: avatarFilter, ...patch }));

  return (
    <>
      <PageHeader title="Arquivos e prompts" subtitle="Prompts para copiar e arquivos guardados (fotos, PDFs, vídeos)." />

      <div className="space-y-4">
        {/* (num celular bem estreito os dois botões não cabem lado a lado: o segundo desce) */}
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" className="flex-1 sm:flex-none" onClick={() => setEditing("new")}>
            <Plus className="size-4" /> Novo prompt
          </Button>
          <Button className="flex-1 sm:flex-none" onClick={() => picker.current?.click()}>
            <Upload className="size-4" /> Enviar arquivos
          </Button>
          <input
            ref={picker}
            type="file"
            multiple
            onChange={choose}
            className="sr-only"
            tabIndex={-1}
            aria-label="Arquivos para enviar"
          />
        </div>

        {db.library.length > 0 ? (
          <div className="space-y-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
              <Input
                type="search"
                value={filter.query}
                onChange={(event) => set({ query: event.target.value })}
                placeholder="Buscar por título ou texto"
                aria-label="Buscar em arquivos e prompts"
                autoComplete="off"
                className="pl-10"
              />
            </div>
            <Segmented
              ariaLabel="Mostrar"
              value={current.show}
              onChange={(show: LibraryShow) => set({ show })}
              items={[
                { value: "tudo", label: "Tudo" },
                { value: "prompts", label: "Prompts" },
                { value: "arquivos", label: "Arquivos" },
              ]}
            />
            <div className="flex flex-wrap gap-2">
              <span className="min-w-40 flex-1 sm:max-w-64">
                <Select value={avatarFilter} onChange={(event) => set({ avatar: event.target.value })} aria-label="Avatar" className="h-10">
                  <option value="todos">Avatar: todos</option>
                  <option value="geral">Só os gerais</option>
                  {db.avatars.map((avatar) => (
                    <option key={avatar.id} value={avatar.id}>
                      {labelOf(avatar.id)}
                    </option>
                  ))}
                </Select>
              </span>
              <span className="min-w-40 flex-1 sm:max-w-52">
                <Select
                  value={current.category}
                  onChange={(event) => set({ category: event.target.value as LibraryCategory | "todas" })}
                  aria-label="Tipo"
                  className="h-10"
                >
                  <option value="todas">Tipo: todos</option>
                  {CATEGORIES.map((category) => (
                    <option key={category.value} value={category.value}>
                      {category.label}
                    </option>
                  ))}
                </Select>
              </span>
            </div>
          </div>
        ) : null}

        <Usage prompts={usage.prompts} files={usage.files} bytes={usage.bytes} />

        {db.library.length === 0 ? (
          <Card>
            <EmptyState icon={<FolderOpen />} title="Nada guardado ainda">
              Guarde aqui os prompts que você usa nas IAs (para copiar com um toque) e os arquivos dos seus avatares: fotos
              de referência, PDFs, vídeos, áudios. Cada item pode ser de um avatar ou geral.
            </EmptyState>
          </Card>
        ) : visible.length === 0 ? (
          <Card>
            <EmptyState
              icon={<Search />}
              title="Nada encontrado"
              action={
                isFiltering(current) ? (
                  <Button size="sm" onClick={() => setFilter(NO_FILTER)}>
                    Limpar filtros
                  </Button>
                ) : null
              }
            >
              Nenhum item com estes filtros.
            </EmptyState>
          </Card>
        ) : (
          <Card className="px-4 md:px-5">
            <p className="pt-3 text-sm text-muted">
              {visible.length === db.library.length
                ? plural(visible.length, "item", "itens")
                : `${visible.length} de ${plural(db.library.length, "item", "itens")}`}
            </p>
            <ul className="divide-y divide-line" aria-label="Arquivos e prompts">
              {visible.map((item) => (
                <LibraryRow
                  key={item.id}
                  item={item}
                  links={links}
                  avatarLabel={labelOf(item.avatar_id)}
                  onEdit={() => setEditing(item)}
                />
              ))}
            </ul>
          </Card>
        )}
      </div>

      {editing ? (
        <ItemForm
          item={editing === "new" ? null : editing}
          initialAvatar={chosenAvatar}
          initialCategory={current.category === "todas" ? null : current.category}
          onClose={() => setEditing(null)}
        />
      ) : null}
      {uploading ? <UploadDialog files={uploading} initialAvatar={chosenAvatar} onClose={() => setUploading(null)} /> : null}
    </>
  );
}

/** Quanto do espaço do Supabase os arquivos ocupam. */
function Usage({ prompts, files, bytes }: { prompts: number; files: number; bytes: number }) {
  if (prompts === 0 && files === 0) return null;
  const share = bytes / FREE_PLAN_BYTES;
  const text = [
    prompts > 0 ? plural(prompts, "prompt", "prompts") : "",
    files > 0 ? `${plural(files, "arquivo", "arquivos")} (${formatBytes(bytes)} de ${formatBytes(FREE_PLAN_BYTES)})` : "",
  ]
    .filter(Boolean)
    .join(" · ");
  if (share < 0.8) return <p className="px-1 text-sm text-muted">{text}</p>;
  return (
    <Callout tone="warn" icon={<TriangleAlert />}>
      <p>{text}.</p>
      <p className="mt-1">
        O plano gratuito do Supabase guarda até {formatBytes(FREE_PLAN_BYTES)} de arquivos. Apague o que não usa mais (ou
        guarde os arquivos grandes no Google Drive e cole o link nas anotações).
      </p>
    </Callout>
  );
}

/** O banco ainda não tem a tabela nem o lugar dos arquivos: o passo a passo do script. */
function LibrarySetup() {
  const toast = useToast();
  const [checking, setChecking] = useState(false);

  async function check() {
    setChecking(true);
    try {
      await refresh();
    } finally {
      setChecking(false);
    }
    if (!getStore().libraryReady) {
      toast.error("Ainda não encontrei a parte nova do banco. Confira se o script rodou até o fim (aparece “Tudo certo!”).");
    }
  }

  return (
    <Section title="Falta atualizar o banco (uma vez só)">
      <div className="space-y-3 text-[15px] leading-relaxed">
        <p className="flex gap-2">
          <Database className="mt-1 size-4 shrink-0 text-muted" aria-hidden />
          <span>
            Para guardar arquivos e prompts, o banco de dados precisa de uma parte nova: uma tabela e um lugar{" "}
            <strong>privado</strong> para os arquivos, que só o seu login abre. Ela entra quando você roda o script SQL
            atualizado:
          </span>
        </p>
        <ol className="list-decimal space-y-1.5 pl-5 marker:font-semibold marker:text-muted">
          <li>
            Toque em <strong>Copiar script SQL</strong>, aqui embaixo.
          </li>
          <li>
            No site do Supabase, abra o seu projeto, vá em <strong>SQL Editor</strong>, cole o script e toque em{" "}
            <strong>Run</strong>. Deve aparecer <em>“Tudo certo!”</em>.
          </li>
          <li>
            Volte aqui e toque em <strong>Já rodei</strong>.
          </li>
        </ol>
        <p className="text-sm text-muted">Rodar o script de novo é seguro: ele só cria o que falta e nunca apaga dados.</p>
        <div className="flex flex-wrap gap-2">
          <CopySchemaButton />
          <Button onClick={() => void check()} loading={checking}>
            <RefreshCw className="size-4" /> Já rodei
          </Button>
        </div>
      </div>
    </Section>
  );
}
