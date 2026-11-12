"use client";

import { useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, ChevronDown, Copy, Download, Pencil, Search, X } from "lucide-react";
import { copyText } from "@/lib/clipboard";
import { todayISO } from "@/lib/dates";
import { downloadText, toCSV, toTSV } from "@/lib/export";
import { cn, naturalCompare } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";

export interface GridOption {
  value: string;
  label: string;
}

/** Como uma célula pode ser editada direto na grade. */
export type GridEdit<R> =
  | {
      type: "text" | "date";
      value: (row: R) => string;
      /** Grava o valor novo. Se lançar erro, a célula volta ao valor antigo e o erro aparece. */
      save: (row: R, value: string) => Promise<void>;
      inputMode?: "text" | "numeric" | "email" | "url";
    }
  | {
      type: "select";
      value: (row: R) => string;
      options: (row: R) => GridOption[];
      save: (row: R, value: string) => Promise<void>;
    };

export interface GridColumn<R> {
  key: string;
  header: string;
  /** Texto da célula: usado na tela (se não houver `render`), na busca e na exportação. */
  text: (row: R) => string;
  /** Valor para ordenar. Padrão: o texto. */
  sort?: (row: R) => string | number | null;
  /** Conteúdo personalizado da célula. */
  render?: (row: R) => React.ReactNode;
  align?: "left" | "right";
  /** Largura mínima (classe Tailwind, ex.: "min-w-40"). */
  width?: string;
  /** Classe de cor de uma bolinha mostrada antes do valor (ex.: status). */
  dot?: (row: R) => string | null;
  edit?: GridEdit<R>;
}

interface DataGridProps<R> {
  columns: GridColumn<R>[];
  rows: R[];
  rowKey: (row: R) => string;
  /** Nome do arquivo ao baixar, sem extensão. */
  exportName: string;
  /** O que mostrar quando não há linhas. */
  empty: React.ReactNode;
  /** Filtros próprios da tabela, mostrados acima da grade. */
  filters?: React.ReactNode;
  /** Ordem inicial das linhas (antes de o usuário tocar num cabeçalho). */
  initialSort?: { key: string; dir: "asc" | "desc" };
}

function compareValues(a: string | number | null, b: string | number | null): number {
  if (a === null || a === "") return b === null || b === "" ? 0 : 1; // vazios sempre no fim
  if (b === null || b === "") return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return naturalCompare(String(a), String(b));
}

/**
 * Grade em estilo planilha: cabeçalho e primeira coluna fixos, ordenar tocando
 * no cabeçalho, buscar, editar células e exportar.
 */
