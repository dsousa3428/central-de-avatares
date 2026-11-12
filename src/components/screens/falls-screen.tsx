"use client";

import { useMemo } from "react";
import Link from "next/link";
import { ChevronRight, ShieldCheck } from "lucide-react";
import { formatDate, formatDuration, todayISO } from "@/lib/dates";
import { fallStats, type FallGroup } from "@/lib/falls";
import { plural } from "@/lib/format";
import { generationLabel } from "@/lib/selectors";
import { useStore } from "@/lib/store";
import { ExamplesNotice } from "@/components/common/examples-notice";
import { RankedList, type RankedRow } from "@/components/common/ranked-list";
import { PageHeader } from "@/components/shell/page-header";
import { ExampleBadge } from "@/components/ui/badge";
import { Card, EmptyState, Section } from "@/components/ui/card";

/** Quanto tempo as contas duraram: no geral, por país e por motivo da queda. */
export function FallsScreen() {
  const db = useStore();
  const today = todayISO();
  const stats = useMemo(() => fallStats(db, today), [db, today]);

  const header = (
    <>
      <PageHeader title="Quedas" subtitle="Quanto tempo as contas duraram, por país e por motivo." />
      <ExamplesNotice />
    </>
  );

  if (stats.rows.length === 0) {
    return (
      <>
        {header}
        <Card>
          <EmptyState icon={<ShieldCheck />} title="Nenhuma conta caiu até agora">
            Quando uma conta cair, aqui aparece quanto tempo ela durou, em que país e por qual motivo.
          </EmptyState>
        </Card>
      </>
    );
  }

  const dated = stats.rows.filter((row) => row.days !== null).length;

  return (
    <>
      {header}
      <div className="space-y-4">
        <ul className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <li>
            <StatTile
              label="Contas que caíram"
              value={String(stats.rows.length)}
              note={`de ${plural(db.accounts.length, "conta cadastrada", "contas cadastradas")}`}
            />
          </li>
          <li>
            <StatTile
              label="Últimos 30 dias"
              value={String(stats.recent)}
              note={stats.recent === 1 ? "queda" : "quedas"}
            />
          </li>
          <li className="col-span-2 md:col-span-1">
            <StatTile
              label="Tempo médio de vida"
              value={stats.averageDays === null ? "—" : formatDuration(stats.averageDays)}
              note={
                stats.shortestDays === null || stats.longestDays === null
                  ? "Faltam as datas de criação e de queda."
                  : dated === 1
                    ? "da criação até a queda"
                    : `da mais curta (${formatDuration(stats.shortestDays)}) à mais longa (${formatDuration(stats.longestDays)})`
              }
            />
          </li>
        </ul>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Section title="Tempo médio de vida por país" subtitle="Onde as contas duram mais, e onde duram menos.">
            <RankedList rows={toRows(stats.byCountry)} ariaLabel="Tempo médio de vida das contas por país" />
          </Section>
          <Section title="Tempo médio de vida por motivo" subtitle="Quanto as contas duraram até cair por cada motivo.">
            <RankedList rows={toRows(stats.byReason)} ariaLabel="Tempo médio de vida das contas por motivo da queda" />
          </Section>
        </div>

        <Section title="Contas que caíram" subtitle="Da queda mais recente para a mais antiga." flush>
          <ul className="divide-y divide-line border-t border-line">
            {stats.rows.map(({ account, avatar, country, days, reason }) => {
              const body = (
                <>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="font-medium">
                        {country?.flag ? `${country.flag} ` : ""}
                        {avatar?.name ?? "Avatar apagado"}
                      </span>
                      {account.is_example ? <ExampleBadge /> : null}
                    </span>
                    <span className="mt-0.5 block text-sm text-muted">
                      @{account.handle} · {generationLabel(account.generation)}
                    </span>
                    <span className="mt-0.5 block text-sm leading-relaxed">
                      {days === null ? "Sem as datas para calcular" : `Viveu ${formatDuration(days)}`}
                      {account.fell_on ? ` · caiu em ${formatDate(account.fell_on)}` : ""}
                    </span>
                    <span className="block text-sm leading-relaxed text-muted">{reason}</span>
                  </span>
                  {avatar ? <ChevronRight className="mt-1 size-4 shrink-0 text-muted" aria-hidden /> : null}
                </>
              );
              return (
                <li key={account.id}>
                  {avatar ? (
                    <Link
                      href={`/avatar?id=${avatar.id}&aba=historico`}
                      className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-surface-2/60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring md:px-5"
                    >
                      {body}
                    </Link>
                  ) : (
                    <div className="flex items-start gap-3 px-4 py-3 md:px-5">{body}</div>
                  )}
                </li>
              );
            })}
          </ul>
        </Section>
      </div>
    </>
  );
}

/**
 * As linhas do ranking: a barra é o tempo médio de vida (do maior para o menor) e o
 * texto de baixo diz de quantas contas é a média. Grupo sem datas fica no fim, sem barra.
 */
function toRows(groups: FallGroup[]): RankedRow[] {
  return [...groups]
    .sort((a, b) => (b.averageDays ?? -1) - (a.averageDays ?? -1))
    .map((group) => ({
      key: group.key || "sem",
      name: group.label,
      value: group.averageDays ?? 0,
      primary: group.averageDays === null ? "—" : formatDuration(group.averageDays),
      secondary: plural(group.count, "conta", "contas"),
    }));
}

/** Um número de destaque: rótulo, valor e uma linha de apoio. */
function StatTile({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <Card className="h-full p-4">
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-1 text-xl font-semibold tracking-tight md:text-2xl">{value}</p>
      {note ? <p className="mt-0.5 text-xs leading-relaxed text-muted">{note}</p> : null}
    </Card>
  );
}
