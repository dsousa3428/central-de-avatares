"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { Check, Ellipsis, TrendingUp } from "lucide-react";
import { AppError } from "@/lib/errors";
import { formatMoney, parseDecimal, plural } from "@/lib/format";
import {
  currencySymbol,
  defaultCurrency,
  describeTotals,
  formatAmount,
  inBRL,
  salesOfWeek,
  sumSales,
  type Rates,
} from "@/lib/sales";
import { saleOf, saveSale } from "@/lib/sales-actions";
import { useStore } from "@/lib/store";
import type { Avatar, Country, WeeklySale } from "@/lib/types";
import { AvatarPhoto } from "@/components/ui/avatar-photo";
import { ExampleBadge } from "@/components/ui/badge";
import { Button, buttonClass } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { SaleForm } from "./sale-form";
import { useRates } from "./use-rates";

interface WeekEntriesProps {
  /** A semana em lançamento (segunda-feira). */
  week: string;
}

/**
 * Lançamento rápido: uma linha por avatar com um campo para o valor da semana.
 * Digitou, apertou Enter (ou saiu do campo), está lançado — e o Enter já leva
 * para o avatar de baixo.
 */
export function WeekEntries({ week }: WeekEntriesProps) {
  const db = useStore();
  const rates = useRates();
  const [details, setDetails] = useState<Avatar | null>(null);

  const weekSales = salesOfWeek(db.sales, week);
  const countries = new Map(db.countries.map((country) => [country.id, country]));
  // avatares ativos, mais qualquer um que já tenha lançamento nesta semana; na ordem dos países
  const rows = db.avatars
    .filter((avatar) => avatar.status === "ativo" || weekSales.some((sale) => sale.avatar_id === avatar.id))
    .map((avatar) => ({ avatar, country: countries.get(avatar.country_id) }))
    .sort(
      (a, b) =>
        (a.country?.position ?? 0) - (b.country?.position ?? 0) ||
        (a.country?.name ?? "").localeCompare(b.country?.name ?? "", "pt-BR") ||
        a.avatar.position - b.avatar.position ||
        a.avatar.name.localeCompare(b.avatar.name, "pt-BR"),
    );

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={<TrendingUp />}
        title="Nenhum avatar ativo"
        action={
          <Link href="/paises" className={buttonClass("primary")}>
            Ver países e avatares
          </Link>
        }
      >
        Cadastre um avatar para lançar as vendas dele por semana.
      </EmptyState>
    );
  }

  const total = describeTotals(sumSales(weekSales, rates));
  const launched = rows.filter((row) => saleOf(weekSales, row.avatar.id, week)).length;

  return (
    <>
      <ul className="divide-y divide-line">
        {rows.map(({ avatar, country }) => (
          <EntryRow
            // (a semana na chave: trocar de semana recomeça o campo, sem levar um valor digitado para outra)
            key={`${avatar.id}:${week}`}
            avatar={avatar}
            country={country}
            week={week}
            sale={saleOf(weekSales, avatar.id, week)}
            currency={defaultCurrency(
              db.sales.filter((sale) => sale.avatar_id === avatar.id),
              avatar.product_currency,
              country?.currency,
            )}
            rates={rates}
            onDetails={() => setDetails(avatar)}
          />
        ))}
      </ul>
      <div className="mt-3 flex items-baseline justify-between gap-3 border-t border-line pt-3">
        <p className="shrink-0 text-sm text-muted">
          {launched === rows.length
            ? "Todos lançados"
            : `${launched} de ${plural(rows.length, "avatar lançado", "avatares lançados")}`}
        </p>
        <p className="min-w-0 text-right">
          <span className="text-[15px] font-semibold tabular-nums">{total.primary}</span>
          {total.secondary ? <span className="block text-xs text-muted">{total.secondary}</span> : null}
        </p>
      </div>
      {details ? <SaleForm avatar={details} week={week} onClose={() => setDetails(null)} /> : null}
    </>
  );
}

interface EntryRowProps {
  avatar: Avatar;
  country: Country | undefined;
  week: string;
  sale: WeeklySale | undefined;
  /** A moeda de um lançamento novo deste avatar. */
  currency: string;
  rates: Rates;
  onDetails: () => void;
}

