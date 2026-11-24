"use client";

import { useMemo, useRef, useState } from "react";
import { CalendarDays, Clock, Flag, Lightbulb, Plus, Repeat, UserRound, X } from "lucide-react";
import { formatWeekdayDate, todayISO } from "@/lib/dates";
import { cn } from "@/lib/format";
import { nextRestDay } from "@/lib/smart-tasks";
import { useStore } from "@/lib/store";
import { createTask } from "@/lib/task-actions";
import { describeDue, parseQuickAdd, priorityLabel, recurrenceLabel, type QuickKind } from "@/lib/tasks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { priorityText } from "./task-visuals";

const KIND_NAMES: Record<QuickKind, string> = {
  data: "data",
  hora: "horário",
  prioridade: "prioridade",
  avatar: "avatar",
  repeticao: "repetição",
};

/**
 * Adicionar rápido, como no Todoist: o que se escreve na frase vira data,
 * horário, prioridade, avatar (#nome) e repetição — e a tela mostra o que
 * entendeu, com um X para desfazer cada pedaço.
 */
export function QuickAdd({
  defaultAvatar,
  defaultDate,
  className,
}: {
  /** O avatar quando a frase não diz (ex.: o do filtro da tela). */
  defaultAvatar?: string | null;
  /** A data quando a frase não diz (ex.: hoje, na lista de hoje). */
  defaultDate?: string | null;
  className?: string;
}) {
  const db = useStore();
  const toast = useToast();
  const today = todayISO();
  const [text, setText] = useState("");
  const [ignore, setIgnore] = useState<ReadonlySet<QuickKind>>(() => new Set());
  // a data escolhida pela sugestão (o próximo dia de descanso da conta)
  const [picked, setPicked] = useState<string | null>(null);
  // o texto do campo agora (para saber, quando uma gravação falha, se dá para devolver a frase)
  const current = useRef("");
  const parsed = useMemo(() => parseQuickAdd(text, today, db.avatars, ignore), [text, today, db.avatars, ignore]);
  const knownDefault = defaultAvatar && db.avatars.some((avatar) => avatar.id === defaultAvatar) ? defaultAvatar : null;
  const avatarId = parsed.avatar_id ?? knownDefault;
  const due = parsed.due_date ?? picked ?? defaultDate ?? null;
  const rest = !parsed.due_date && !picked && avatarId ? nextRestDay(db, avatarId, today) : null;
  const avatarName = (id: string) => {
    const avatar = db.avatars.find((item) => item.id === id);
    const flag = avatar ? db.countries.find((country) => country.id === avatar.country_id)?.flag : undefined;
    return avatar ? `${flag ? `${flag} ` : ""}${avatar.name}` : "";
  };

  function change(value: string) {
    current.current = value;
    setText(value);
    if (!value.trim()) {
      setIgnore(new Set());
      setPicked(null);
    }
  }

  // O campo esvazia na hora (quem digita rápido já começa a próxima tarefa enquanto esta é
  // gravada); se a gravação falhar, a frase volta para o campo — se ele ainda estiver vazio.
  async function add(event: React.FormEvent) {
    event.preventDefault();
    if (!text.trim()) return;
    const title = parsed.title.trim();
    if (!title) {
      toast.error("Escreva o que fazer (além da data).");
      return;
    }
    const sent = { text, ignore, picked };
    current.current = "";
    setText("");
    setIgnore(new Set());
    setPicked(null);
    try {
      await createTask({
        title,
        notes: null,
        due_date: due,
        due_time: parsed.due_time,
        priority: parsed.priority,
        avatar_id: avatarId,
        recurrence: parsed.recurrence,
      });
      toast.success(due ? `Tarefa adicionada: ${describeDue(due, parsed.due_time, today)}` : "Tarefa adicionada");
    } catch (err) {
      toast.error(err);
      if (current.current === "") {
        current.current = sent.text;
        setText(sent.text);
        setIgnore(sent.ignore);
        setPicked(sent.picked);
      }
    }
  }

  const chips: Array<{ key: string; icon: React.ReactNode; label: string; className?: string; kind?: QuickKind }> = [];
  for (const piece of parsed.found) {
    if (piece.kind === "data" && parsed.due_date) {
      chips.push({ key: "data", kind: "data", icon: <CalendarDays className="size-3.5" />, label: describeDue(parsed.due_date, null, today) });
    } else if (piece.kind === "hora" && parsed.due_time) {
      chips.push({ key: "hora", kind: "hora", icon: <Clock className="size-3.5" />, label: parsed.due_time });
    } else if (piece.kind === "prioridade") {
      chips.push({
        key: "prioridade",
        kind: "prioridade",
        icon: <Flag className="size-3.5" />,
        label: `${priorityLabel(parsed.priority)} (P${parsed.priority})`,
        className: priorityText(parsed.priority),
      });
    } else if (piece.kind === "avatar" && parsed.avatar_id) {
      chips.push({ key: "avatar", kind: "avatar", icon: <UserRound className="size-3.5" />, label: avatarName(parsed.avatar_id) });
    } else if (piece.kind === "repeticao" && parsed.recurrence) {
      chips.push({ key: "repeticao", kind: "repeticao", icon: <Repeat className="size-3.5" />, label: recurrenceLabel(parsed.recurrence, due) });
    }
  }
  // o que vem de fora da frase (o filtro da tela, a lista de hoje, a sugestão aceita) também aparece
  if (!parsed.due_date && due) chips.push({ key: "data-padrao", icon: <CalendarDays className="size-3.5" />, label: describeDue(due, null, today) });
  if (!parsed.avatar_id && avatarId) chips.push({ key: "avatar-padrao", icon: <UserRound className="size-3.5" />, label: avatarName(avatarId) });

  return (
    <form onSubmit={(event) => void add(event)} className={className}>
      <div className="flex gap-2">
        <Input
          value={text}
          onChange={(event) => change(event.target.value)}
          placeholder="Ex.: Gravar vídeos amanhã 14h"
          aria-label="Nova tarefa"
          autoComplete="off"
          enterKeyHint="done"
          className="min-w-0 flex-1"
        />
        <Button type="submit" variant="primary" iconOnly aria-label="Adicionar tarefa">
          <Plus className="size-5" />
        </Button>
      </div>
      {text.trim() ? (
        <div className="mt-2 flex flex-wrap items-center gap-1.5" aria-live="polite" aria-label="O que o painel entendeu">
          {chips.map((chip) => (
            <span
              key={chip.key}
              className={cn(
                "inline-flex max-w-full items-center gap-1 rounded-full border border-line bg-surface-2 py-0.5 pl-2.5 text-xs font-medium",
                chip.kind ? "pr-0.5" : "pr-2.5",
                chip.className,
              )}
            >
              {chip.icon}
              <span className="min-w-0">{chip.label}</span>
              {chip.kind ? (
                <button
                  type="button"
                  onClick={() => setIgnore((now) => new Set([...now, chip.kind as QuickKind]))}
                  className="flex size-6 shrink-0 items-center justify-center rounded-full text-muted hover:bg-surface hover:text-fg"
                  aria-label={`Não usar como ${KIND_NAMES[chip.kind]}`}
                  title={`Não usar como ${KIND_NAMES[chip.kind]}`}
                >
                  <X className="size-3.5" />
                </button>
              ) : null}
            </span>
          ))}
          {rest ? (
            <button
              type="button"
              onClick={() => setPicked(rest.date)}
              className="inline-flex max-w-full items-center gap-1 rounded-full border border-dashed border-primary/50 px-2.5 py-1 text-xs font-medium text-primary hover:bg-primary-soft"
            >
              <Lightbulb className="size-3.5 shrink-0" aria-hidden />
              <span className="min-w-0">
                Sugestão: {formatWeekdayDate(rest.date)} (@{rest.handle} descansa)
              </span>
            </button>
          ) : null}
          {parsed.ambiguous ? (
            <span className="text-xs text-muted">“{parsed.ambiguous}” serve para mais de um avatar: escreva mais letras do nome.</span>
          ) : null}
        </div>
      ) : (
        <p className="mt-1.5 px-1 text-xs leading-relaxed text-muted">
          Entende: hoje, amanhã, sexta, 15/12, dia 5, 14h, p1 a p4, #avatar, todo dia, toda segunda, dias úteis…
        </p>
      )}
    </form>
  );
}
