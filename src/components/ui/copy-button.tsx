"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import { copyText } from "@/lib/clipboard";
import { cn } from "@/lib/format";
import { Button } from "./button";
import { useToast } from "./toast";

interface CopyButtonProps {
  text: string | null | undefined;
  /** Texto do aviso (ex.: "Bio copiada"). */
  message?: string;
  /** Mostra um rótulo ao lado do ícone. */
  label?: string;
  size?: "sm" | "md";
  variant?: "ghost" | "secondary" | "soft";
  className?: string;
}

export function CopyButton({ text, message = "Copiado", label, size = "sm", variant = "ghost", className }: CopyButtonProps) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, []);

  if (!text) return null;

  async function handleClick(event: React.MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    const ok = await copyText(text as string);
    if (!ok) {
      toast.error("Não consegui copiar. Selecione o texto e copie manualmente.");
      return;
    }
    toast.success(message);
    setCopied(true);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(false), 1500);
  }

  const Icon = copied ? Check : Copy;
  return (
    <Button
      variant={variant}
      size={size}
      iconOnly={!label}
      aria-label={label ? undefined : "Copiar"}
      title="Copiar"
      onClick={handleClick}
      className={cn(!label && "text-muted hover:text-fg", className)}
    >
      <Icon className={cn("size-4", copied && "text-emerald-500")} />
      {label}
    </Button>
  );
}
