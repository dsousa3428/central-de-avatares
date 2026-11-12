"use client";

import { CircleCheck, Download } from "lucide-react";
import { promptInstall, useCanInstall, useStandalone } from "@/lib/pwa";
import { Button } from "@/components/ui/button";
import { Section } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";

/** Configurações → instalar o painel como aplicativo (tela inicial do celular). */
export function InstallSection() {
  const toast = useToast();
  const canInstall = useCanInstall();
  const standalone = useStandalone();

  async function install() {
    try {
      if (await promptInstall()) toast.success("Painel instalado");
    } catch (err) {
      toast.error(err);
    }
  }

  return (
    <Section title="Instalar no celular" subtitle="O painel abre como um aplicativo, direto da tela inicial.">
      {standalone ? (
        <p className="flex items-center gap-2 text-[15px]">
          <CircleCheck className="size-5 shrink-0 text-emerald-500" aria-hidden />
          O painel já está instalado neste aparelho.
        </p>
      ) : (
        <>
          {canInstall ? (
            <Button variant="primary" onClick={() => void install()} className="mb-3">
              <Download className="size-4" /> Instalar agora
            </Button>
          ) : null}
          <ul className="space-y-2 text-sm leading-relaxed">
            <li>
              <strong>iPhone (Safari):</strong> toque em <strong>Compartilhar</strong> (o quadrado com a seta para
              cima) e depois em <strong>Adicionar à Tela de Início</strong>.
            </li>
            <li>
              <strong>Android (Chrome):</strong> toque nos três pontinhos do navegador e em{" "}
              <strong>Instalar app</strong> (ou <strong>Adicionar à tela inicial</strong>).
            </li>
            <li>
              <strong>Computador (Chrome ou Edge):</strong> clique no ícone de instalar, no fim da barra de endereço.
            </li>
          </ul>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Instalado ou não, o painel é o mesmo e precisa de internet: os dados continuam no seu Supabase.
          </p>
        </>
      )}
    </Section>
  );
}
