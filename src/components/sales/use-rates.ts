"use client";

import { useMemo } from "react";
import { cleanRates, type Rates } from "@/lib/sales";
import { useStore } from "@/lib/store";

/** As cotações digitadas em Vendas → Cotações (quantos reais vale 1 unidade de cada moeda). */
export function useRates(): Rates {
  const db = useStore();
  const raw = db.settings?.brl_rates;
  return useMemo(() => cleanRates(raw), [raw]);
}
