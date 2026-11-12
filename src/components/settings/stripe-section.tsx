"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { StripeDialog } from "@/components/sales/stripe-dialog";
import { Button } from "@/components/ui/button";
import { Section } from "@/components/ui/card";

/** Configurações → Vendas pela Stripe: abre a mesma janela da tela Vendas (ela confere a ligação e ensina a ligar). */
export function StripeSection() {
  const [open, setOpen] = useState(false);
  return (
    <Section title="Vendas pela Stripe" subtitle="O painel busca as vendas de cada avatar na sua conta Stripe.">
      <p className="text-sm leading-relaxed text-muted">
        Cole o link de pagamento da Stripe no campo <strong className="font-medium text-fg">Checkout</strong> de cada
        avatar (aba Links). Na tela Vendas, o botão <strong className="font-medium text-fg">Stripe</strong> busca as
        vendas e lança na semana certa. A ligação é feita uma vez só, com uma chave que fica guardada na Vercel.
      </p>
      <Button variant="secondary" className="mt-3" onClick={() => setOpen(true)}>
        <RefreshCw className="size-4" /> Ligar ou testar a Stripe
      </Button>
      {open ? <StripeDialog onClose={() => setOpen(false)} /> : null}
    </Section>
  );
}
