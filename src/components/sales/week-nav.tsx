"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { addWeeks, weekAgo, weekLabel, weekStart } from "@/lib/sales";
import { Button } from "@/components/ui/button";

interface WeekNavProps {
  week: string;
  onChange: (week: string) => void;
  today: string;
}

/** Escolhe a semana: setas para voltar e avançar (não passa da semana atual). */
export function WeekNav({ week, onChange, today }: WeekNavProps) {
  const current = weekStart(today);
  return (
    <div className="flex items-center gap-1">
      <Button size="sm" variant="ghost" iconOnly aria-label="Semana anterior" onClick={() => onChange(addWeeks(week, -1))}>
        <ChevronLeft className="size-5" />
      </Button>
      <div className="min-w-0 flex-1 text-center" aria-live="polite">
        <p className="text-[15px] font-semibold leading-tight">{weekAgo(week, today)}</p>
        <p className="text-xs text-muted">{weekLabel(week, today)}</p>
      </div>
      <Button
        size="sm"
        variant="ghost"
        iconOnly
        aria-label="Próxima semana"
        disabled={week >= current}
        onClick={() => onChange(addWeeks(week, 1))}
      >
        <ChevronRight className="size-5" />
      </Button>
    </div>
  );
}
