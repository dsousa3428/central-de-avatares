"use client";

import { useEffect, useState } from "react";
import { copyText } from "@/lib/clipboard";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

/** Copia o script de preparação do banco (`/schema.sql`), para colar no SQL Editor do Supabase. */
export function CopySchemaButton({ variant = "primary", size }: { variant?: "primary" | "secondary"; size?: "sm" | "md" }) {
  const toast = useToast();
  const [sql, setSql] = useState<string | null>(null);

  // Já deixa o script na memória: ao tocar em "Copiar" a cópia é imediata.
  useEffect(() => {
    let active = true;
    fetch("/schema.sql")
      .then((response) => (response.ok ? response.text() : null))
      .then((text) => {
        if (active && text) setSql(text);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  async function copy() {
    if (!sql) return;
    const ok = await copyText(sql);
    if (ok) toast.success("Script copiado. Agora cole no SQL Editor do Supabase.");
    else toast.error("Não consegui copiar. Abra o arquivo supabase/schema.sql no GitHub e copie de lá.");
  }

  return (
    <Button variant={variant} size={size} onClick={() => void copy()} disabled={!sql}>
      Copiar script SQL
    </Button>
  );
}
