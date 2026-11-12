"use client";

import { useState } from "react";
import { formatMoney, parseDecimal } from "@/lib/format";
import { CURRENCIES } from "@/lib/reference";
import { type Rates } from "@/lib/sales";
import { saveRates } from "@/lib/sales-actions";
import { useStore } from "@/lib/store";
import { invalid } from "@/components/common/validation";
import { Input, Select } from "@/components/ui/field";
import { FormModal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { useRates } from "./use-rates";

function rateText(value: number | undefined): string {
  return value === undefined ? "" : String(value).replace(".", ",");
}

/** Cotações digitadas à mão: quantos reais vale 1 unidade de cada moeda. */
export function RatesForm({ onClose }: { onClose: () => void }) {
  const db = useStore();
  const rates = useRates();
  const toast = useToast();

  // as moedas que aparecem no painel (vendas, produtos, países) e as que já têm cotação
  const [codes, setCodes] = useState<string[]>(() => {
    const used = new Set<string>(Object.keys(rates));
    for (const sale of db.sales) used.add(sale.currency.toUpperCase());
    for (const avatar of db.avatars) if (avatar.product_currency) used.add(avatar.product_currency.toUpperCase());
    for (const country of db.countries) if (country.currency) used.add(country.currency.toUpperCase());
    used.delete("BRL");
    return [...used].sort();
  });
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(Object.entries(rates).map(([code, rate]) => [code, rateText(rate)])),
  );
  const others = CURRENCIES.filter((c) => c.code !== "BRL" && !codes.includes(c.code));

  async function submit() {
    const next: Rates = {};
    for (const code of codes) {
      const text = (values[code] ?? "").trim();
      if (!text) continue; // em branco = sem cotação
      const rate = parseDecimal(text);
      if (rate === null || rate <= 0 || rate > 1_000_000) invalid(`Não entendi a cotação de ${code}. Exemplo: 6,10.`);
      next[code] = rate;
    }
    await saveRates(next);
    toast.success("Cotações salvas");
  }

  return (
    <FormModal
      title="Cotações para reais"
      description="Quanto vale, em reais, 1 unidade de cada moeda. Serve para somar vendas de moedas diferentes."
      onClose={onClose}
      onSubmit={submit}
    >
      {codes.length === 0 ? (
        <p className="text-sm leading-relaxed text-muted">
          Nenhuma moeda estrangeira em uso ainda. Quando você lançar vendas em outra moeda, ela aparece aqui.
        </p>
      ) : (
        <ul className="space-y-2.5">
          {codes.map((code) => {
            const name = CURRENCIES.find((c) => c.code === code)?.name;
            const parsed = parseDecimal(values[code] ?? "");
            return (
              <li key={code} className="flex items-center gap-3">
                <label htmlFor={`cotacao-${code}`} className="min-w-0 flex-1 text-[15px]">
                  <span className="font-medium">1 {code}</span>
                  {name ? <span className="text-muted"> · {name}</span> : null}
                  <span className="block text-xs text-muted">
                    {parsed !== null && parsed > 0 ? `100 ${code} = ${formatMoney(parsed * 100, "BRL")}` : "sem cotação"}
                  </span>
                </label>
                <span className="relative block w-32 shrink-0">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted">R$</span>
                  <Input
                    id={`cotacao-${code}`}
                    value={values[code] ?? ""}
                    onChange={(e) => setValues((current) => ({ ...current, [code]: e.target.value }))}
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder="0,00"
                    className="pl-10 text-right tabular-nums"
                  />
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {others.length > 0 ? (
        <Select
          value=""
          onChange={(e) => {
            if (e.target.value) setCodes((current) => [...current, e.target.value].sort());
          }}
          aria-label="Acrescentar outra moeda"
        >
          <option value="">＋ Acrescentar outra moeda…</option>
          {others.map((currency) => (
            <option key={currency.code} value={currency.code}>
              {currency.code} · {currency.name}
            </option>
          ))}
        </Select>
      ) : null}

      <p className="text-xs leading-relaxed text-muted">
        Cada lançamento novo guarda a cotação do dia, para o total de uma semana antiga não mudar quando você
        atualizar a cotação. Lançamentos feitos sem cotação usam a que estiver aqui.
      </p>
    </FormModal>
  );
}
