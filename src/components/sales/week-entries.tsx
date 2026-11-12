"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { Check, Ellipsis, TrendingUp } from "lucide-react";
import { AppError } from "@/lib/errors";
import { cn, formatMoney, parseDecimal, plural } from "@/lib/format";
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
import { getStore, useStore } from "@/lib/store";
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
 * para o avatar de baixo, sem esperar a gravação (dá para digitar tudo em
 * sequência: valor, Enter, valor, Enter…).
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

const MAX_AMOUNT = 9_999_999_999;

/** O que está escrito no campo: nada, um valor, ou algo que não dá para entender. */
function readAmount(text: string): number | "empty" | "invalid" {
  const raw = text.trim();
  if (raw === "") return "empty";
  const amount = parseDecimal(raw);
  return amount === null || amount < 0 || amount > MAX_AMOUNT ? "invalid" : amount;
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
  // quantas gravações desta linha ainda não terminaram
  const [saving, setSaving] = useState(0);
  const [invalid, setInvalid] = useState(false);
  const [opening, setOpening] = useState(false);
  // O que está digitado, para uma gravação que termina mais tarde saber se o campo mudou nesse meio-tempo.
  const typed = useRef<string | null>(null);
  // A última gravação pedida que ainda não terminou: o texto que ela leva e como ela vai acabar.
  const last = useRef<{ text: string; done: Promise<boolean> } | null>(null);
  // O texto que já foi recusado com um aviso (para não repetir o mesmo aviso).
  const refused = useRef<string | null>(null);

  const code = sale?.currency ?? currency;
  const text = draft ?? (sale ? formatAmount(Number(sale.amount)) : "");
  const busy = saving > 0;
  const converted = sale && code !== "BRL" ? inBRL(sale, rates) : null;
  const note = sale
    ? [
        sale.sales_count ? plural(sale.sales_count, "venda", "vendas") : null,
        converted !== null ? `≈ ${formatMoney(converted, "BRL")}` : null,
      ]
        .filter(Boolean)
        .join(" · ") || "lançado"
    : "sem lançamento";

  function edit(value: string | null) {
    typed.current = value;
    refused.current = null;
    setDraft(value);
    setInvalid(false);
  }

  /**
   * Lança o que está no campo, sem esperar a gravação anterior: as gravações da
   * mesma semana entram em fila (`saveSale`), e o campo só volta a mostrar o valor
   * salvo se ninguém digitou outra coisa enquanto isso.
   * Devolve false se, no fim, algo ficou sem lançar.
   */
  function commit(): Promise<boolean> {
    const value = typed.current;
    const before = last.current?.done ?? Promise.resolve(true);
    if (value === null) return before;
    if (last.current?.text === value) return last.current.done; // este mesmo texto já está sendo gravado
    const amount = readAmount(value);
    if (amount === "empty") {
      edit(null); // campo vazio: volta o valor salvo (para apagar um lançamento, use os detalhes)
      return before;
    }
    if (amount === "invalid") {
      if (refused.current !== value) toast.error("Não entendi o valor. Exemplos: 150 ou 1.234,50.");
      refused.current = value;
      setInvalid(true);
      return Promise.resolve(false);
    }
    const current = saleOf(getStore().sales, avatar.id, week);
    if (!last.current && current && Number(current.amount) === amount) {
      edit(null);
      return Promise.resolve(true);
    }

    setSaving((count) => count + 1);
    const done: Promise<boolean> = saveSale(avatar, week, { amount, currency: current?.currency ?? currency })
      .then(
        () => {
          if (typed.current === value) edit(null);
          return true;
        },
        (err: unknown) => {
          toast.error(err);
          if (typed.current === value) {
            // "já lançado em outro aparelho": o campo volta a mostrar o que está valendo de fato
            if (err instanceof AppError && err.kind === "conflict") edit(null);
            else setInvalid(true); // não gravou: o valor continua no campo, marcado (Enter tenta de novo)
          }
          return false;
        },
      )
      .finally(() => {
        setSaving((count) => count - 1);
        if (last.current?.done === done) last.current = null;
      });
    last.current = { text: value, done };
    return done;
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      const input = event.currentTarget;
      if (typed.current !== null && readAmount(typed.current) === "invalid") {
        void commit(); // mostra o aviso; o cursor fica onde está
        return;
      }
      // O cursor desce na hora, sem esperar a gravação: sair do campo é o que lança.
      const next = input.closest("li")?.nextElementSibling?.querySelector<HTMLInputElement>("input");
      if (next) next.focus();
      else input.blur();
    } else if (event.key === "Escape") {
      edit(null);
      event.currentTarget.blur();
    }
  }

  async function openDetails() {
    if (opening) return;
    // Os detalhes só abrem depois que o que acabou de ser digitado foi lançado: a janela
    // nunca nasce com uma cópia velha (em branco, ou com o valor anterior).
    const done = commit();
    const waiting = last.current !== null;
    if (waiting) setOpening(true);
    const ok = await done;
    if (waiting) setOpening(false);
    if (ok) onDetails();
  }

  return (
    <li className="flex items-center gap-2 py-2.5 sm:gap-3">
      <AvatarPhoto name={avatar.name} url={avatar.photo_url} size="sm" className="hidden sm:flex" />
      <div className="min-w-0 flex-1">
        {/* o nome pode ocupar duas linhas: em tela estreita, cortá-lo deixaria avatares parecidos iguais */}
        <p className="line-clamp-2 text-[15px] font-medium leading-snug">
          {country?.flag ? `${country.flag} ` : ""}
          {avatar.name}
          {sale?.is_example ? (
            <>
              {" "}
              <ExampleBadge />
            </>
          ) : null}
        </p>
        <p className="flex items-center gap-1 truncate text-xs text-muted">
          {busy ? (
            <Spinner className="size-3" />
          ) : sale && draft === null ? (
            <Check className="size-3.5 shrink-0 text-emerald-500" strokeWidth={3} aria-hidden />
          ) : null}
          <span className="truncate">{busy ? "salvando…" : invalid ? "não lançado" : note}</span>
        </p>
      </div>
      {/* O símbolo da moeda fica ao lado do campo (e não por cima dele): o valor usa toda a largura que sobra. */}
      <label
        className={cn(
          "flex h-10 w-[8.5rem] shrink-0 cursor-text items-center gap-1.5 rounded-xl border bg-surface px-3 shadow-card transition-colors focus-within:ring-2",
          invalid
            ? "border-danger focus-within:ring-danger/25"
            : "border-line-strong focus-within:border-primary focus-within:ring-ring/25",
        )}
      >
        <span className="shrink-0 text-sm text-muted" aria-hidden>
          {currencySymbol(code)}
        </span>
        <input
          value={text}
          onChange={(e) => edit(e.target.value)}
          onFocus={(e) => e.currentTarget.select()}
          onBlur={() => void commit()}
          onKeyDown={onKeyDown}
          inputMode="decimal"
          autoComplete="off"
          placeholder="0,00"
          enterKeyHint="next"
          aria-label={`Vendas de ${avatar.name} na semana`}
          aria-invalid={invalid || undefined}
          className="w-full min-w-0 flex-1 bg-transparent text-right text-base tabular-nums text-fg outline-none placeholder:text-muted/70 md:text-[15px]"
        />
      </label>
      {/* (não fica desabilitado enquanto espera: assim o foco volta para ele quando a janela fecha) */}
      <Button
        size="sm"
        variant="ghost"
        iconOnly
        aria-busy={opening || undefined}
        aria-label={`Detalhes da venda de ${avatar.name}`}
        onClick={() => void openDetails()}
      >
        {opening ? <Spinner className="size-4" /> : <Ellipsis className="size-4 text-muted" />}
      </Button>
    </li>
  );
}
