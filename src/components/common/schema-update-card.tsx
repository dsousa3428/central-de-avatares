"use client";

import { useState } from "react";
import { Database, RefreshCw } from "lucide-react";
import { refresh } from "@/lib/store";
import { CopySchemaButton } from "@/components/common/copy-schema-button";
import { Button } from "@/components/ui/button";
import { Section } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";

/**
 * Uma tela que depende de uma parte nova do banco (tabela que veio depois): o
 * passo a passo para rodar o script SQL atualizado, com "Copiar script SQL" e
 * "Já rodei" (que relê o banco e confere com `ready`).
 */
export function SchemaUpdateCard({ ready, children }: { ready: () => boolean; children: React.ReactNode }) {
  const toast = useToast();
  const [checking, setChecking] = useState(false);

  async function check() {
    setChecking(true);
    try {
      await refresh();
    } finally {
      setChecking(false);
    }
    if (!ready()) {
      toast.error("Ainda não encontrei a parte nova do banco. Confira se o script rodou até o fim (aparece “Tudo certo!”).");
    }
  }

  return (
    <Section title="Falta atualizar o banco (uma vez só)">
      <div className="space-y-3 text-[15px] leading-relaxed">
        <p className="flex gap-2">
          <Database className="mt-1 size-4 shrink-0 text-muted" aria-hidden />
          <span>
            {children} Ela entra quando você roda o script SQL atualizado:
          </span>
        </p>
        <ol className="list-decimal space-y-1.5 pl-5 marker:font-semibold marker:text-muted">
          <li>
            Toque em <strong>Copiar script SQL</strong>, aqui embaixo.
          </li>
          <li>
            No site do Supabase, abra o seu projeto, vá em <strong>SQL Editor</strong>, cole o script e toque em{" "}
            <strong>Run</strong>. Deve aparecer <em>“Tudo certo!”</em>.
          </li>
          <li>
            Volte aqui e toque em <strong>Já rodei</strong>.
          </li>
        </ol>
        <p className="text-sm text-muted">Rodar o script de novo é seguro: ele só cria o que falta e nunca apaga dados.</p>
        <div className="flex flex-wrap gap-2">
          <CopySchemaButton />
          <Button onClick={() => void check()} loading={checking}>
            <RefreshCw className="size-4" /> Já rodei
          </Button>
        </div>
      </div>
    </Section>
  );
}
