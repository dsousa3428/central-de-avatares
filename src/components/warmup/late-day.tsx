"use client";

import { useState } from "react";
import { TriangleAlert } from "lucide-react";
import { addDays, daysBetween, formatDate, formatWeekdayDate, todayISO } from "@/lib/dates";
import type { Account, Warmup } from "@/lib/types";
import type { WarmupInfo } from "@/lib/warmup";
import { markDay, pushCalendar } from "@/lib/warmup-actions";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm";
import { useToast } from "@/components/ui/toast";

interface LateDayProps {
  warmup: Warmup;
  account: Account;
  info: WarmupInfo;
}

/**
 * Um dia de uso passou sem ser marcado. Duas saídas:
 *  - "Fiz no dia": só faltou marcar.
 *  - "Não fiz": pergunta se quer empurrar o calendário e recalcula a data de fim.
 */
export function LateDay({ warmup, account, info }: LateDayProps) {
  const toast = useToast();
  const confirm = useConfirm();
  const [busy, setBusy] = useState<"done" | "push" | null>(null);
  const day = info.late[0];
  if (!day) return null;
  const others = info.late.length - 1;

  async function markDone() {
    setBusy("done");
    try {
      // espera a confirmação: este aviso some ao dar certo e outro pode subir para o lugar dele
      await markDay(warmup, day.n, true, { optimistic: false });
      toast.success(`Dia ${day.n} marcado como feito`);
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(null);
    }
  }

  async function push() {
    const today = todayISO();
    const delta = daysBetween(day.date, today);
    const ok = await confirm({
      title: "Empurrar o calendário?",
      message: (
        <>
          <p>
            O <strong>dia {day.n}</strong> passa para <strong>hoje</strong> e todos os dias seguintes andam junto (
            {delta === 1 ? "1 dia" : `${delta} dias`}).
          </p>
          <p className="mt-2">
            Novo fim previsto: <strong>{formatDate(addDays(info.endDate, delta))}</strong> (era {formatDate(info.endDate)}
            ).
          </p>
        </>
      ),
      confirmLabel: "Empurrar",
    });
    if (!ok) return;
    setBusy("push");
    try {
      const pushed = await pushCalendar(warmup, account, day.n, today);
      if (pushed) toast.success("Calendário empurrado");
      else toast.info("Este dia já tinha sido resolvido. Nada foi alterado.");
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="rounded-xl border border-red-500/30 bg-red-500/8 p-3.5">
      <p className="flex items-start gap-2 text-sm font-medium text-red-700 dark:text-red-300">
        <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
        <span>
          Dia {day.n} ({formatWeekdayDate(day.date)}) ficou sem marcar · {day.minutes} min
          {others > 0 ? ` — e mais ${others === 1 ? "1 dia atrasado" : `${others} dias atrasados`}` : ""}
        </span>
      </p>
      <div className="mt-2.5 flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" onClick={markDone} loading={busy === "done"} disabled={busy !== null}>
          Fiz no dia
        </Button>
        <Button size="sm" variant="secondary" onClick={push} loading={busy === "push"} disabled={busy !== null}>
          Não fiz: empurrar para hoje
        </Button>
      </div>
    </div>
  );
}
