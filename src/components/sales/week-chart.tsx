"use client";

import { useState } from "react";
import { cn, plural } from "@/lib/format";
import { formatIn, niceScale, weekAgo, weekLabel, weekTick, type Unit, type WeekPoint } from "@/lib/sales";

interface WeekChartProps {
  /** Uma coluna por semana, da mais antiga para a mais nova. */
  points: WeekPoint[];
  /** A moeda em que as colunas estão. */
  unit: Unit;
  today: string;
  /** O que dizer quando não há nada para desenhar (padrão: nenhuma venda no período). */
  emptyText?: string;
}

const full = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });
const compact = new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 });

/**
 * Vendas por semana: uma coluna por semana, numa cor só (é uma série única).
 * O número em destaque acompanha a coluna apontada (mouse, toque ou teclado);
 * sem apontar nenhuma, mostra a semana mais recente. "Ver tabela" mostra os
 * mesmos números em lista.
 */
export function WeekChart({ points, unit, today, emptyText }: WeekChartProps) {
  const [active, setActive] = useState<number | null>(null);
  const [asTable, setAsTable] = useState(false);

  const scale = niceScale(Math.max(0, ...points.map((point) => point.value)));
  // um estilo só por eixo: por extenso até 10 mil, abreviado dali em diante
  const tick = (value: number) => (scale.max >= 10_000 ? compact.format(value) : full.format(value));
  const index = active !== null && active < points.length ? active : points.length - 1;
  const shown = points[index];
  const labelEvery = Math.max(1, Math.ceil(points.length / 6));
  const empty = points.every((point) => point.value === 0);

  return (
    <figure aria-label="Vendas por semana">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0" aria-live="polite">
          <p className="text-2xl font-semibold tracking-tight">{formatIn(shown?.value ?? 0, unit)}</p>
          <p className="text-sm text-muted">
            {shown ? `${weekAgo(shown.week, today)} · ${weekLabel(shown.week, today)}` : "—"}
            {shown && shown.totals.entries > 0 ? ` · ${plural(shown.totals.entries, "lançamento", "lançamentos")}` : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setAsTable((value) => !value)}
          aria-pressed={asTable}
          className="shrink-0 rounded-lg px-2.5 py-1.5 text-sm font-medium text-muted transition-colors hover:bg-surface-2 hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {asTable ? "Ver gráfico" : "Ver tabela"}
        </button>
      </div>

      {asTable ? (
        <div className="mt-3 max-h-72 overflow-y-auto rounded-xl border border-line">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-surface-2 text-left text-xs text-muted">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">
                  Semana
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  Vendas
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {[...points].reverse().map((point) => (
                <tr key={point.week}>
                  <td className="px-3 py-2">{weekLabel(point.week, today)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatIn(point.value, unit)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-[auto_minmax(0,1fr)] gap-x-2 pr-2">
          {/* eixo vertical: cada rótulo fica centrado na sua linha */}
          <div className="flex h-44 flex-col-reverse justify-between text-[11px] tabular-nums text-muted" aria-hidden>
            {scale.ticks.map((value) => (
              <span key={value} className="flex h-0 items-center justify-end whitespace-nowrap">
                {tick(value)}
              </span>
            ))}
          </div>

          <div className="relative h-44" onPointerLeave={() => setActive(null)}>
            {scale.ticks.map((value) => (
              <div
                key={value}
                className={cn("absolute inset-x-0 border-t", value === 0 ? "border-line-strong" : "border-line")}
                style={{ bottom: `${(value / scale.max) * 100}%` }}
                aria-hidden
              />
            ))}
            <div className="absolute inset-0 flex items-end">
              {points.map((point, i) => (
                <button
                  key={point.week}
                  type="button"
                  aria-label={`Semana de ${weekLabel(point.week, today)}: ${formatIn(point.value, unit)}`}
                  onPointerEnter={() => setActive(i)}
                  onFocus={() => setActive(i)}
                  onBlur={() => setActive(null)}
                  onClick={() => setActive(i)}
                  className="group flex h-full min-w-0 flex-1 items-end justify-center px-px outline-none"
                >
                  <span
                    className={cn(
                      "block w-full max-w-6 rounded-t-[4px] bg-primary transition-opacity",
                      "group-focus-visible:outline-2 group-focus-visible:outline-offset-2 group-focus-visible:outline-ring",
                      active !== null && active !== i && "opacity-45",
                    )}
                    style={{ height: `${(point.value / scale.max) * 100}%`, minHeight: point.value > 0 ? 2 : 0 }}
                  />
                </button>
              ))}
            </div>
            {empty ? (
              <p className="absolute inset-0 flex items-center justify-center px-4 text-center text-sm text-muted">
                {emptyText ?? "Nenhuma venda lançada neste período."}
              </p>
            ) : null}
          </div>

          {/* eixo horizontal: a segunda-feira de algumas semanas (sempre a mais recente) */}
          <span aria-hidden />
          <div className="mt-1.5 flex text-[11px] tabular-nums text-muted" aria-hidden>
            {points.map((point, i) => (
              <span key={point.week} className="flex min-w-0 flex-1 justify-center">
                {(points.length - 1 - i) % labelEvery === 0 ? <span className="whitespace-nowrap">{weekTick(point.week)}</span> : null}
              </span>
            ))}
          </div>
        </div>
      )}
    </figure>
  );
}
