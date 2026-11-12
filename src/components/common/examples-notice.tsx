"use client";

import Link from "next/link";
import { Sparkles } from "lucide-react";
import { useStore } from "@/lib/store";
import { Callout } from "@/components/ui/card";

/** Lembrete de que há dados fictícios na tela, com atalho para apagá-los. */
export function ExamplesNotice() {
  const db = useStore();
  const hasExamples =
    db.countries.some((r) => r.is_example) ||
    db.avatars.some((r) => r.is_example) ||
    db.accounts.some((r) => r.is_example) ||
    db.sales.some((r) => r.is_example);
  if (!hasExamples) return null;
  return (
    <Callout icon={<Sparkles />} className="mb-4">
      Você está vendo <strong>dados de exemplo</strong> (fictícios), só para conhecer o painel.{" "}
      <Link href="/configuracoes#exemplos" className="font-semibold underline underline-offset-2">
        Apagar exemplos
      </Link>
    </Callout>
  );
}
