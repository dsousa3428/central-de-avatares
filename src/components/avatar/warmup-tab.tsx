"use client";

import { useRef, useState } from "react";
import { CalendarCheck, Check, Flame, Pencil, RotateCcw } from "lucide-react";
import { changeAccountStatus } from "@/lib/account-actions";
import { formatDate, formatWeekdayDate, todayISO, toISODate } from "@/lib/dates";
import { cn } from "@/lib/format";
import { isWarmupRunning, warmupOf } from "@/lib/selectors";
import { useStore } from "@/lib/store";
import type { Account, Warmup, WarmupDay } from "@/lib/types";
import { sortedDays, warmupInfo, warmupShortLabel } from "@/lib/warmup";
import { markDay } from "@/lib/warmup-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Callout, Card, EmptyState, Section } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { DayForm } from "@/components/warmup/day-form";
import { LateDay } from "@/components/warmup/late-day";
import { PlanForm } from "@/components/warmup/plan-form";
import { StartWarmupForm } from "@/components/warmup/start-warmup-form";
import { WarmupBar } from "@/components/warmup/warmup-bar";

/** Aba "Aquecimento" da página do avatar: o calendário da conta atual. */
export function WarmupTab({ account }: { account: Account | null }) {
  const db = useStore();
  const [starting, setStarting] = useState(false);

  if (!account) {
    return (
      <Card>
        <EmptyState icon={<Flame />} title="Sem conta para aquecer">
          Este avatar não tem conta ativa. Crie uma conta na aba “Conta atual” para iniciar o aquecimento.
        </EmptyState>
      </Card>
    );
  }

  const warmup = warmupOf(db, account.id);
  return (
    <>
      {warmup ? (
        <WarmupCalendar account={account} warmup={warmup} />
      ) : (
        <Card>
          <EmptyState
            icon={<Flame />}
            title="Esta conta ainda não tem calendário de aquecimento"
            action={
              <Button variant="primary" onClick={() => setStarting(true)}>
                <Flame className="size-4" /> Iniciar aquecimento
              </Button>
            }
          >
            O calendário diz em quais dias usar a conta, por quantos minutos, e em quais descansar.
          </EmptyState>
        </Card>
      )}
      {/* Fora dos ramos acima: o formulário continua aberto (e mostra o erro, se houver)
          mesmo depois que o calendário passa a existir no meio do salvamento. */}
      {starting ? <StartWarmupForm account={account} onClose={() => setStarting(false)} /> : null}
    </>
  );
}

