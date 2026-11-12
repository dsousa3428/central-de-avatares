"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight, Clock, Coins, Globe, Languages, Pencil, Plus, Tags, UserRound } from "lucide-react";
import { timeInZone } from "@/lib/dates";
import { copyText } from "@/lib/clipboard";
import { formatNumber } from "@/lib/format";
import { accountsOf, currentAccount, generationLabel, latestAccount, phoneLabel, profileShortLabel } from "@/lib/selectors";
import { useStore, type Db } from "@/lib/store";
import type { Avatar, Country } from "@/lib/types";
import { setSelectedCountry, useSelectedCountry } from "@/lib/ui-state";
import { AvatarForm } from "@/components/avatar/avatar-form";
import { ExamplesNotice } from "@/components/common/examples-notice";
import { CountryForm } from "@/components/countries/country-form";
import { PageHeader } from "@/components/shell/page-header";
import { AvatarPhoto } from "@/components/ui/avatar-photo";
import { AccountStatusBadge, AvatarStatusBadge, ExampleBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, EmptyState, Section } from "@/components/ui/card";
import { CopyButton } from "@/components/ui/copy-button";
import { Tabs } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import { useRouter } from "next/navigation";

export function CountriesScreen() {
  const db = useStore();
  const router = useRouter();
  const selectedId = useSelectedCountry();
  const [countryForm, setCountryForm] = useState<Country | "new" | null>(null);
  const [creatingAvatar, setCreatingAvatar] = useState(false);

  const country = db.countries.find((c) => c.id === selectedId) ?? db.countries[0] ?? null;

  const tabs = useMemo(
    () =>
      db.countries.map((c) => ({
        value: c.id,
        label: (
          <>
            {c.flag ? <span aria-hidden>{c.flag}</span> : null}
            {c.name}
          </>
        ),
        count: db.avatars.filter((a) => a.country_id === c.id).length,
      })),
    [db.countries, db.avatars],
  );

  return (
    <>
      <PageHeader
        title="Países"
        subtitle="Uma aba por país, com os avatares de cada um."
        actions={
          <Button variant="primary" onClick={() => setCountryForm("new")}>
            <Plus className="size-4" /> País
          </Button>
        }
      />
      <ExamplesNotice />

      {!country ? (
        <Card>
          <EmptyState
            icon={<Globe />}
            title="Nenhum país cadastrado"
            action={
              <Button variant="primary" onClick={() => setCountryForm("new")}>
                <Plus className="size-4" /> Adicionar país
              </Button>
            }
          >
            Comece adicionando o primeiro país onde você tem avatares.
          </EmptyState>
        </Card>
      ) : (
        <>
          <Tabs items={tabs} value={country.id} onChange={setSelectedCountry} ariaLabel="Países" className="mb-4" />
          <CountryPanel
            db={db}
            country={country}
            onEdit={() => setCountryForm(country)}
            onNewAvatar={() => setCreatingAvatar(true)}
          />
        </>
      )}

      {countryForm ? (
        <CountryForm
          country={countryForm === "new" ? undefined : countryForm}
          onClose={() => setCountryForm(null)}
          onSaved={(saved) => setSelectedCountry(saved.id)}
        />
      ) : null}
      {creatingAvatar && country ? (
        <AvatarForm
          defaultCountryId={country.id}
          onClose={() => setCreatingAvatar(false)}
          onSaved={(saved) => router.push(`/avatar?id=${saved.id}`)}
        />
      ) : null}
    </>
  );
}

function InfoChip({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-2.5 py-1 text-sm text-muted [&_svg]:size-3.5">
      {icon}
      {children}
    </span>
  );
}

interface CountryPanelProps {
  db: Db;
  country: Country;
  onEdit: () => void;
  onNewAvatar: () => void;
}

