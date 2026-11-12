"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, Pencil, Trash2, UserRoundX } from "lucide-react";
import { accountsOf, currentAccount } from "@/lib/selectors";
import { deleteRow, useStore } from "@/lib/store";
import type { Avatar } from "@/lib/types";
import { setSelectedCountry } from "@/lib/ui-state";
import { AccountForm } from "@/components/avatar/account-form";
import { AccountTab } from "@/components/avatar/account-tab";
import { AvatarForm } from "@/components/avatar/avatar-form";
import { KeepExample } from "@/components/common/keep-example";
import { HistoryTab } from "@/components/avatar/history-tab";
import { KitTab } from "@/components/avatar/kit-tab";
import { LinksTab } from "@/components/avatar/links-tab";
import { NotesTab } from "@/components/avatar/notes-tab";
import { OverviewTab } from "@/components/avatar/overview-tab";
import { ReferencesTab } from "@/components/avatar/references-tab";
import { VideosTab } from "@/components/avatar/videos-tab";
import { AvatarPhoto } from "@/components/ui/avatar-photo";
import { AvatarStatusBadge, ExampleBadge } from "@/components/ui/badge";
import { Button, buttonClass } from "@/components/ui/button";
import { Card, EmptyState } from "@/components/ui/card";
import { useConfirm } from "@/components/ui/confirm";
import { Tabs, type TabItem } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";

const TAB_VALUES = ["geral", "conta", "links", "videos", "perfis", "kit", "historico", "notas"] as const;
type TabValue = (typeof TAB_VALUES)[number];

function isTab(value: string | null): value is TabValue {
  return TAB_VALUES.includes(value as TabValue);
}

export function AvatarScreen() {
  const params = useSearchParams();
  const db = useStore();
  const id = params.get("id");
  const avatar = db.avatars.find((a) => a.id === id);

  if (!avatar) {
    return (
      <Card>
        <EmptyState
          icon={<UserRoundX />}
          title="Avatar não encontrado"
          action={
            <Link href="/paises" className={buttonClass("primary")}>
              Ver países e avatares
            </Link>
          }
        >
          Ele pode ter sido apagado, ou o endereço está incompleto.
        </EmptyState>
      </Card>
    );
  }

  // key: ao trocar de avatar, a tela recomeça do zero (aba inicial, formulários fechados)
  return <AvatarContent key={avatar.id} avatar={avatar} initialTab={params.get("aba")} />;
}

function AvatarContent({ avatar, initialTab }: { avatar: Avatar; initialTab: string | null }) {
  const db = useStore();
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [tab, setTab] = useState<TabValue>(isTab(initialTab) ? initialTab : "geral");
  const [editing, setEditing] = useState(false);
  const [creatingAccount, setCreatingAccount] = useState(false);

  const country = db.countries.find((c) => c.id === avatar.country_id);
  const accounts = useMemo(() => accountsOf(db, avatar.id), [db, avatar.id]);
  const account = currentAccount(accounts);
  const pendingVideos = (avatar.model_videos ?? []).filter((v) => v.status === "a_modelar").length;

  function changeTab(next: TabValue) {
    setTab(next);
    // guarda a aba no endereço, para o "voltar" e os favoritos caírem no lugar certo
    const url = `/avatar?id=${avatar.id}${next === "geral" ? "" : `&aba=${next}`}`;
    window.history.replaceState(null, "", url);
  }

  async function remove() {
    const ok = await confirm({
      title: `Apagar o avatar ${avatar.name}?`,
      message: (
        <>
          Isto apaga <strong>tudo</strong> do avatar: {accounts.length === 1 ? "1 conta" : `${accounts.length} contas`},
          histórico, vendas, links, kit e anotações. Esta ação não pode ser desfeita.
        </>
      ),
      confirmLabel: "Apagar avatar",
      tone: "danger",
      typeToConfirm: avatar.name,
    });
    if (!ok) return;
    try {
      await deleteRow("avatars", avatar.id);
      toast.success("Avatar apagado");
      router.replace("/paises");
    } catch (err) {
      toast.error(err);
    }
  }

  const tabs: TabItem<TabValue>[] = [
    { value: "geral", label: "Visão geral" },
    { value: "conta", label: "Conta atual" },
    { value: "links", label: "Links" },
    { value: "videos", label: "Vídeos", count: pendingVideos > 0 ? pendingVideos : undefined },
    { value: "perfis", label: "Perfis de exemplo" },
    { value: "kit", label: "Kit de reposição" },
    { value: "historico", label: "Histórico", count: accounts.length > 0 ? accounts.length : undefined },
    { value: "notas", label: "Anotações" },
  ];

  return (
    <>
      <Link
        href="/paises"
        onClick={() => setSelectedCountry(avatar.country_id)}
        className="-ml-1.5 mb-3 inline-flex h-9 items-center gap-0.5 rounded-lg pl-0.5 pr-2 text-sm font-medium text-muted transition-colors hover:text-fg focus-visible:outline-2 focus-visible:outline-ring"
      >
        <ChevronLeft className="size-4" aria-hidden />
        {country ? `${country.flag ?? ""} ${country.name}`.trim() : "Países"}
      </Link>

      <header className="mb-5 flex items-start gap-4">
        <AvatarPhoto name={avatar.name} url={avatar.photo_url} size="lg" />
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold leading-tight tracking-tight">{avatar.name}</h1>
          {avatar.niche ? <p className="mt-0.5 text-sm text-muted">{avatar.niche}</p> : null}
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <AvatarStatusBadge status={avatar.status} />
            {avatar.is_example ? <ExampleBadge /> : null}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button size="sm" variant="ghost" iconOnly aria-label="Editar avatar" onClick={() => setEditing(true)}>
            <Pencil className="size-4" />
          </Button>
          <Button size="sm" variant="ghost" iconOnly aria-label="Apagar avatar" onClick={() => void remove()}>
            <Trash2 className="size-4 text-muted" />
          </Button>
        </div>
      </header>

      {avatar.is_example ? <KeepExample avatar={avatar} /> : null}

      <Tabs items={tabs} value={tab} onChange={changeTab} ariaLabel="Seções do avatar" className="mb-4" />

      {tab === "geral" ? (
        <OverviewTab
          avatar={avatar}
          country={country}
          account={account}
          onEdit={() => setEditing(true)}
          onGoTo={changeTab}
          onNewAccount={() => setCreatingAccount(true)}
        />
      ) : null}
      {tab === "conta" ? <AccountTab avatar={avatar} account={account} accounts={accounts} /> : null}
      {tab === "links" ? <LinksTab avatar={avatar} /> : null}
      {tab === "videos" ? <VideosTab avatar={avatar} /> : null}
      {tab === "perfis" ? <ReferencesTab avatar={avatar} /> : null}
      {tab === "kit" ? <KitTab avatar={avatar} /> : null}
      {tab === "historico" ? <HistoryTab avatar={avatar} accounts={accounts} /> : null}
      {/* fica sempre montada (só escondida) para não perder um texto ainda não salvo ao trocar de aba */}
      <div hidden={tab !== "notas"}>
        <NotesTab avatar={avatar} />
      </div>

      {editing ? <AvatarForm avatar={avatar} onClose={() => setEditing(false)} /> : null}
      {creatingAccount ? <AccountForm avatar={avatar} onClose={() => setCreatingAccount(false)} /> : null}
    </>
  );
}
