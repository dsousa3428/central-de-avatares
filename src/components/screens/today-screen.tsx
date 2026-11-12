"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  CalendarCheck,
  Check,
  ChevronRight,
  Coffee,
  Fingerprint,
  Flame,
  Hammer,
  Search,
  Smartphone,
  Timer,
  Undo2,
  UserRound,
} from "lucide-react";
import { changeAccountStatus } from "@/lib/account-actions";
import { formatDateLong, formatDayMonth, todayISO } from "@/lib/dates";
import { cn } from "@/lib/format";
import {
  currentAccount,
  generationLabel,
  phoneLabel,
  profileLabel,
  profileShortLabel,
  runningWarmups,
  structuresToBuild,
  type RunningWarmup,
} from "@/lib/selectors";
import { useStore } from "@/lib/store";
import { pendingLabels } from "@/lib/structure";
import type { Account, AccountStatus, Avatar, Country } from "@/lib/types";
import { setSearchOpen } from "@/lib/ui-state";
import { markDay } from "@/lib/warmup-actions";
import { ExamplesNotice } from "@/components/common/examples-notice";
import { PageHeader } from "@/components/shell/page-header";
import { AvatarPhoto } from "@/components/ui/avatar-photo";
import { AccountStatusBadge, Badge } from "@/components/ui/badge";
import { Button, buttonClass } from "@/components/ui/button";
import { Card, EmptyState, Section } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { LateDay } from "@/components/warmup/late-day";
import { WarmupBar } from "@/components/warmup/warmup-bar";
import { useWarnings } from "@/components/warnings/use-warnings";
import { WarningsSection } from "@/components/warnings/warnings-section";
import type { Warning } from "@/lib/warnings";

// Estes dois avisos têm a sua própria seção nesta tela, com o botão que resolve
// ("Fiz no dia" / "Empurrar", "Marcar como ativa"): não se repetem na lista de avisos.
const OWN_SECTION: Array<Warning["kind"]> = ["aquecimento_atrasado", "pronta"];

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

function warmupHref(avatarId: string): string {
  return `/avatar?id=${avatarId}&aba=aquecimento`;
}

function title(row: RunningWarmup): string {
  return `${row.country?.flag ? `${row.country.flag} ` : ""}${row.avatar.name}`;
}

