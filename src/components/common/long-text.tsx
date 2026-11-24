"use client";

import { useState } from "react";
import { cn } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";

/** Um texto que pode ser comprido (um e-mail inteiro colado): mostra o começo e abre no toque. */
export function LongText({
  text,
  copyLabel,
  className,
  textClassName,
}: {
  text: string;
  copyLabel?: string;
  className?: string;
  /** Estilo do texto em si (ex.: a caixa de um prompt). */
  textClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const long = text.length > 260 || text.split("\n").length > 5;
  return (
    <div className={className}>
      <p className={cn("whitespace-pre-wrap text-sm leading-relaxed text-muted", textClassName, long && !open && "line-clamp-5")}>
        {text}
      </p>
      {long || copyLabel ? (
        <div className="mt-1 flex flex-wrap items-center gap-1">
          {long ? (
            <Button size="sm" variant="ghost" aria-expanded={open} onClick={() => setOpen(!open)} className="-ml-2 text-primary">
              {open ? "Ver menos" : "Ver tudo"}
            </Button>
          ) : null}
          {copyLabel ? (
            <CopyButton text={text} message="Texto copiado" label={copyLabel} className={cn("text-muted", !long && "-ml-2")} />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
