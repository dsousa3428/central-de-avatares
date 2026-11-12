"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { keepExampleAvatar, keepExampleCountry } from "@/lib/examples";
import { refresh, useStore } from "@/lib/store";
import type { Avatar, Country } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/card";
import { useConfirm } from "@/components/ui/confirm";
import { useToast } from "@/components/ui/toast";

type KeepExampleProps = { avatar: Avatar; country?: never } | { country: Country; avatar?: never };

/**
 * Aviso mostrado em um avatar ou país de exemplo, com o botão "Ficar com ele":
 * transforma o exemplo em um dado seu, para não ser apagado junto com os exemplos.
 */
export function KeepExample({ avatar, country }: KeepExampleProps) {
  const db = useStore();
  const toast = useToast();
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);
  const what = avatar ? "avatar" : "país";
  const name = avatar ? avatar.name : country.name;

  async function keep() {
    const ok = await confirm({
      title: `Ficar com ${name}?`,
      message: avatar ? (
        <>
          <p>
            <strong>{name}</strong> deixa de ser um exemplo e passa a ser um avatar seu, junto com as contas, o país e
            os celulares e perfis que ele usa.
          </p>
          <p className="mt-2">
            Nada é alterado nem apagado. Ele só não será mais removido quando você apagar os exemplos.
          </p>
        </>
      ) : (
        <>
          <p>
            <strong>{name}</strong> deixa de ser um exemplo e passa a ser um país seu (com as tags de aquecimento que
            estiverem nele).
          </p>
          <p className="mt-2">Os avatares de exemplo dentro dele continuam sendo exemplos.</p>
        </>
      ),
      confirmLabel: "Ficar com ele",
    });
    if (!ok) return;
    setBusy(true);
    try {
      if (avatar) await keepExampleAvatar(db, avatar.id);
      else await keepExampleCountry(country.id);
      await refresh();
      toast.success(`${name} agora é seu`);
    } catch (err) {
      toast.error(err);
      void refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Callout icon={<Sparkles />} className="mb-4">
      <p>
        Este {what} é um <strong>exemplo</strong> com dados fictícios. Se você apagar os exemplos em Configurações, ele
        some junto com tudo que estiver nele — inclusive o que você tiver alterado.
      </p>
      <Button size="sm" variant="secondary" className="mt-2.5" onClick={keep} loading={busy}>
        Ficar com este {what}
      </Button>
    </Callout>
  );
}
