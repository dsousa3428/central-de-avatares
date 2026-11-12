"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Fingerprint, Pencil, Plus, Smartphone, TriangleAlert } from "lucide-react";
import { formatDate } from "@/lib/dates";
import { describeAccount, usageByPhone, usageByProfile, type Usage } from "@/lib/selectors";
import { useStore, type Db } from "@/lib/store";
import type { AntidetectProfile, Phone } from "@/lib/types";
import { setInfraTab, useInfraTab } from "@/lib/ui-state";
import { ExamplesNotice } from "@/components/common/examples-notice";
import { PhoneForm } from "@/components/infra/phone-form";
import { ProfileForm } from "@/components/infra/profile-form";
import { PageHeader } from "@/components/shell/page-header";
import { AccountStatusBadge, Badge, ExampleBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, EmptyState } from "@/components/ui/card";
import { Tabs } from "@/components/ui/tabs";

const NO_USAGE: Usage = { live: [], fallen: [] };

export function InfraScreen() {
  const db = useStore();
  // (a aba fica fora desta tela para a busca global poder abrir direto em Celulares ou Perfis)
  const tab = useInfraTab();
  const setTab = setInfraTab;
  const [phoneForm, setPhoneForm] = useState<Phone | "new" | null>(null);
  const [profileForm, setProfileForm] = useState<AntidetectProfile | "new" | null>(null);

  const phoneUsage = useMemo(() => usageByPhone(db), [db]);
  const profileUsage = useMemo(() => usageByProfile(db), [db]);

  const freePhones = db.phones.filter((p) => !phoneUsage.get(p.id)?.live.length).length;
  const freeProfiles = db.profiles.filter((p) => !profileUsage.get(p.id)?.live.length).length;

  return (
    <>
      <PageHeader
        title="Infraestrutura"
        subtitle="Celulares e perfis do anti-detect: quem está em cada um e quais estão livres."
        actions={
          <Button variant="primary" onClick={() => (tab === "celulares" ? setPhoneForm("new") : setProfileForm("new"))}>
            <Plus className="size-4" /> {tab === "celulares" ? "Celular" : "Perfil"}
          </Button>
        }
      />
      <ExamplesNotice />

      <Tabs
        ariaLabel="Tipo de recurso"
        value={tab}
        onChange={setTab}
        className="mb-4"
        items={[
          { value: "celulares", label: "Celulares", count: db.phones.length },
          { value: "perfis", label: "Perfis anti-detect", count: db.profiles.length },
        ]}
      />

      {tab === "celulares" ? (
        db.phones.length === 0 ? (
          <Card>
            <EmptyState
              icon={<Smartphone />}
              title="Nenhum celular cadastrado"
              action={
                <Button variant="primary" onClick={() => setPhoneForm("new")}>
                  <Plus className="size-4" /> Cadastrar celular
                </Button>
              }
            >
              Cadastre os aparelhos para saber qual conta está em cada um.
            </EmptyState>
          </Card>
        ) : (
          <>
            <p className="mb-3 text-sm text-muted">
              {freePhones} de {db.phones.length} {db.phones.length === 1 ? "celular livre" : "celulares livres"}
            </p>
            <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {db.phones.map((phone) => (
                <li key={phone.id}>
                  <ResourceCard
                    db={db}
                    icon={<Smartphone />}
                    title={phone.nickname}
                    lines={[phone.model, phone.number]}
                    notes={phone.notes}
                    isExample={phone.is_example}
                    usage={phoneUsage.get(phone.id) ?? NO_USAGE}
                    onEdit={() => setPhoneForm(phone)}
                  />
                </li>
              ))}
            </ul>
          </>
        )
      ) : db.profiles.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Fingerprint />}
            title="Nenhum perfil cadastrado"
            action={
              <Button variant="primary" onClick={() => setProfileForm("new")}>
                <Plus className="size-4" /> Cadastrar perfil
              </Button>
            }
          >
            Cadastre os perfis do navegador anti-detect, com o número de cada um.
          </EmptyState>
        </Card>
      ) : (
        <>
          <p className="mb-3 text-sm text-muted">
            {freeProfiles} de {db.profiles.length} {db.profiles.length === 1 ? "perfil livre" : "perfis livres"}
          </p>
          <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {db.profiles.map((profile) => (
              <li key={profile.id}>
                <ResourceCard
                  db={db}
                  icon={<Fingerprint />}
                  title={`Perfil ${profile.number}`}
                  lines={[profile.name, profile.proxy ? `Proxy: ${profile.proxy}` : null]}
                  notes={profile.notes}
                  isExample={profile.is_example}
                  usage={profileUsage.get(profile.id) ?? NO_USAGE}
                  onEdit={() => setProfileForm(profile)}
                />
              </li>
            ))}
          </ul>
        </>
      )}

      {phoneForm ? (
        <PhoneForm
          phone={phoneForm === "new" ? undefined : phoneForm}
          usedBy={phoneForm === "new" ? 0 : db.accounts.filter((a) => a.phone_id === phoneForm.id).length}
          onClose={() => setPhoneForm(null)}
        />
      ) : null}
      {profileForm ? (
        <ProfileForm
          profile={profileForm === "new" ? undefined : profileForm}
          usedBy={profileForm === "new" ? 0 : db.accounts.filter((a) => a.profile_id === profileForm.id).length}
          onClose={() => setProfileForm(null)}
        />
      ) : null}
    </>
  );
}

