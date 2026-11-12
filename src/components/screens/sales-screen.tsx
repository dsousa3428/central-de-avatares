"use client";

import { TrendingUp } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { Card, EmptyState } from "@/components/ui/card";

export function SalesScreen() {
  return (
    <>
      <PageHeader title="Vendas" subtitle="Lançamento semanal e totais por avatar, país e geral." />
      <Card>
        <EmptyState icon={<TrendingUp />} title="Chega na etapa (d)">
          Aqui você vai lançar as vendas de cada avatar por semana, ver os totais somando todas as gerações, o gráfico
          semanal, o ranking de avatares e a conversão para reais.
        </EmptyState>
      </Card>
    </>
  );
}