export function DataGrid<R>({ columns, rows, rowKey, exportName, empty, filters, initialSort }: DataGridProps<R>) {
  const toast = useToast();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" } | null>(initialSort ?? null);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    let list = rows;
    if (needle) {
      // também acha pelo jeito que aparece na tela: "@conta" (guardado sem o @) e "1.840" (guardado 1840)
      const needles = new Set([needle, needle.replace(/^@+/, "")]);
      if (/^\d{1,3}(\.\d{3})+$/.test(needle)) needles.add(needle.replace(/\./g, ""));
      needles.delete("");
      list = rows.filter((row) =>
        columns.some((column) => {
          const text = column.text(row).toLowerCase();
          return [...needles].some((n) => text.includes(n));
        }),
      );
    }
    const column = sort ? columns.find((c) => c.key === sort.key) : undefined;
    if (!column || !sort) return list;
    const valueOf = column.sort ?? column.text;
    const direction = sort.dir === "asc" ? 1 : -1;
    return [...list].sort((a, b) => {
      const va = valueOf(a);
      const vb = valueOf(b);
      // vazios ficam no fim nas duas direções
      if ((va === null || va === "") !== (vb === null || vb === "")) return compareValues(va, vb);
      return compareValues(va, vb) * direction;
    });
  }, [rows, columns, query, sort]);

  function toggleSort(key: string) {
    setSort((current) => {
      if (!current || current.key !== key) return { key, dir: "asc" };
      return current.dir === "asc" ? { key, dir: "desc" } : null;
    });
  }

  function table(): string[][] {
    return [columns.map((c) => c.header), ...visible.map((row) => columns.map((c) => c.text(row)))];
  }

  async function copy() {
    const ok = await copyText(toTSV(table()));
    if (ok) toast.success(`${visible.length === 1 ? "1 linha copiada" : `${visible.length} linhas copiadas`}. Cole no Excel ou no Google Planilhas.`);
    else toast.error("Não consegui copiar. Use “Baixar” no lugar.");
  }

  function download() {
    downloadText(`${exportName}-${todayISO()}.csv`, toCSV(table()));
    toast.success("Arquivo baixado");
  }

  const hasEditable = columns.some((c) => c.edit);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {filters}
        <label className="relative min-w-40 flex-1">
          <span className="sr-only">Buscar na tabela</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar…"
            autoComplete="off"
            className="h-10 w-full rounded-xl border border-line-strong bg-surface pl-9 pr-9 text-base shadow-card outline-none focus:border-primary focus:ring-2 focus:ring-ring/25 md:text-sm [&::-webkit-search-cancel-button]:hidden"
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Limpar busca"
              className="absolute right-1.5 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-lg text-muted hover:text-fg"
            >
              <X className="size-4" />
            </button>
          ) : null}
        </label>
        <Button size="sm" className="h-10" onClick={copy} disabled={visible.length === 0} title="Copiar para colar em uma planilha">
          <Copy className="size-4" /> Copiar
        </Button>
        <Button size="sm" className="h-10" onClick={download} disabled={visible.length === 0} title="Baixar em CSV">
          <Download className="size-4" /> Baixar
        </Button>
      </div>

      {visible.length === 0 ? (
        <div className="rounded-2xl border border-line bg-surface shadow-card">{rows.length === 0 ? empty : <p className="px-4 py-10 text-center text-sm text-muted">Nenhuma linha combina com a busca ou os filtros.</p>}</div>
      ) : (
        <div className="-mx-4 max-h-[72dvh] overflow-auto overscroll-x-contain border-y border-line bg-surface shadow-card md:mx-0 md:max-h-[calc(100dvh-19rem)] md:rounded-2xl md:border">
          <table className="w-max min-w-full border-separate border-spacing-0 text-sm">
            <thead>
              <tr>
                {columns.map((column, index) => {
                  const active = sort?.key === column.key;
                  return (
                    <th
                      key={column.key}
                      scope="col"
                      aria-sort={active ? (sort?.dir === "asc" ? "ascending" : "descending") : "none"}
                      className={cn(
                        "sticky top-0 z-20 border-b border-r border-line bg-surface-2 p-0 text-left font-semibold last:border-r-0",
                        index === 0 && "left-0 z-30 max-w-[42vw] md:max-w-72",
                        column.width,
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => toggleSort(column.key)}
                        title="Ordenar por esta coluna"
                        className={cn(
                          "flex h-10 w-full items-center gap-1.5 whitespace-nowrap px-3 text-left hover:bg-line/60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
                          column.align === "right" && "justify-end",
                        )}
                      >
                        {column.header}
                        {column.edit ? <Pencil className="size-3 text-muted/70" aria-label="coluna editável" /> : null}
                        {active ? (
                          sort?.dir === "asc" ? (
                            <ArrowUp className="size-3.5 text-primary" aria-hidden />
                          ) : (
                            <ArrowDown className="size-3.5 text-primary" aria-hidden />
                          )
                        ) : null}
                      </button>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => (
                <tr key={rowKey(row)} className="group">
                  {columns.map((column, index) => (
                    <td
                      key={column.key}
                      className={cn(
                        "h-10 max-w-72 border-b border-r border-line p-0 align-middle last:border-r-0 group-last:border-b-0",
                        index === 0 ? "sticky left-0 z-10 max-w-[42vw] bg-surface font-medium md:max-w-72" : "bg-surface",
                        column.align === "right" && "text-right tabular-nums",
                      )}
                    >
                      {column.edit ? (
                        <EditableCell row={row} column={column} edit={column.edit} />
                      ) : (
                        <div className="truncate px-3 py-2" title={column.render ? undefined : column.text(row)}>
                          {column.render ? column.render(row) : column.text(row) || <span className="text-muted">—</span>}
                        </div>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-2.5 px-1 text-xs leading-relaxed text-muted">
        {visible.length === rows.length
          ? `${rows.length === 1 ? "1 linha" : `${rows.length} linhas`}`
          : `${visible.length} de ${rows.length} linhas`}
        {hasEditable ? (
          <>
            {" · "}colunas com <Pencil className="inline size-3 align-[-1px]" aria-hidden /> podem ser editadas: toque na
            célula
          </>
        ) : null}
        {" · "}toque no título de uma coluna para ordenar
      </p>
    </div>
  );
}

interface EditableCellProps<R> {
  row: R;
  column: GridColumn<R>;
  edit: GridEdit<R>;
}

/** Célula editável: toque para alterar; Enter (ou sair do campo) grava, Esc cancela. */
function EditableCell<R>({ row, column, edit }: EditableCellProps<R>) {
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const cancelled = useRef(false);
  const current = edit.value(row);

  async function commit(value: string) {
    setEditing(false);
    if (cancelled.current || value === current) {
      cancelled.current = false;
      return;
    }
    setSaving(true);
    try {
      await edit.save(row, value);
    } catch (err) {
      toast.error(err);
    } finally {
      setSaving(false);
    }
  }

  if (edit.type === "select") {
    const options = edit.options(row);
    const dot = column.dot?.(row);
    return (
      <span className="relative block h-full">
        {dot ? (
          <span className={cn("pointer-events-none absolute left-3 top-1/2 size-2 -translate-y-1/2 rounded-full", dot)} aria-hidden />
        ) : null}
        <select
          value={current}
          disabled={saving}
          onChange={(e) => void commit(e.target.value)}
          aria-label={column.header}
          className={cn(
            "h-10 w-full cursor-pointer appearance-none truncate bg-transparent py-0 pl-3 pr-8 text-sm outline-none hover:bg-primary-soft/50 focus-visible:bg-primary-soft/50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring disabled:opacity-60",
            dot && "pl-7",
          )}
        >
          {options.some((o) => o.value === current) ? null : <option value={current}>{current || "—"}</option>}
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        {saving ? (
          <Spinner className="pointer-events-none absolute right-2 top-1/2 size-4 -translate-y-1/2" />
        ) : (
          <ChevronDown className="pointer-events-none absolute right-2 top-1/2 size-3.5 -translate-y-1/2 text-muted" aria-hidden />
        )}
      </span>
    );
  }

  if (editing) {
    return (
      <input
        autoFocus
        type={edit.type === "date" ? "date" : "text"}
        inputMode={edit.type === "text" ? edit.inputMode : undefined}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => void commit(draft)}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") {
            cancelled.current = true;
            e.currentTarget.blur();
          }
        }}
        aria-label={column.header}
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        className={cn(
          "h-10 w-full min-w-28 bg-primary-soft/60 px-3 text-base outline-2 -outline-offset-2 outline-ring md:text-sm",
          column.align === "right" && "text-right",
        )}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        cancelled.current = false;
        setDraft(current);
        setEditing(true);
      }}
      disabled={saving}
      title="Toque para editar"
      className={cn(
        "flex h-10 w-full items-center gap-2 px-3 text-left hover:bg-primary-soft/50 focus-visible:bg-primary-soft/50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
        column.align === "right" && "justify-end text-right",
      )}
    >
      <span className="min-w-0 truncate">
        {column.render ? column.render(row) : column.text(row) || <span className="text-muted">—</span>}
      </span>
      {saving ? <Spinner className="size-4 shrink-0" /> : null}
    </button>
  );
}