function EntryRow({ avatar, country, week, sale, currency, rates, onDetails }: EntryRowProps) {
  const toast = useToast();
  // null = mostrando o valor que está salvo; texto = o que está sendo digitado
  const [draft, setDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);

  const code = sale?.currency ?? currency;
  const text = draft ?? (sale ? formatAmount(Number(sale.amount)) : "");
  const converted = sale && code !== "BRL" ? inBRL(sale, rates) : null;
  const note = sale
    ? [
        sale.sales_count ? plural(sale.sales_count, "venda", "vendas") : null,
        converted !== null ? `≈ ${formatMoney(converted, "BRL")}` : null,
      ]
        .filter(Boolean)
        .join(" · ") || "lançado"
    : "sem lançamento";

  async function commit(): Promise<boolean> {
    if (draft === null || busy.current) return true;
    const raw = draft.trim();
    if (raw === "") {
      setDraft(null); // campo vazio: volta o valor salvo (para apagar um lançamento, use os detalhes)
      return true;
    }
    const amount = parseDecimal(raw);
    if (amount === null || amount < 0 || amount > 9_999_999_999) {
      toast.error("Não entendi o valor. Exemplos: 150 ou 1.234,50.");
      return false;
    }
    if (sale && Number(sale.amount) === amount) {
      setDraft(null);
      return true;
    }
    busy.current = true;
    setSaving(true);
    try {
      await saveSale(avatar, week, { amount, currency: code });
      setDraft(null);
      return true;
    } catch (err) {
      toast.error(err);
      // "já lançado em outro aparelho": o campo volta a mostrar o que está valendo de fato
      if (err instanceof AppError && err.kind === "conflict") setDraft(null);
      return false;
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      // lança e já leva o cursor para o avatar de baixo
      const next = event.currentTarget.closest("li")?.nextElementSibling?.querySelector<HTMLInputElement>("input");
      const input = event.currentTarget;
      void commit().then((ok) => {
        if (!ok) return;
        if (next) next.focus();
        else input.blur();
      });
    } else if (event.key === "Escape") {
      setDraft(null);
      event.currentTarget.blur();
    }
  }

  return (
    <li className="flex items-center gap-3 py-2.5">
      <AvatarPhoto name={avatar.name} url={avatar.photo_url} size="sm" className="hidden sm:flex" />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 truncate text-[15px] font-medium">
          <span className="truncate">
            {country?.flag ? `${country.flag} ` : ""}
            {avatar.name}
          </span>
          {sale?.is_example ? <ExampleBadge /> : null}
        </p>
        <p className="flex items-center gap-1 truncate text-xs text-muted">
          {saving ? (
            <Spinner className="size-3" />
          ) : sale && draft === null ? (
            <Check className="size-3.5 shrink-0 text-emerald-500" strokeWidth={3} aria-hidden />
          ) : null}
          <span className="truncate">{saving ? "salvando…" : note}</span>
        </p>
      </div>
      <span className="relative block w-[7.5rem] shrink-0">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted">
          {currencySymbol(code)}
        </span>
        <input
          value={text}
          onChange={(e) => setDraft(e.target.value)}
          onFocus={(e) => e.currentTarget.select()}
          onBlur={() => void commit()}
          onKeyDown={onKeyDown}
          inputMode="decimal"
          autoComplete="off"
          placeholder="0,00"
          enterKeyHint="next"
          aria-label={`Vendas de ${avatar.name} na semana`}
          className="h-10 w-full rounded-xl border border-line-strong bg-surface pl-11 pr-3 text-right text-base tabular-nums text-fg shadow-card outline-none transition-colors placeholder:text-muted/70 focus:border-primary focus:ring-2 focus:ring-ring/25 md:text-[15px]"
        />
      </span>
      <Button size="sm" variant="ghost" iconOnly aria-label={`Detalhes da venda de ${avatar.name}`} onClick={onDetails}>
        <Ellipsis className="size-4 text-muted" />
      </Button>
    </li>
  );
}
