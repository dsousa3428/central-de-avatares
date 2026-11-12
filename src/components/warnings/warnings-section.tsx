"use client";

import { useState } from "react";
import Link from "next/link";
import {
  CalendarCheck,
  CalendarOff,
  ChevronRight,
  Flame,
  Hammer,
  ListChecks,
  TrendingUp,
  TriangleAlert,
  Undo2,
  UserRoundX,
  X,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/format";
import { dismissWarnings, restoreWarnings } from "@/lib/warning-actions";
import type { Warning, WarningKind, WarningLevel } from "@/lib/warnings";
import { Button } from "@/components/ui/button";
import { Card, Section } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";

const ICONS: Record<WarningKind, LucideIcon> = {
  recurso_duplicado: TriangleAlert,
  recurso_de_caida: TriangleAlert,
  avatar_sem_conta: UserRoundX,
  aquecimento_atrasado: Flame,
  sem_calendario: CalendarOff,
  semana_sem_vendas: TrendingUp,
  pronta: CalendarCheck,
  estrutura_pendente: Hammer,
  reposicao_pendente: ListChecks,
};

const TONES: Record<WarningLevel, string> = {
  danger: "text-red-500",
  warn: "text-amber-500",
  info: "text-primary",
  good: "text-emerald-500",
};

/** Quantos avisos aparecem antes do "Ver todos". */
const SHOWN = 4;

interface WarningsSectionProps {
  active: Warning[];
  dismissed: Warning[];
}

/**
 * A lista central de avisos (tela Hoje). Cada aviso leva para onde se resolve e
 * pode ser dispensado — ele volta sozinho se a situação mudar, e os dispensados
 * continuam à mão no fim da lista.
 */
export function WarningsSection({ active, dismissed }: WarningsSectionProps) {
  const toast = useToast();
  const [expanded, setExpanded] = useState(false);
  const [showDismissed, setShowDismissed] = useState(false);
  // o aviso que está sendo dispensado ou trazido de volta (ignora outros toques até terminar)
  const [busy, setBusy] = useState<string | null>(null);

  if (active.length === 0 && dismissed.length === 0) return null;

  const visible = expanded ? active : active.slice(0, SHOWN);
  const hidden = active.length - visible.length;

  async function change(warning: Warning, action: "dismiss" | "restore") {
    if (busy) return;
    setBusy(warning.id);
    try {
      if (action === "dismiss") await dismissWarnings([warning.id]);
      else await restoreWarnings([warning.id]);
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(null);
    }
  }

  const dismissedToggle =
    dismissed.length > 0 ? (
      <button
        type="button"
        onClick={() => setShowDismissed((value) => !value)}
        aria-expanded={showDismissed}
        className="rounded-md text-sm font-medium text-muted underline-offset-2 hover:text-fg hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        {dismissed.length === 1 ? "1 aviso dispensado" : `${dismissed.length} avisos dispensados`} ·{" "}
        {showDismissed ? "esconder" : "mostrar"}
      </button>
    ) : null;

  const dismissedList = showDismissed ? (
    <ul className="mt-1 divide-y divide-line" aria-label="Avisos dispensados">
      {dismissed.map((warning) => (
        <li key={warning.id} className="flex items-start gap-2 py-2.5 opacity-80">
          <WarningBody warning={warning} muted />
          <Button
            size="sm"
            variant="ghost"
            iconOnly
            aria-label={`Voltar a avisar: ${warning.title}`}
            title="Voltar a avisar"
            disabled={busy !== null}
            onClick={() => void change(warning, "restore")}
          >
            <Undo2 className="size-4 text-muted" />
          </Button>
        </li>
      ))}
    </ul>
  ) : null;

  // sem nada em aberto: só uma linha discreta, com os dispensados à mão
  if (active.length === 0) {
    return (
      <div className="px-1">
        <p className="text-sm text-muted">Nenhum aviso em aberto. {dismissedToggle}</p>
        {showDismissed ? <Card className="mt-2 px-4 py-1 md:px-5">{dismissedList}</Card> : null}
      </div>
    );
  }

  return (
    <Section
      title="Avisos"
      subtitle={active.length === 1 ? "1 ponto que pede a sua atenção." : `${active.length} pontos que pedem a sua atenção.`}
    >
      <ul className="divide-y divide-line" aria-label="Avisos em aberto">
        {visible.map((warning) => (
          <li key={warning.id} className="flex items-start gap-2 py-2.5">
            <WarningBody warning={warning} />
            <Button
              size="sm"
              variant="ghost"
              iconOnly
              aria-label={`Dispensar aviso: ${warning.title}`}
              title="Dispensar este aviso"
              disabled={busy !== null}
              onClick={() => void change(warning, "dismiss")}
            >
              <X className="size-4 text-muted" />
            </Button>
          </li>
        ))}
      </ul>
      {hidden > 0 || expanded || dismissedToggle ? (
        <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-line pt-3">
          {hidden > 0 || expanded ? (
            <button
              type="button"
              onClick={() => setExpanded((value) => !value)}
              aria-expanded={expanded}
              className="rounded-md text-sm font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              {expanded ? "Mostrar menos" : `Ver todos os ${active.length} avisos`}
            </button>
          ) : (
            <span />
          )}
          {dismissedToggle}
        </div>
      ) : null}
      {dismissedList}
    </Section>
  );
}

/** O miolo de um aviso: ícone, título, explicação e para onde ele leva. */
function WarningBody({ warning, muted }: { warning: Warning; muted?: boolean }) {
  const Icon = ICONS[warning.kind];
  return (
    <Link
      href={warning.href}
      className="flex min-w-0 flex-1 items-start gap-3 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      <Icon className={cn("mt-0.5 size-5 shrink-0", muted ? "text-muted" : TONES[warning.level])} aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block font-medium leading-snug">{warning.title}</span>
        <span className="mt-0.5 block text-sm leading-relaxed text-muted">{warning.text}</span>
        <span className="mt-1 inline-flex items-center gap-0.5 text-sm font-medium text-primary">
          {warning.action}
          <ChevronRight className="size-4" aria-hidden />
        </span>
      </span>
    </Link>
  );
}