export function TodayScreen() {
  const db = useStore();
  const today = todayISO();

  const warmups = useMemo(() => runningWarmups(db, today), [db, today]);
  const late = warmups.filter((w) => w.info.late.length > 0);
  // Ordem fixa (por nome): marcar um cartão como feito não tira os outros do lugar,
  // para um toque duplo nunca cair no botão da conta vizinha.
  const tasks = warmups.filter((w) => w.info.today?.use);
  const pendingTasks = tasks.filter((w) => !w.info.today?.done).length;
  const resting = warmups.filter(
    (w) => w.info.phase === "em_andamento" && !w.info.today?.use,
  );
  const ready = warmups.filter((w) => w.info.phase === "concluido");
  const endingSoon = warmups.filter((w) => w.info.phase === "em_andamento" && w.info.daysLeft <= 3);
  const scheduled = warmups.filter((w) => w.info.phase === "agendado");
  // enquanto a conta aquece, monta-se o que ela vai vender: site, entregável, checkout e automação
  const building = useMemo(() => structuresToBuild(db, today), [db, today]);
  const warnings = useWarnings();
  const listed = (list: Warning[]) => list.filter((warning) => !OWN_SECTION.includes(warning.kind));

  const counts = useMemo(() => {
    const result: Record<AccountStatus, number> = { aquecendo: 0, ativa: 0, restrita: 0, caida: 0 };
    for (const account of db.accounts) result[account.status] += 1;
    return result;
  }, [db.accounts]);

  // Uma linha por avatar: a conta atual (geração mais nova que não caiu)
  const rows = useMemo(() => {
    const list: Array<{ avatar: Avatar; country: Country | undefined; account: Account }> = [];
    for (const avatar of db.avatars) {
      const account = currentAccount(db.accounts.filter((a) => a.avatar_id === avatar.id));
      if (account) list.push({ avatar, country: db.countries.find((c) => c.id === avatar.country_id), account });
    }
    return list.sort((a, b) => STATUS_ORDER.indexOf(a.account.status) - STATUS_ORDER.indexOf(b.account.status));
  }, [db.avatars, db.accounts, db.countries]);

  const dateTitle = formatDateLong(today);

  return (
    <>
      <PageHeader
        title="Hoje"
        subtitle={dateTitle.charAt(0).toUpperCase() + dateTitle.slice(1)}
        actions={
          // no computador a busca fica no menu lateral; no celular, aqui e no menu "Mais"
          <Button size="sm" onClick={() => setSearchOpen(true)} className="md:hidden">
            <Search className="size-4" /> Buscar
          </Button>
        }
      />
      <ExamplesNotice />

      <div className="space-y-4">
        <WarningsSection active={listed(warnings.active)} dismissed={listed(warnings.dismissed)} />

        {late.length > 0 ? (
          <Section title="Atrasados" subtitle="Dias de uso que passaram sem ser marcados.">
            <ul className="space-y-3">
              {late.map((row) => (
                <li key={row.warmup.id}>
                  <Link
                    href={warmupHref(row.avatar.id)}
                    className="mb-1.5 flex items-center gap-2 text-[15px] font-medium hover:underline"
                  >
                    {title(row)} <span className="text-sm font-normal text-muted">@{row.account.handle}</span>
                  </Link>
                  <LateDay warmup={row.warmup} account={row.account} info={row.info} />
                </li>
              ))}
            </ul>
          </Section>
        ) : null}

        <section aria-labelledby="hoje-tarefas">
          <div className="mb-2 flex items-baseline justify-between gap-3 px-1">
            <h2 id="hoje-tarefas" className="text-[15px] font-semibold">
              Para fazer hoje
            </h2>
            {tasks.length > 0 ? (
              <span className="text-sm text-muted">
                {pendingTasks === 0 ? "tudo feito" : `${pendingTasks} de ${tasks.length} por fazer`}
              </span>
            ) : null}
          </div>
          {tasks.length === 0 ? (
            <Card>
              <EmptyState
                icon={warmups.length > 0 ? <Coffee /> : <Flame />}
                title={warmups.length > 0 ? "Nenhuma conta para usar hoje" : "Nenhuma conta em aquecimento"}
                className="py-6"
              >
                {warmups.length > 0
                  ? "Hoje é dia de descanso para as contas em aquecimento."
                  : "Quando uma conta estiver aquecendo, o que fazer em cada dia aparece aqui."}
              </EmptyState>
            </Card>
          ) : (
            <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {tasks.map((row) => (
                <li key={row.warmup.id}>
                  <TaskCard row={row} />
                </li>
              ))}
            </ul>
          )}
        </section>

        {building.length > 0 ? (
          <Section title="Montar a estrutura" subtitle="Enquanto as contas aquecem: site, entregável, checkout e automação.">
            <ul className="divide-y divide-line">
              {building.map((row) => (
                <li key={row.avatar.id}>
                  <Link
                    href={`/avatar?id=${row.avatar.id}`}
                    className="flex items-center gap-3 py-2.5 focus-visible:outline-2 focus-visible:outline-ring"
                  >
                    <Hammer className="size-5 shrink-0 text-primary" aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="font-medium">
                          {row.country?.flag ? `${row.country.flag} ` : ""}
                          {row.avatar.name}
                        </span>
                        {row.restingToday ? <Badge tone="indigo">conta descansa hoje</Badge> : null}
                      </span>
                      <span className="mt-0.5 block text-sm text-muted">
                        Falta: {pendingLabels(row.progress)} · {row.progress.done} de {row.progress.total} prontos
                      </span>
                    </span>
                    <ChevronRight className="size-4 shrink-0 text-muted" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          </Section>
        ) : null}

        {ready.length > 0 ? (
          <Section title="Prontas para operar" subtitle="Aquecimento concluído.">
            <ul className="divide-y divide-line">
              {ready.map((row) => (
                <li key={row.warmup.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5">
                  <CalendarCheck className="size-5 shrink-0 text-emerald-500" aria-hidden />
                  <Link href={warmupHref(row.avatar.id)} className="min-w-0 flex-1 hover:underline">
                    <span className="font-medium">{title(row)}</span>{" "}
                    <span className="text-sm text-muted">@{row.account.handle}</span>
                  </Link>
                  <ActivateButton account={row.account} />
                </li>
              ))}
            </ul>
          </Section>
        ) : null}

        {resting.length > 0 ? (
          <Section title="Descansando hoje" subtitle="Contas em aquecimento que hoje ficam sem uso.">
            <ul className="divide-y divide-line">
              {resting.map((row) => (
                <li key={row.warmup.id}>
                  <Link
                    href={warmupHref(row.avatar.id)}
                    className="flex items-center gap-3 py-2.5 focus-visible:outline-2 focus-visible:outline-ring"
                  >
                    <Coffee className="size-5 shrink-0 text-muted" aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{title(row)}</span>
                      <span className="block truncate text-sm text-muted">
                        @{row.account.handle}
                        {row.info.today ? ` · dia ${row.info.today.n} de ${row.info.totalDays}` : ""}
                        {row.info.nextUse
                          ? ` · próximo uso em ${formatDayMonth(row.info.nextUse.date)} (${row.info.nextUse.minutes} min)`
                          : ""}
                      </span>
                    </span>
                    <ChevronRight className="size-4 shrink-0 text-muted" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          </Section>
        ) : null}

        {endingSoon.length > 0 || scheduled.length > 0 ? (
          <Section title="Nos próximos dias">
            <ul className="divide-y divide-line">
              {endingSoon.map((row) => (
                <li key={row.warmup.id}>
                  <Link href={warmupHref(row.avatar.id)} className="block py-2.5 focus-visible:outline-2 focus-visible:outline-ring">
                    <span className="flex items-baseline justify-between gap-3">
                      <span className="min-w-0 truncate font-medium">
                        {title(row)} <span className="text-sm font-normal text-muted">@{row.account.handle}</span>
                      </span>
                      <span className="shrink-0 text-sm text-muted">
                        {row.info.daysLeft === 0
                          ? "termina hoje"
                          : row.info.daysLeft === 1
                            ? "termina amanhã"
                            : `termina em ${row.info.daysLeft} dias`}{" "}
                        ({formatDayMonth(row.info.endDate)})
                      </span>
                    </span>
                    <WarmupBar info={row.info} className="mt-2" />
                  </Link>
                </li>
              ))}
              {scheduled.map((row) => (
                <li key={row.warmup.id}>
                  <Link
                    href={warmupHref(row.avatar.id)}
                    className="flex items-baseline justify-between gap-3 py-2.5 focus-visible:outline-2 focus-visible:outline-ring"
                  >
                    <span className="min-w-0 truncate font-medium">
                      {title(row)} <span className="text-sm font-normal text-muted">@{row.account.handle}</span>
                    </span>
                    <span className="shrink-0 text-sm text-muted">
                      aquecimento começa em {formatDayMonth(row.info.startDate)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </Section>
        ) : null}

        <ul className="grid grid-cols-4 gap-2 md:gap-3">
          {STATUS_ORDER.map((status) => {
            const tile = (
              <Card className="px-1 py-3 text-center md:px-4 md:py-4">
                <p className={cn("text-2xl font-bold tabular-nums md:text-3xl", STAT_COLOR[status])}>{counts[status]}</p>
                <p className="mt-0.5 truncate text-[11px] font-medium text-muted sm:text-xs md:text-sm">{STAT_LABEL[status]}</p>
              </Card>
            );
            return (
              <li key={status}>
                {status === "caida" ? (
                  // as caídas levam para a tela de quedas (quanto tempo duraram, por país e por motivo)
                  <Link
                    href="/quedas"
                    aria-label={`Caídas: ${counts[status]}. Ver as quedas`}
                    className="block rounded-2xl transition-opacity hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  >
                    {tile}
                  </Link>
                ) : (
                  tile
                )}
              </li>
            );
          })}
        </ul>

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

/** Cartão de uma tarefa do dia: qual conta usar, por quanto tempo, em qual celular e perfil. */
function TaskCard({ row }: { row: RunningWarmup }) {
  const toast = useToast();
  const saving = useRef(false);
  const day = row.info.today;
  if (!day) return null;
  const done = day.done;

  async function toggle() {
    // Toque duplo: "Feito" vira "Desfazer" na hora; sem esta trava, o segundo toque desfaria o primeiro.
    if (!day || saving.current) return;
    saving.current = true;
    try {
      await markDay(row.warmup, day.n, !done);
    } catch (err) {
      toast.error(err);
    } finally {
      saving.current = false;
    }
  }

  return (
    <Card className={cn("flex h-full flex-col p-4", done && "opacity-75")}>
      <div className="flex items-start gap-3">
        <AvatarPhoto name={row.avatar.name} url={row.avatar.photo_url} />
        <div className="min-w-0 flex-1">
          <Link href={warmupHref(row.avatar.id)} className="block truncate font-semibold hover:underline">
            {title(row)}
          </Link>
          <p className="truncate text-sm text-muted">
            @{row.account.handle} · dia {day.n} de {row.info.totalDays}
          </p>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-amber-500/18 px-3 py-1 text-sm font-semibold tabular-nums text-amber-800 dark:text-amber-300">
          <Timer className="size-4" aria-hidden />
          {day.minutes} min
        </span>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
        <div className="min-w-0">
          <dt className="flex items-center gap-1.5 text-muted">
            <Smartphone className="size-3.5" aria-hidden /> Celular
          </dt>
          <dd className="font-medium">{row.phone ? phoneLabel(row.phone) : "—"}</dd>
        </div>
        <div className="min-w-0">
          <dt className="flex items-center gap-1.5 text-muted">
            <Fingerprint className="size-3.5" aria-hidden /> Perfil anti-detect
          </dt>
          <dd className="font-medium">{row.profile ? profileLabel(row.profile) : "—"}</dd>
        </div>
      </dl>

      {day.task ? (
        <p className="mt-3 whitespace-pre-wrap rounded-xl bg-surface-2 px-3 py-2 text-sm leading-relaxed">{day.task}</p>
      ) : null}

      <div className="mt-auto pt-3">
        {done ? (
          <div className="flex items-center justify-between gap-3">
            <span className="inline-flex items-center gap-2 text-[15px] font-semibold text-emerald-700 dark:text-emerald-400">
              <span className="flex size-6 items-center justify-center rounded-full bg-emerald-500 text-white">
                <Check className="size-4" strokeWidth={3} aria-hidden />
              </span>
              Feito
            </span>
            <Button size="sm" variant="ghost" onClick={toggle}>
              <Undo2 className="size-4" /> Desfazer
            </Button>
          </div>
        ) : (
          <Button variant="primary" block onClick={toggle}>
            <Check className="size-4" /> Feito
          </Button>
        )}
      </div>
    </Card>
  );
}

function ActivateButton({ account }: { account: Account }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function activate() {
    setBusy(true);
    try {
      // espera a confirmação antes de tirar a linha da tela (a de baixo sobe para o mesmo lugar)
      await changeAccountStatus(account, "ativa", { optimistic: false });
      toast.success(`@${account.handle} marcada como ativa`);
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button size="sm" variant="primary" onClick={activate} loading={busy}>
      Marcar como ativa
    </Button>
  );
}
