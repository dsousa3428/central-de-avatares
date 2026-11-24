"use client";

import Link from "next/link";
import { FolderOpen, Pencil, Plus } from "lucide-react";
import { formatMoney, formatNumber, plural } from "@/lib/format";
import { libraryUsage } from "@/lib/library";
import { generationLabel, phoneLabel, profileShortLabel } from "@/lib/selectors";
import { updateRow, useStore } from "@/lib/store";
import type { Account, Avatar, Country } from "@/lib/types";
import { DetailList, DetailRow, LinkRow } from "@/components/common/detail-row";
import { AccountStatusBadge, AvatarStatusBadge } from "@/components/ui/badge";
import { Button, buttonClass } from "@/components/ui/button";
import { Section } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { AvatarTasks } from "@/components/tasks/avatar-tasks";
import { StructureSection } from "./structure-section";

interface OverviewTabProps {
  avatar: Avatar;
  country: Country | undefined;
  account: Account | null;
  onEdit: () => void;
  onGoTo: (tab: "conta" | "links" | "funis") => void;
  onNewAccount: () => void;
}

export function OverviewTab({ avatar, country, account, onEdit, onGoTo, onNewAccount }: OverviewTabProps) {
  const db = useStore();
  const toast = useToast();
  const phone = account ? db.phones.find((p) => p.id === account.phone_id) : undefined;
  const profile = account ? db.profiles.find((p) => p.id === account.profile_id) : undefined;

  async function toggleStatus() {
    const next = avatar.status === "ativo" ? "pausado" : "ativo";
    try {
      await updateRow("avatars", avatar.id, { status: next }, { optimistic: true });
      toast.success(next === "ativo" ? "Avatar reativado" : "Avatar pausado");
    } catch (err) {
      toast.error(err);
    }
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <Section
        title="Resumo"
        actions={
          <Button size="sm" onClick={onEdit}>
            <Pencil className="size-4" /> Editar
          </Button>
        }
      >
        <DetailList>
          <DetailRow label="País" value={country ? `${country.flag ?? ""} ${country.name}`.trim() : null} />
          <DetailRow label="Nicho" value={avatar.niche} />
          <DetailRow label="Status">
            <span className="flex items-center justify-between gap-3">
              <AvatarStatusBadge status={avatar.status} />
              <Button size="sm" variant="soft" onClick={toggleStatus}>
                {avatar.status === "ativo" ? "Pausar" : "Reativar"}
              </Button>
            </span>
          </DetailRow>
          <DetailRow label="Produto" value={avatar.product_name} />
          <DetailRow
            label="Preço"
            value={avatar.product_price !== null ? formatMoney(avatar.product_price, avatar.product_currency) : null}
          />
        </DetailList>
      </Section>

      <Section
        title="Conta atual"
        actions={
          account ? (
            <Button size="sm" onClick={() => onGoTo("conta")}>
              Ver conta
            </Button>
          ) : null
        }
      >
        {account ? (
          <DetailList>
            <DetailRow label="Conta" value={`@${account.handle}`} copy copyMessage="@ copiado">
              <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="font-medium">@{account.handle}</span>
                <AccountStatusBadge status={account.status} />
              </span>
            </DetailRow>
            <DetailRow label="Geração" value={generationLabel(account.generation)} />
            <DetailRow label="Seguidores" value={account.followers !== null ? formatNumber(account.followers) : null} />
            <DetailRow label="Celular" value={phone ? phoneLabel(phone) : null} />
            <DetailRow label="Perfil" value={profile ? profileShortLabel(profile) : null} />
          </DetailList>
        ) : (
          <div className="py-2">
            <p className="text-[15px] font-medium text-red-600 dark:text-red-400">Sem conta ativa</p>
            <p className="mt-1 text-sm leading-relaxed text-muted">
              Este avatar não tem nenhuma conta em operação no momento.
            </p>
            <Button variant="primary" className="mt-3" onClick={onNewAccount}>
              <Plus className="size-4" /> Nova conta
            </Button>
          </div>
        )}
      </Section>

      <StructureSection
        avatar={avatar}
        onEditLinks={() => onGoTo("links")}
        onOpenFunnels={() => onGoTo("funis")}
        className="md:col-span-2"
      />

      <Section
        title="Links principais"
        className="md:col-span-2"
        actions={
          <Button size="sm" onClick={() => onGoTo("links")}>
            Ver todos
          </Button>
        }
      >
        {avatar.sales_site_url || avatar.checkout_url ? (
          <div className="divide-y divide-line">
            {avatar.sales_site_url ? <LinkRow label="Site de vendas" url={avatar.sales_site_url} /> : null}
            {avatar.checkout_url ? <LinkRow label="Checkout" url={avatar.checkout_url} /> : null}
          </div>
        ) : (
          <p className="py-2 text-sm text-muted">Nenhum link cadastrado ainda. Adicione na aba Links.</p>
        )}
      </Section>

      {db.tasksReady ? <AvatarTasks avatar={avatar} /> : null}

      {db.libraryReady ? <LibraryShortcut avatar={avatar} /> : null}
    </div>
  );
}

/** Os prompts e arquivos deste avatar ficam na tela "Arquivos e prompts": o atalho já abre com o filtro dele. */
function LibraryShortcut({ avatar }: { avatar: Avatar }) {
  const db = useStore();
  const usage = libraryUsage(db.library.filter((item) => item.avatar_id === avatar.id));
  const summary = [
    usage.prompts > 0 ? plural(usage.prompts, "prompt", "prompts") : "",
    usage.files > 0 ? plural(usage.files, "arquivo", "arquivos") : "",
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <Section
      title="Arquivos e prompts"
      subtitle={summary ? `${summary} deste avatar.` : "Nada guardado deste avatar ainda: prompts, fotos de referência, PDFs…"}
      className="md:col-span-2"
      actions={
        <Link href={`/arquivos?avatar=${avatar.id}`} className={buttonClass("secondary", "sm")}>
          <FolderOpen className="size-4" /> Abrir
        </Link>
      }
    >
      <p className="text-sm leading-relaxed text-muted">
        Guarde os prompts que geram este avatar (para copiar com um toque) e os arquivos dele, num lugar privado do seu
        Supabase.
      </p>
    </Section>
  );
}
