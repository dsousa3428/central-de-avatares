"use client";

import { useMemo, useState } from "react";
import { Coins, TriangleAlert } from "lucide-react";
import { todayISO } from "@/lib/dates";
import { plural } from "@/lib/format";
import {
  addWeeks,
  amountIn,
  currentMonth,
  describeTotals,
  firstWeek,
  monthName,
  rank,
  salesOfMonth,
  salesOfWeek,
  salesSince,
  sumSales,
  unitFor,
  weeklySeries,
  weeksBetween,
  weekStart,
  type Rates,
  type Totals,
} from "@/lib/sales";
import { useStore } from "@/lib/store";
import type { WeeklySale } from "@/lib/types";
import { ExamplesNotice } from "@/components/common/examples-notice";
import { RankedList, type RankedRow } from "@/components/sales/ranked-list";
import { RatesForm } from "@/components/sales/rates-form";
import { useRates } from "@/components/sales/use-rates";
import { WeekChart } from "@/components/sales/week-chart";
import { WeekEntries } from "@/components/sales/week-entries";
import { WeekNav } from "@/components/sales/week-nav";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { Callout, Card, Section } from "@/components/ui/card";
import { Select } from "@/components/ui/field";

type Period = "12" | "26" | "52" | "all";

// `short` é o texto do seletor (cabe em meia tela do celular); `label` é o título por extenso.
const PERIODS: Array<{ value: Period; short: string; label: string }> = [
  { value: "12", short: "12 semanas", label: "Últimas 12 semanas" },
  { value: "26", short: "6 meses", label: "Últimos 6 meses" },
  { value: "52", short: "1 ano", label: "Último ano" },
  { value: "all", short: "Tudo", label: "Desde o início" },
];

/** O gráfico mostra no máximo este tanto de semanas (as mais recentes). */
const MAX_COLUMNS = 52;