function WarmupCalendar({ account, warmup }: { account: Account; warmup: Warmup }) {
  const toast = useToast();
  const [editingDay, setEditingDay] = useState<WarmupDay | null>(null);
  const [editingPlan, setEditingPlan] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const [activating, setActivating] = useState(false);
  const saving = useRef(new Set<number>());

  const today = todayISO();
  const days = sortedDays(warmup.days);
  const info = warmupInfo(warmup, today);
  const running = isWarmupRunning(account, warmup);

  async function toggle(day: WarmupDay) {
    // toque duplo no mesmo círculo: o segundo é ignorado enquanto o primeiro está sendo gravado
    if (saving.current.has(day.n)) return;
    saving.current.add(day.n);
    try {
      await markDay(warmup, day.n, !day.done);
    } catch (err) {
      toast.error(err);
    } finally {
      saving.current.delete(day.n);
    }
  }

  async function activate() {
    setActivating(true);
    try {
      await changeAccountStatus(account, "ativa", { optimistic: false });
      toast.success("Conta marcada como ativa");
    } catch (err) {
      toast.error(err);
    } finally {
      setActivating(false);
    }
  }

  return (
    <div className="space-y-4">
      <Section
        title={`Aquecimento de @${account.handle}`}
        subtitle={running ? warmupShortLabel(info) : "Encerrado"}
        actions={
          <>
            <Button size="sm" onClick={() => setEditingPlan(true)}>
              <Pencil className="size-4" /> Editar
            </Button>
            <Button size="sm" variant="ghost" iconOnly aria-label="Reiniciar aquecimento" title="Reiniciar" onClick={() => setRestarting(true)}>
              <RotateCcw className="size-4 text-muted" />
            </Button>
          </>
        }
      >
        <WarmupBar info={info} />
        <dl className="mt-3 grid grid-cols-3 gap-3 text-sm">
          <div>
            <dt className="text-muted">Início</dt>
            <dd className="font-medium">{formatDate(info.startDate)}</dd>
          </div>
          <div>
            <dt className="text-muted">Fim previsto</dt>
            <dd className="font-medium">{formatDate(info.endDate)}</dd>
          </div>
          <div>
            <dt className="text-muted">Usos feitos</dt>
            <dd className="font-medium tabular-nums">
              {info.doneUseDays} de {info.useDays}
            </dd>
          </div>
        </dl>

        {!running ? (
          <Callout className="mt-3">
            {warmup.finished_at
              ? `Este aquecimento foi encerrado em ${formatDate(toISODate(new Date(warmup.finished_at)))}.`
              : "A conta não está mais com o status “Aquecendo”."}{" "}
            {info.phase === "concluido"
              ? "Para aquecer de novo, toque em reiniciar (↺)."
              : "Para continuar de onde parou, volte o status da conta para “Aquecendo”. Para começar do zero, toque em reiniciar (↺)."}
          </Callout>
        ) : null}
        {running && info.phase === "atrasado" ? (
          <div className="mt-3">
            <LateDay warmup={warmup} account={account} info={info} />
          </div>
        ) : null}
        {running && info.phase === "concluido" ? (
          <div className="mt-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3.5">
            <p className="flex items-center gap-2 text-sm font-medium text-emerald-800 dark:text-emerald-300">
              <CalendarCheck className="size-4" aria-hidden /> Aquecimento concluído. A conta está pronta para operar.
            </p>
            <Button size="sm" variant="primary" className="mt-2.5" onClick={activate} loading={activating}>
              Marcar conta como ativa
            </Button>
          </div>
        ) : null}
      </Section>

      <Section title="Calendário" subtitle="Toque no círculo para marcar o dia como feito." flush>
        <ol className="divide-y divide-line border-t border-line">
          {days.map((day) => {
            const isToday = day.date === today;
            const future = day.date > today;
            const late = running && day.use && !day.done && day.date < today;
            return (
              <li
                key={day.n}
                className={cn("flex items-start gap-3 px-4 py-3 md:px-5", isToday && "bg-primary-soft/60")}
              >
                {day.use ? (
                  <button
                    type="button"
                    onClick={() => void toggle(day)}
                    disabled={!running || (future && !day.done)}
                    aria-pressed={day.done}
                    aria-label={day.done ? `Desmarcar o dia ${day.n}` : `Marcar o dia ${day.n} como feito`}
                    className={cn(
                      "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                      "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                      "disabled:cursor-not-allowed disabled:opacity-50",
                      day.done
                        ? "border-emerald-500 bg-emerald-500 text-white"
                        : late
                          ? "border-red-400 text-transparent"
                          : "border-line-strong text-transparent enabled:hover:border-emerald-500",
                    )}
                  >
                    <Check className="size-4" strokeWidth={3} />
                  </button>
                ) : (
                  <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center text-muted" aria-hidden>
                    —
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className={cn("text-[15px] font-medium", !day.use && "text-muted")}>Dia {day.n}</span>
                    <span className="text-sm text-muted">{formatWeekdayDate(day.date)}</span>
                    {isToday ? <Badge tone="indigo">Hoje</Badge> : null}
                    {late ? <Badge tone="red">Atrasado</Badge> : null}
                  </div>
                  <p className={cn("text-sm", day.use ? "text-fg" : "text-muted")}>
                    {day.use ? `Uso · ${day.minutes} min` : "Descanso"}
                  </p>
                  {day.use && day.task ? (
                    <p className="mt-0.5 whitespace-pre-wrap text-sm leading-relaxed text-muted">{day.task}</p>
                  ) : null}
                </div>
                <Button size="sm" variant="ghost" iconOnly aria-label={`Editar o dia ${day.n}`} onClick={() => setEditingDay(day)}>
                  <Pencil className="size-4 text-muted" />
                </Button>
              </li>
            );
          })}
        </ol>
      </Section>

      {editingDay ? <DayForm warmup={warmup} day={editingDay} onClose={() => setEditingDay(null)} /> : null}
      {editingPlan ? <PlanForm warmup={warmup} onClose={() => setEditingPlan(false)} /> : null}
      {restarting ? <StartWarmupForm account={account} warmup={warmup} onClose={() => setRestarting(false)} /> : null}
    </div>
  );
}
