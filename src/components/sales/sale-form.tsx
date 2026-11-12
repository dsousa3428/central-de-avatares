"use client";

import { useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import { clean, formatMoney, parseCount, parseDecimal, parseRate } from "@/lib/format";
import { CURRENCIES } from "@/lib/reference";
import { accountForWeek, defaultCurrency, formatAmount, formatRate, weekLabel, weekStart } from "@/lib/sales";
import { deleteSale, saleOf, saveSale } from "@/lib/sales-actions";
import { accountsOf, generationLabel } from "@/lib/selectors";
import { useStore, type Db } from "@/lib/store";
import type { Avatar } from "@/lib/types";
import { todayISO } from "@/lib/dates";
import { invalid } from "@/components/common/validation";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { FormModal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { useRates } from "./use-rates";
import { WeekNav } from "./week-nav";

interface SaleFormProps {
  avatar: Avatar;
  /** A semana que abre no formulário (segunda-feira). */
  week: string;
  /** Deixa trocar de semana dentro do formulário (ao lançar pela página do avatar). */
  pickWeek?: boolean;
  onClose: () => void;
}

interface Values {
  amount: string;
  currency: string;
  /** A cotação para reais guardada neste lançamento; em branco = a atual da moeda. */
  rate: string;
  count: string;
  accountId: string;
  notes: string;
}

/** O que aparece no formulário para um avatar numa semana: o lançamento que existe, ou um em branco. */
function valuesFor(db: Db, avatar: Avatar, week: string): Values {
  const sale = saleOf(db.sales, avatar.id, week);
  const country = db.countries.find((c) => c.id === avatar.country_id);
  const mine = db.sales.filter((s) => s.avatar_id === avatar.id);
  return {
    amount: sale ? formatAmount(Number(sale.amount)) : "",
    currency: sale?.currency ?? defaultCurrency(mine, avatar.product_currency, country?.currency),
    rate: sale && sale.brl_rate !== null ? formatRate(Number(sale.brl_rate)) : "",
    count: sale?.sales_count !== null && sale?.sales_count !== undefined ? String(sale.sales_count) : "",
    accountId: sale ? (sale.account_id ?? "") : (accountForWeek(accountsOf(db, avatar.id), week)?.id ?? ""),
    notes: sale?.notes ?? "",
  };
}

/** Lança ou corrige a venda de um avatar numa semana, com todos os detalhes. */
export function SaleForm({ avatar, week: initialWeek, pickWeek, onClose }: SaleFormProps) {
  const db = useStore();
  const rates = useRates();
  const toast = useToast();
  const confirm = useConfirm();
  const today = todayISO();
  const [week, setWeek] = useState(initialWeek);
  const [values, setValues] = useState<Values>(() => valuesFor(db, avatar, initialWeek));
  // o que foi digitado para uma semana ainda sem lançamento (acompanha a troca de semana)
  const fresh = useRef<Values | null>(null);

  const sale = saleOf(db.sales, avatar.id, week);
  const accounts = accountsOf(db, avatar.id);
  const amount = parseDecimal(values.amount);
  const foreign = values.currency !== "BRL";
  // a cotação deste lançamento: a digitada aqui; em branco, a atual da moeda (se houver)
  const currentRate = rates[values.currency] ?? null;
  const typedRate = values.rate.trim() ? parseRate(values.rate) : null;
  const rate = values.rate.trim() ? typedRate : currentRate;

  function set<K extends keyof Values>(key: K, value: Values[K]) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  function changeCurrency(currency: string) {
    // a cotação guardada era da outra moeda: volta para "a atual"
    setValues((current) => ({ ...current, currency, rate: "" }));
  }

  function changeWeek(next: string) {
    // Cada semana tem o seu lançamento: indo para uma semana já lançada, a janela mostra o
    // que está lançado nela. Mas o que foi digitado para uma semana ainda em branco não se
    // perde — acompanha a troca para outra semana em branco (quem errou a semana só troca).
    if (!sale) fresh.current = values;
    const there = valuesFor(db, avatar, next);
    const typed = fresh.current;
    setWeek(next);
    setValues(saleOf(db.sales, avatar.id, next) || !typed ? there : { ...typed, accountId: there.accountId });
  }

  async function submit() {
    if (week > weekStart(today)) invalid("Ainda não dá para lançar uma semana que não começou.");
    if (amount === null || amount < 0) invalid("Informe o valor vendido na semana. Exemplos: 150 ou 1.234,50.");
    if (amount > 9_999_999_999) invalid("Esse valor é grande demais. Confira os números.");
    const count = values.count.trim() ? parseCount(values.count) : null;
    if (values.count.trim() && count === null) invalid("Não entendi a quantidade de vendas. Exemplo: 12.");
    if (foreign && values.rate.trim() && (typedRate === null || typedRate <= 0 || typedRate > 1_000_000)) {
      invalid(`Não entendi a cotação. Exemplo: 6,10 (quantos reais vale 1 ${values.currency}).`);
    }
    await saveSale(avatar, week, {
      amount,
      currency: values.currency,
      sales_count: count,
      notes: clean(values.notes),
      account_id: values.accountId || null,
      brl_rate: foreign ? rate : null,
    });
    toast.success(sale ? "Venda atualizada" : "Venda lançada");
  }

  async function remove() {
    if (!sale) return;
    const ok = await confirm({
      title: "Apagar este lançamento?",
      message: `A venda de ${avatar.name} na semana de ${weekLabel(week, today)} sai dos totais. Esta ação não pode ser desfeita.`,
      confirmLabel: "Apagar",
      tone: "danger",
    });
    if (!ok) return;
    try {
      await deleteSale(sale);
      toast.success("Lançamento apagado");
      onClose();
    } catch (err) {
      toast.error(err);
    }
  }

  const known = CURRENCIES.some((c) => c.code === values.currency);

  return (
    <FormModal
      title={sale ? "Venda da semana" : "Lançar venda"}
      description={pickWeek ? avatar.name : `${avatar.name} · semana de ${weekLabel(week, today)}`}
      onClose={onClose}
      onSubmit={submit}
      extraActions={
        sale ? (
          <Button variant="danger-ghost" onClick={() => void remove()} className="md:mr-auto">
            <Trash2 className="size-4" /> Apagar
          </Button>
        ) : null
      }
    >
      {pickWeek ? (
        <div className="rounded-xl border border-line bg-surface-2/60 px-2 py-2">
          <WeekNav week={week} onChange={changeWeek} today={today} />
        </div>
      ) : null}

      <div className="grid grid-cols-[1fr_7.5rem] gap-3">
        <Field label="Valor vendido na semana">
          <Input
            value={values.amount}
            onChange={(e) => set("amount", e.target.value)}
            inputMode="decimal"
            autoComplete="off"
            placeholder="0,00"
            autoFocus
          />
        </Field>
        <Field label="Moeda">
          <Select value={values.currency} onChange={(e) => changeCurrency(e.target.value)}>
            {known ? null : <option value={values.currency}>{values.currency}</option>}
            {CURRENCIES.map((currency) => (
              <option key={currency.code} value={currency.code}>
                {currency.code}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      {foreign ? (
        <Field
          label={`Cotação: 1 ${values.currency} em reais`}
          optional
          hint={
            rate !== null && rate > 0 && amount !== null && amount > 0
              ? `≈ ${formatMoney(amount * rate, "BRL")} nesta semana.${values.rate.trim() ? "" : " Em branco, vale a cotação atual."}`
              : currentRate !== null
                ? "Em branco, vale a cotação atual (a de Vendas → Cotações)."
                : "Sem cotação, esta venda fica fora dos totais em reais. Você também pode digitar em Vendas → Cotações."
          }
        >
          <Input
            value={values.rate}
            onChange={(e) => set("rate", e.target.value)}
            inputMode="decimal"
            autoComplete="off"
            placeholder={currentRate !== null ? formatRate(currentRate) : "sem cotação"}
          />
        </Field>
      ) : null}

      <Field label="Quantidade de vendas" optional>
        <Input value={values.count} onChange={(e) => set("count", e.target.value)} inputMode="numeric" autoComplete="off" />
      </Field>

      <Field label="Conta que estava no ar" optional hint="O painel sugere pela data; mude se foi outra.">
        <Select value={values.accountId} onChange={(e) => set("accountId", e.target.value)}>
          <option value="">— Não informar —</option>
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>
              @{account.handle} · {generationLabel(account.generation)}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Observação" optional>
        <Textarea value={values.notes} onChange={(e) => set("notes", e.target.value)} rows={2} />
      </Field>
    </FormModal>
  );
}
