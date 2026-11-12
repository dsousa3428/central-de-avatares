"use client";

import { useMemo } from "react";
import Link from "next/link";
import { CalendarClock, ChevronRight, TriangleAlert, UserRound } from "lucide-react";
import { formatDateLong, todayISO } from "@/lib/dates";
import {
  avatarsWithoutLiveAccount,
  currentAccount,
  generationLabel,
  phoneLabel,
  profileShortLabel,
} from "@/lib/selectors";
import { useStore } from "@/lib/store";
import type { Account, AccountStatus, Avatar, Country } from "@/lib/types";
import { ExamplesNotice } from "@/components/common/examples-notice";
import { PageHeader } from "@/components/shell/page-header";
import { AvatarPhoto } from "@/components/ui/avatar-photo";
import { AccountStatusBadge } from "@/components/ui/badge";
import { Callout, Card, EmptyState, Section } from "@/components/ui/card";
import { buttonClass } from "@/components/ui/button";
import { cn } from "@/lib/format";

const STATUS_ORDER: AccountStatus[] = ["aquecendo", "ativa", "restrita", "caida"];
const STAT_LABEL: Record<AccountStatus, string> = {
  aquecendo: "Aquecendo",
  ativa: "Ativas",
  restrita: "Restritas",
  caida: "Caídas",
};
const STAT_COLOR: Record<AccountStatus, string> = {
  aquecendo: "text-amber-600 dark:text-amber-400",
  ativa: "text-emerald-600 dark:text-emerald-400",
  restrita: "text-orange-600 dark:text-orange-400",
  caida: "text-red-600 dark:text-red-400",
};

interface Row {
  avatar: Avatar;
  country: Country | undefined;
  account: Account;
}

export function TodayScreen() {
  const db = useStore();
  const today = todayISO();

  const counts = useMemo(() => {
    const result: Record<AccountStatus, number> = { aquecendo: 0, ativa: 0, restrita: 0, caida: 0 };
    for (const account of db.accounts) result[account.status] += 1;
    return result;
  }, [db.accounts]);

  // Uma linha por avatar: a conta atual (geração mais nova que não caiu)
  const rows = useMemo<Row[]>(() => {
    const list: Row[] = [];
    for (const avatar of db.avatars) {
      const account = currentAccount(db.accounts.filter((a) => a.avatar_id === avatar.id));
      if (account) list.push({ avatar, country: db.countries.find((c) => c.id === avatar.country_id), account });
    }
    return list.sort(
      (a, b) => STATUS_ORDER.indexOf(a.account.status) - STATUS_ORDER.indexOf(b.account.status),
    );
  }, [db.avatars, db.accounts, db.countries]);

  const orphans = avatarsWithoutLiveAccount(db);
  const title = formatDateLong(today);

  return (
    <>
      <PageHeader title="Hoje" subtitle={title.charAt(0).toUpperCase() + title.slice(1)} />
      <ExamplesNotice />

      <ul className="mb-4 grid grid-cols-4 gap-2 md:gap-3">
        {STATUS_ORDER.map((status) => (
          <li key={status}>
            <Card className="px-2 py-3 text-center md:px-4 md:py-4">
              <p className={cn("text-2xl font-bold tabular-nums md:text-3xl", STAT_COLOR[status])}>{counts[status]}</p>
              <p className="mt-0.5 text-xs font-medium text-muted md:text-sm">{STAT_LABEL[status]}</p>
            </Card>
          </li>
        ))}
      </ul>

      <div className="space-y-4">
        <Callout icon={<CalendarClock />}>
          A lista do que fazer em cada dia (quais contas usar, por quantos minutos, com o botão “feito”) chega na
          próxima etapa, junto com o aquecimento.
        </Callout>

        {orphans.length > 0 ? (
          <Section title="Avatares sem conta ativa" subtitle="Avatares ativos que estão sem nenhuma conta em operação.">
            <ul className="divide-y divide-line">
              {orphans.map((avatar) => (
                <li key={avatar.id}>
                  <Link
                    href={`/avatar?id=${avatar.id}&aba=conta`}
                    className="flex items-center gap-3 py-2.5 focus-visible:outline-2 focus-visible:outline-ring"
                  >
                    <TriangleAlert className="size-5 shrink-0 text-red-500" aria-hidden />
                    <span className="min-w-0 flex-1 truncate font-medium">{avatar.name}</span>
                    <span className="text-sm text-muted">Subir nova conta</span>
                    <ChevronRight className="size-4 shrink-0 text-muted" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          </Section>
        ) : null}

        <Section title="Contas em operação" subtitle="A conta atual de cada avatar." flush>
          {rows.length === 0 ? (
            <EmptyState
              icon={<UserRound />}
              title="Nenhuma conta em operação"
              action={
                <Link href="/paises" className={buttonClass("primary")}>
                  Ver países e avatares
                </Link>
              }
            >
              Cadastre um avatar e a conta dele para começar.
            </EmptyState>
          ) : (
            <ul className="divide-y divide-line border-t border-line">
              {rows.map(({ avatar, country, account }) => {
                const phone = db.phones.find((p) => p.id === account.phone_id);
                const profile = db.profiles.find((p) => p.id === account.profile_id);
                const where = [phone ? phoneLabel(phone) : null, profile ? profileShortLabel(profile) : null].filter(Boolean);
                return (
                  <li key={account.id}>
                    <Link
                      href={`/avatar?id=${avatar.id}&aba=conta`}
                      className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-2/60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring md:px-5"
                    >
                      <AvatarPhoto name={avatar.name} url={avatar.photo_url} size="sm" />
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="truncate font-medium">
                            {country?.flag ? `${country.flag} ` : ""}
                            {avatar.name}
                          </span>
                          <AccountStatusBadge status={account.status} />
                        </span>
                        <span className="mt-0.5 block truncate text-sm text-muted">
                          @{account.handle} · {generationLabel(account.generation)}
                          {where.length > 0 ? ` · ${where.join(" · ")}` : ""}
                        </span>
                      </span>
                      <ChevronRight className="size-4 shrink-0 text-muted" aria-hidden />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Section>
      </div>
    </>
  );
}
