"use client";

import { useRef } from "react";
import { Check, Filter } from "lucide-react";
import { cn } from "@/lib/format";
import { readFunnels } from "@/lib/funnels";
import { updateRow } from "@/lib/store";
import { readStructure, setStructureDone, structureProgress, type StructureKey, type StructureStep } from "@/lib/structure";
import type { Avatar } from "@/lib/types";
import { ExternalLinkText } from "@/components/common/detail-row";
import { Button } from "@/components/ui/button";
import { Section } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";

interface StructureSectionProps {
  avatar: Avatar;
  /** Abre a aba de links do avatar (para cadastrar o site, o checkout, a página de entrega). */
  onEditLinks: () => void;
  /** Abre a aba "Funis para modelar" (as referências para montar esta estrutura). */
  onOpenFunnels: () => void;
  className?: string;
}

/**
 * Estrutura de vendas do avatar: site, entregável, checkout e automação. É o que
 * se monta enquanto a conta aquece; cada passo é marcado quando fica pronto.
 */
export function StructureSection({ avatar, onEditLinks, onOpenFunnels, className }: StructureSectionProps) {
  const toast = useToast();
  // passos com gravação em andamento: um segundo toque no mesmo passo é ignorado até a primeira terminar
  const saving = useRef(new Set<string>());
  const steps = readStructure(avatar.kit);
  const progress = structureProgress(avatar.kit);
  const percent = Math.round((progress.done / progress.total) * 100);
  const funnels = readFunnels(avatar.kit).length;

  async function toggle(step: StructureStep) {
    if (saving.current.has(step.key)) return;
    saving.current.add(step.key);
    try {
      await updateRow(
        "avatars",
        avatar.id,
        (row) => {
          const next = setStructureDone(row.kit, step.key, !step.done);
          return next === row.kit ? null : { kit: next };
        },
        { optimistic: true },
      );
    } catch (err) {
      toast.error(err);
    } finally {
      saving.current.delete(step.key);
    }
  }

  return (
    <Section
      title="Estrutura"
      subtitle={
        progress.complete
          ? "Tudo pronto para vender."
          : `${progress.done} de ${progress.total} prontos — dá para adiantar enquanto a conta aquece.`
      }
      className={className}
      actions={
        <Button size="sm" onClick={onEditLinks}>
          Links
        </Button>
      }
    >
      <div
        role="progressbar"
        aria-label="Progresso da estrutura"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        className="h-2 w-full overflow-hidden rounded-full bg-surface-2"
      >
        <div
          className={cn("h-full rounded-full transition-[width] duration-300", progress.complete ? "bg-emerald-500" : "bg-primary")}
          style={{ width: `${percent}%` }}
        />
      </div>
      <ul className="mt-2 divide-y divide-line">
        {steps.map((step) => (
          <li key={step.key} className="py-1.5">
            <button
              type="button"
              role="checkbox"
              aria-checked={step.done}
              onClick={() => void toggle(step)}
              className="flex min-h-11 w-full items-center gap-3 rounded-lg text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <span
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center rounded-md border-2 transition-colors",
                  step.done ? "border-emerald-500 bg-emerald-500 text-white" : "border-line-strong bg-surface",
                )}
                aria-hidden
              >
                {step.done ? <Check className="size-4" strokeWidth={3} /> : null}
              </span>
              <span className={cn("min-w-0 flex-1 text-[15px] font-medium", step.done && "text-muted line-through")}>
                {step.label}
              </span>
            </button>
            <div className="pb-1.5 pl-9 text-sm leading-relaxed text-muted">
              <StepDetails stepKey={step.key} help={step.help} avatar={avatar} />
            </div>
          </li>
        ))}
      </ul>
      {/* as referências para montar tudo isso ficam a um toque */}
      <Button size="sm" variant="ghost" onClick={onOpenFunnels} className="-ml-2 mt-1 text-primary">
        <Filter className="size-4" /> {funnels > 0 ? `Funis para modelar (${funnels})` : "Funis para modelar"}
      </Button>
    </Section>
  );
}

/** Embaixo de cada passo: o link que já está cadastrado para ele, ou o que ele quer dizer. */
function StepDetails({ stepKey, help, avatar }: { stepKey: StructureKey; help: string; avatar: Avatar }) {
  const links: Array<[string, string | null]> =
    stepKey === "site"
      ? [["", avatar.sales_site_url]]
      : stepKey === "checkout"
        ? [["", avatar.checkout_url]]
        : stepKey === "entregavel"
          ? [
              ["Página de entrega", avatar.delivery_page_url],
              ["Pasta", avatar.deliverables_folder_url],
            ]
          : [];
  const filled = links.filter((link): link is [string, string] => Boolean(link[1]));
  if (filled.length === 0) return <p>{help}</p>;
  return (
    <>
      {/* (rótulo e link em linha corrida: se o link não couber ao lado do rótulo, desce para a linha de baixo) */}
      {filled.map(([label, url]) => (
        <p key={url} className="min-w-0">
          {label ? <span>{label}: </span> : null}
          <ExternalLinkText url={url} />
        </p>
      ))}
    </>
  );
}