export function SalesScreen() {
  const db = useStore();
  const rates = useRates();
  const today = todayISO();
  const thisWeek = weekStart(today);

  const [week, setWeek] = useState(thisWeek);
  const [period, setPeriod] = useState<Period>("12");
  const [pickedCountry, setPickedCountry] = useState("");
  const [editingRates, setEditingRates] = useState(false);
  // (esta tela fica guardada enquanto se usa as outras: um país apagado lá não pode continuar filtrando aqui)
  const countryId = db.countries.some((country) => country.id === pickedCountry) ? pickedCountry : "";
  const month = currentMonth(today);

  // Tudo que fica abaixo dos filtros usa o mesmo recorte: país escolhido + período.
  const view = useMemo(() => {
    const avatars = countryId ? db.avatars.filter((avatar) => avatar.country_id === countryId) : db.avatars;
    const ids = new Set(avatars.map((avatar) => avatar.id));
    const scoped = db.sales.filter((sale) => ids.has(sale.avatar_id));
    const from = period === "all" ? null : addWeeks(thisWeek, 1 - Number(period));
    const inPeriod = salesSince(scoped, from);
    const totals = sumSales(inPeriod, rates);
    const unit = unitFor(totals);

    const first = firstWeek(inPeriod);
    const span = first ? weeksBetween(first, thisWeek) + 1 : 12;
    const columns = period === "all" ? Math.min(MAX_COLUMNS, Math.max(12, span)) : Number(period);

    const byAvatar = (id: string) => inPeriod.filter((sale) => sale.avatar_id === id);
    const countries = countryId ? db.countries.filter((country) => country.id === countryId) : db.countries;
    return {
      avatars,
      totals,
      unit,
      truncated: period === "all" && span > MAX_COLUMNS,
      series: weeklySeries(inPeriod, rates, thisWeek, columns, unit),
      thisWeek: sumSales(salesOfWeek(scoped, thisWeek), rates),
      weekNote: weekDelta(salesOfWeek(scoped, thisWeek), salesOfWeek(scoped, addWeeks(thisWeek, -1)), rates),
      month: sumSales(salesOfMonth(scoped, month), rates),
      ranking: rank(avatars, (avatar) => byAvatar(avatar.id), rates, unit).filter((row) => row.totals.entries > 0),
      byCountry: rank(
        countries,
        (country) => inPeriod.filter((sale) => db.avatars.some((a) => a.id === sale.avatar_id && a.country_id === country.id)),
        rates,
        unit,
      ).filter((row) => row.totals.entries > 0),
    };
  }, [db.avatars, db.countries, db.sales, rates, countryId, period, thisWeek, month]);

  const flagOf = (id: string) => db.countries.find((country) => country.id === id)?.flag;
  const periodLabel = PERIODS.find((item) => item.value === period)?.label ?? "";
  const rankingRows: RankedRow[] = view.ranking.map(({ item, totals, value }) => {
    const text = describeTotals(totals);
    const flag = flagOf(item.country_id);
    return {
      key: item.id,
      name: `${flag ? `${flag} ` : ""}${item.name}`,
      href: `/avatar?id=${item.id}&aba=vendas`,
      value,
      primary: text.primary,
      secondary: text.secondary,
    };
  });
  const countryRows: RankedRow[] = view.byCountry.map(({ item, totals, value }) => {
    const text = describeTotals(totals);
    return {
      key: item.id,
      name: `${item.flag ? `${item.flag} ` : ""}${item.name}`,
      value,
      primary: text.primary,
      secondary: text.secondary,
    };
  });

  return (
    <>
      <PageHeader
        title="Vendas"
        subtitle="Lançamento por semana e totais por avatar, país e geral."
        actions={
          <Button size="sm" onClick={() => setEditingRates(true)}>
            <Coins className="size-4" /> Cotações
          </Button>
        }
      />
      <ExamplesNotice />

      <div className="space-y-4">
        <Section title="Lançar vendas" subtitle="Digite o valor da semana de cada avatar e aperte Enter.">
          <div className="mb-2 rounded-xl border border-line bg-surface-2/60 px-2 py-2">
            <WeekNav week={week} onChange={setWeek} today={today} />
          </div>
          <WeekEntries week={week} />
        </Section>

        {/* Filtros: uma linha só, acima de tudo que eles recortam */}
        <div className="flex flex-wrap gap-2">
          <span className="min-w-40 flex-1 sm:max-w-60">
            <Select value={period} onChange={(e) => setPeriod(e.target.value as Period)} aria-label="Período" className="h-10">
              {PERIODS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.short}
                </option>
              ))}
            </Select>
          </span>
          {db.countries.length > 1 ? (
            <span className="min-w-40 flex-1 sm:max-w-60">
              <Select value={countryId} onChange={(e) => setPickedCountry(e.target.value)} aria-label="País" className="h-10">
                <option value="">Todos os países</option>
                {db.countries.map((country) => (
                  <option key={country.id} value={country.id}>
                    {country.flag ? `${country.flag} ` : ""}
                    {country.name}
                  </option>
                ))}
              </Select>
            </span>
          ) : null}
        </div>

        {view.totals.missing.length > 0 ? (
          view.unit.partial ? (
            <Callout tone="warn" icon={<TriangleAlert />}>
              <p>
                Falta a cotação de <strong>{view.totals.missing.join(", ")}</strong> para somar tudo em reais. Por
                enquanto o gráfico e o ranking deixam essas vendas de fora.
              </p>
              <Button size="sm" className="mt-2" onClick={() => setEditingRates(true)}>
                Digitar cotação
              </Button>
            </Callout>
          ) : (
            <p className="px-1 text-sm text-muted">
              Para ver os totais também em reais,{" "}
              <button
                type="button"
                onClick={() => setEditingRates(true)}
                className="font-medium text-primary underline-offset-2 hover:underline"
              >
                digite a cotação de {view.totals.missing.join(", ")}
              </button>
              .
            </p>
          )
        ) : null}

        <ul className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <li>
            <StatTile label="Esta semana" totals={view.thisWeek} note={view.weekNote} />
          </li>
          <li>
            <StatTile
              label={capitalize(monthName(month, today))}
              totals={view.month}
              note={view.month.entries > 0 ? plural(view.month.entries, "lançamento", "lançamentos") : "nenhum lançamento"}
            />
          </li>
          <li className="col-span-2 md:col-span-1">
            <StatTile
              label={periodLabel}
              totals={view.totals}
              note={view.totals.units > 0 ? plural(view.totals.units, "venda", "vendas") : null}
            />
          </li>
        </ul>

        <Section title="Vendas por semana" subtitle={view.truncated ? "As 52 semanas mais recentes." : undefined}>
          <WeekChart
            points={view.series}
            unit={view.unit}
            today={today}
            emptyText={
              view.unit.partial && view.totals.entries > 0
                ? "As vendas deste período estão em moedas sem cotação. Digite as cotações para ver o gráfico."
                : undefined
            }
          />
        </Section>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Section title="Ranking de avatares" subtitle={`${periodLabel}, somando todas as contas de cada avatar.`}>
            {rankingRows.length === 0 ? (
              <p className="py-2 text-sm text-muted">Nenhuma venda lançada neste período.</p>
            ) : (
              <RankedList rows={rankingRows} ariaLabel="Ranking de avatares por vendas" />
            )}
          </Section>
          <Section title="Por país" subtitle={periodLabel}>
            {countryRows.length === 0 ? (
              <p className="py-2 text-sm text-muted">Nenhuma venda lançada neste período.</p>
            ) : (
              <RankedList rows={countryRows} ariaLabel="Vendas por país" />
            )}
          </Section>
        </div>
      </div>

      {editingRates ? <RatesForm onClose={() => setEditingRates(false)} /> : null}
    </>
  );
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * "+12% sobre a semana passada" — só quando as duas semanas dão para comparar na mesma moeda.
 * Semana ainda sem lançamento não é "−100%": é só uma semana que falta lançar.
 */
function weekDelta(current: WeeklySale[], previous: WeeklySale[], rates: Rates): string | null {
  if (current.length === 0) return "nenhum lançamento";
  if (previous.length === 0) return null;
  const unit = unitFor(sumSales([...current, ...previous], rates));
  if (unit.partial) return null;
  const before = amountIn(sumSales(previous, rates), unit);
  const now = amountIn(sumSales(current, rates), unit);
  if (before <= 0) return null;
  const change = Math.round(((now - before) / before) * 100);
  if (change === 0) return "igual à semana passada";
  return `${change > 0 ? "+" : "−"}${Math.abs(change)}% sobre a semana passada`;
}

/** Um número de destaque: rótulo, valor e uma linha de apoio. */
function StatTile({ label, totals, note }: { label: string; totals: Totals; note?: string | null }) {
  const text = describeTotals(totals);
  return (
    <Card className="h-full p-4">
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-1 text-xl font-semibold tracking-tight md:text-2xl">{totals.entries === 0 ? "—" : text.primary}</p>
      {text.secondary ? <p className="text-xs text-muted">{text.secondary}</p> : null}
      {note ? <p className="mt-0.5 text-xs text-muted">{note}</p> : null}
    </Card>
  );
}