interface ResourceCardProps {
  db: Db;
  icon: React.ReactNode;
  title: string;
  lines: Array<string | null>;
  notes: string | null;
  isExample: boolean;
  usage: Usage;
  onEdit: () => void;
}

/** Cartão de um celular ou perfil, mostrando quem usa e quem já usou. */
function ResourceCard({ db, icon, title, lines, notes, isExample, usage, onEdit }: ResourceCardProps) {
  const inUse = usage.live.length > 0;
  const shared = usage.live.length > 1;
  const burned = usage.fallen.length > 0;

  return (
    <Card className="h-full p-4">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-muted [&_svg]:size-5">
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <p className="font-semibold">{title}</p>
            {inUse ? <Badge tone="sky">Em uso</Badge> : <Badge tone="green">Livre</Badge>}
            {isExample ? <ExampleBadge /> : null}
          </div>
          {lines.filter(Boolean).map((line) => (
            <p key={line} className="break-all text-sm text-muted">
              {line}
            </p>
          ))}
        </div>
        <Button size="sm" variant="ghost" iconOnly aria-label={`Editar ${title}`} onClick={onEdit}>
          <Pencil className="size-4 text-muted" />
        </Button>
      </div>

      {inUse ? (
        <div className="mt-3 border-t border-line pt-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">
            {shared ? "Em uso por mais de uma conta" : "Em uso por"}
          </p>
          <ul className="mt-1.5 space-y-1.5">
            {usage.live.map((account) => (
              <li key={account.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                <Link href={`/avatar?id=${account.avatar_id}&aba=conta`} className="font-medium text-primary hover:underline">
                  {describeAccount(db, account)}
                </Link>
                <AccountStatusBadge status={account.status} />
              </li>
            ))}
          </ul>
          {shared ? (
            <p className="mt-2 flex items-start gap-1.5 text-sm font-medium text-red-600 dark:text-red-400">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              Duas contas no mesmo recurso podem ser vinculadas pelo Instagram.
            </p>
          ) : null}
        </div>
      ) : null}

      {burned ? (
        <div className="mt-3 border-t border-line pt-3">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-orange-700 dark:text-orange-400">
            <TriangleAlert className="size-3.5" aria-hidden />
            Já usado por conta que caiu
          </p>
          <ul className="mt-1.5 space-y-1 text-sm text-muted">
            {usage.fallen.map((account) => (
              <li key={account.id}>
                {describeAccount(db, account)}
                {account.fell_on ? ` — caiu em ${formatDate(account.fell_on)}` : ""}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {notes ? <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-muted">{notes}</p> : null}
    </Card>
  );
}