function CountryPanel({ db, country, onEdit, onNewAvatar }: CountryPanelProps) {
  const toast = useToast();
  const avatars = db.avatars.filter((a) => a.country_id === country.id);
  const tags = country.warmup_tags ?? [];
  const localTime = timeInZone(country.timezone);

  async function copyTag(tag: string) {
    const ok = await copyText(tag);
    if (ok) toast.success(`Copiado: ${tag}`);
    else toast.error("Não consegui copiar.");
  }

  return (
    <div className="space-y-4">
      <Card className="p-4 md:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold leading-snug">
                {country.flag ? <span className="mr-1.5" aria-hidden>{country.flag}</span> : null}
                {country.name}
              </h2>
              {country.is_example ? <ExampleBadge /> : null}
            </div>
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {country.language ? <InfoChip icon={<Languages />}>{country.language}</InfoChip> : null}
              <InfoChip icon={<Coins />}>{country.currency}</InfoChip>
              {localTime ? <InfoChip icon={<Clock />}>Agora lá: {localTime}</InfoChip> : null}
            </div>
          </div>
          <Button size="sm" onClick={onEdit}>
            <Pencil className="size-4" /> Editar
          </Button>
        </div>
        {country.notes ? (
          <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-muted">{country.notes}</p>
        ) : null}
      </Card>

      <Section
        title="Tags de aquecimento"
        subtitle={tags.length > 0 ? "Toque em uma tag para copiar só ela." : undefined}
        actions={
          tags.length > 0 ? (
            <CopyButton text={tags.join(" ")} label="Copiar todas" variant="soft" message="Tags copiadas" />
          ) : null
        }
      >
        {tags.length === 0 ? (
          <EmptyState icon={<Tags />} title="Nenhuma tag ainda" className="py-5">
            Hashtags, temas e perfis para interagir durante o aquecimento neste país. Toque em <strong>Editar</strong>{" "}
            para adicionar.
          </EmptyState>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {tags.map((tag) => (
              <li key={tag}>
                <button
                  type="button"
                  onClick={() => void copyTag(tag)}
                  title="Copiar"
                  className="rounded-full border border-line bg-surface-2 px-3 py-1.5 text-sm font-medium transition-colors hover:border-primary hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  {tag}
                </button>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <div className="flex items-center justify-between gap-3 pt-1">
        <h2 className="text-[15px] font-semibold">
          Avatares <span className="font-normal text-muted">({avatars.length})</span>
        </h2>
        <Button size="sm" variant="soft" onClick={onNewAvatar}>
          <Plus className="size-4" /> Avatar
        </Button>
      </div>

      {avatars.length === 0 ? (
        <Card>
          <EmptyState
            icon={<UserRound />}
            title={`Nenhum avatar em ${country.name}`}
            action={
              <Button variant="primary" onClick={onNewAvatar}>
                <Plus className="size-4" /> Criar avatar
              </Button>
            }
          />
        </Card>
      ) : (
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {avatars.map((avatar) => (
            <li key={avatar.id}>
              <AvatarCard db={db} avatar={avatar} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AvatarCard({ db, avatar }: { db: Db; avatar: Avatar }) {
  const accounts = accountsOf(db, avatar.id);
  const account = currentAccount(accounts);
  const last = latestAccount(accounts);
  const phone = account ? db.phones.find((p) => p.id === account.phone_id) : undefined;
  const profile = account ? db.profiles.find((p) => p.id === account.profile_id) : undefined;
  const details = account
    ? [
        account.followers !== null ? `${formatNumber(account.followers)} seguidores` : null,
        phone ? phoneLabel(phone) : null,
        profile ? profileShortLabel(profile) : null,
      ].filter(Boolean)
    : [];

  return (
    <Link
      href={`/avatar?id=${avatar.id}`}
      className="group block rounded-2xl border border-line bg-surface p-4 shadow-card transition-colors hover:border-line-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      <div className="flex items-center gap-3">
        <AvatarPhoto name={avatar.name} url={avatar.photo_url} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <p className="truncate font-semibold">{avatar.name}</p>
            <AvatarStatusBadge status={avatar.status} />
            {avatar.is_example ? <ExampleBadge /> : null}
          </div>
          {avatar.niche ? <p className="truncate text-sm text-muted">{avatar.niche}</p> : null}
        </div>
        <ChevronRight className="size-5 shrink-0 text-muted transition-transform group-hover:translate-x-0.5" aria-hidden />
      </div>

      <div className="mt-3 border-t border-line pt-3">
        {account ? (
          <>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="break-all text-[15px] font-medium">@{account.handle}</span>
              <AccountStatusBadge status={account.status} />
              <span className="text-sm text-muted">{generationLabel(account.generation)}</span>
            </div>
            {details.length > 0 ? <p className="mt-1 text-sm text-muted">{details.join(" · ")}</p> : null}
          </>
        ) : (
          <>
            <p className="text-[15px] font-medium text-red-600 dark:text-red-400">Sem conta ativa</p>
            <p className="mt-0.5 text-sm text-muted">
              {last ? `A última (@${last.handle}, ${generationLabel(last.generation)}) caiu.` : "Nenhuma conta cadastrada."}
            </p>
          </>
        )}
      </div>
    </Link>
  );
}
