"use client";

import { useState } from "react";
import { Plus, TrendingUp } from "lucide-react";
import { todayISO } from "@/lib/dates";
import { formatMoney, plural } from "@/lib/format";
import { describeTotals, inBRL, monthKey, monthName, salesOfMonth, sumSales, weekAgo, weekLabel, weekStart } from "@/lib/sales";
import { generationLabel } from "@/lib/selectors";
import { useStore } from "@/lib/store";
import type { Account, Avatar } from "@/lib/types";
import { SaleForm } from "@/components/sales/sale-form";
import { useRates } from "@/components/sales/use-rates";
import { ExampleBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, EmptyState, Section } from "@/components/ui/card";

interface SalesTabProps {
  avatar: Avatar;
  /** Todas as contas do avatar, da mais nova para a mais antiga. */
  accounts: Account[];
}

/** Aba "Vendas" do avatar: totais somando todas as contas e a lista de lançamentos por semana. */
export function SalesTab({ avatar, accounts }: SalesTabProps) {
  const db = useStore();
  const rates = useRates();
  const today = todayISO();
  const [form, setForm] = useState<{ week: string; pick: boolean } | null>(null);

  const sales = db.sales
    .filter((sale) => sale.avatar_id === avatar.id)
    .sort((a, b) => b.week_start.localeCompare(a.week_start));
  const launch = (
    <Button variant="primary" size="sm" onClick={() => setForm({ week: weekStart(today), pick: true })}>
      <Plus className="size-4" /> Lançar venda
    </Button>
  );
  const dialog = form ? (
    <SaleForm avatar={avatar} week={form.week} pickWeek={form.pick} onClose={() => setForm(null)} />
  ) : null;

  if (sales.length === 0) {
    return (
      <>
        <Card>
          <EmptyState icon={<TrendingUp />} title="Nenhuma venda lançada" action={launch}>
            Lance o valor vendido em cada semana. Os totais somam todas as contas (gerações) deste avatar.
          </EmptyState>
        </Card>
        {dialog}
      </>
    );
  }

  const total = describeTotals(sumSales(sales, rates));
  const monthTotals = sumSales(salesOfMonth(sales, monthKey(today)), rates);
  const month = describeTotals(monthTotals);
  const byAccount = accounts
    .map((account) => ({ account, totals: sumSales(sales.filter((sale) => sale.account_id === account.id), rates) }))
    .filter((row) => row.totals.entries > 0);

  return (
    <div className="space-y-4">
      <Section title="Vendas" subtitle="Somando todas as contas deste avatar." actions={launch}>
        <dl className="grid grid-cols-2 gap-4">
          <div>
            <dt className="text-sm text-muted">Total</dt>
            <dd className="mt-0.5 text-xl font-semibold tracking-tight">{total.primary}</dd>
            {total.secondary ? <dd className="text-xs text-muted">{total.secondary}</dd> : null}
            <dd className="text-xs text-muted">{plural(sales.length, "semana lançada", "semanas lançadas")}</dd>
          </div>
          <div>
            <dt className="text-sm text-muted">Em {monthName(monthKey(today))}</dt>
            <dd className="mt-0.5 text-xl font-semibold tracking-tight">{monthTotals.entries === 0 ? "—" : month.primary}</dd>
            {month.secondary ? <dd className="text-xs text-muted">{month.secondary}</dd> : null}
          </div>
        </dl>
        {byAccount.length > 1 ? (
          <ul className="mt-4 divide-y divide-line border-t border-line text-sm">
            {byAccount.map(({ account, totals }) => (
              <li key={account.id} className="flex items-baseline justify-between gap-3 py-2">
                <span className="min-w-0 truncate">
                  {generationLabel(account.generation)} <span className="text-muted">@{account.handle}</span>
                </span>
                <span className="shrink-0 font-medium tabular-nums">{describeTotals(totals).primary}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </Section>

      <Section title="Lançamentos por semana" subtitle="Toque num lançamento para corrigir." flush>
        <ul className="divide-y divide-line border-t border-line">
          {sales.map((sale) => {
            const account = accounts.find((a) => a.id === sale.account_id);
            const converted = sale.currency !== "BRL" ? inBRL(sale, rates) : null;
            const details = [
              account ? generationLabel(account.generation) : null,
              sale.sales_count ? plural(sale.sales_count, "venda", "vendas") : null,
            ].filter(Boolean);
            return (
              <li key={sale.id}>
                <button
                  type="button"
                  onClick={() => setForm({ week: sale.week_start, pick: false })}
                  aria-label={`Corrigir a venda da semana de ${weekLabel(sale.week_start, today)}`}
                  className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-2/60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring md:px-5"
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="text-[15px] font-medium">{weekLabel(sale.week_start, today)}</span>
                      <span className="text-xs text-muted">{weekAgo(sale.week_start, today).toLowerCase()}</span>
                      {sale.is_example ? <ExampleBadge /> : null}
                    </span>
                    {details.length > 0 ? <span className="block text-sm text-muted">{details.join(" · ")}</span> : null}
                    {sale.notes ? (
                      <span className="mt-0.5 block whitespace-pre-wrap text-sm leading-relaxed text-muted">{sale.notes}</span>
                    ) : null}
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block text-[15px] font-semibold tabular-nums">
                      {formatMoney(Number(sale.amount), sale.currency)}
                    </span>
                    {converted !== null ? (
                      <span className="block text-xs text-muted">≈ {formatMoney(converted, "BRL")}</span>
                    ) : null}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </Section>
      {dialog}
    </div>
  );
}
