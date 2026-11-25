"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CalendarClock, CircleCheckBig, Lightbulb, ListChecks, Plus } from "lucide-react";
import { todayISO } from "@/lib/dates";
import { plural } from "@/lib/format";
import { buildAutoTasks, restingWithStructure, type AutoTask } from "@/lib/smart-tasks";
import { getStore, useStore } from "@/lib/store";
import { moveToToday } from "@/lib/task-actions";
import { bucketTasks, compareTasks, dayHeading, isOpen } from "@/lib/tasks";
import type { Task } from "@/lib/types";
import { SchemaUpdateCard } from "@/components/common/schema-update-card";
import { QuickAdd } from "@/components/tasks/quick-add";
import { TaskForm } from "@/components/tasks/task-form";
import { AutoTaskRow, TaskRow } from "@/components/tasks/task-row";
import { useAvatarLabels } from "@/components/tasks/use-avatar-labels";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { Callout, Card, EmptyState, Section } from "@/components/ui/card";
import { Select } from "@/components/ui/field";
import { Segmented } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";

type View = "hoje" | "breve" | "todas" | "feitas";

/** Tarefas no estilo Todoist: as suas e as que o painel sugere a partir do que está registrado. */
export function TasksScreen() {
  const db = useStore();
  const toast = useToast();
  const today = todayISO();
  const [view, setView] = useState<View>("hoje");
  const [avatarFilter, setAvatarFilter] = useState("todos");
  const [editing, setEditing] = useState<Task | "new" | null>(null);
  const [moving, setMoving] = useState(false);

  // Pedidos de chegada, adotados uma vez só e tirados do endereço: a página de um avatar abre com
  // ?avatar=<id> (o filtro dele, na lista "Todas"); o atalho da tela Hoje, com ?ver=hoje (a lista de
  // hoje, com todos os avatares — a tela fica montada e lembraria o último filtro).
  const params = useSearchParams();
  const askedAvatar = params.get("avatar");
  const askedView = params.get("ver");
  const arrival = askedAvatar || askedView ? `${askedAvatar ?? ""}|${askedView ?? ""}` : null;
  const [adopted, setAdopted] = useState<string | null>(null);
  if (arrival !== adopted) {
    setAdopted(arrival);
    if (askedAvatar) {
      setAvatarFilter(askedAvatar);
      setView("todas");
    } else if (askedView === "hoje") {
      setAvatarFilter("todos");
      setView("hoje");
    }
  }
  useEffect(() => {
    if (arrival !== null) window.history.replaceState(null, "", "/tarefas");
  }, [arrival]);

  const filter = avatarFilter === "todos" || avatarFilter === "geral" || db.avatars.some((avatar) => avatar.id === avatarFilter) ? avatarFilter : "todos";
  const chosenAvatar = filter !== "todos" && filter !== "geral" ? filter : null;
  const matches = (avatarId: string | null) => filter === "todos" || (filter === "geral" ? !avatarId : avatarId === filter);
  // (uma sugestão pode ser de vários avatares: as vendas da semana passada)
  const matchesAuto = (task: AutoTask) =>
    filter === "todos" || (filter === "geral" ? task.avatarIds.length === 0 : task.avatarIds.includes(filter));

  const labelOf = useAvatarLabels();

  const auto = useMemo(() => buildAutoTasks(db, today), [db, today]);
  const mine = useMemo(() => db.tasks.filter((task) => matches(task.avatar_id)), [db.tasks, filter]); // eslint-disable-line react-hooks/exhaustive-deps
  const suggested = useMemo(() => auto.filter(matchesAuto), [auto, filter]); // eslint-disable-line react-hooks/exhaustive-deps
  const buckets = useMemo(() => bucketTasks(mine, today), [mine, today]);
  const resting = useMemo(() => restingWithStructure(db, suggested), [db, suggested]);
  // (com um avatar escolhido no filtro, não precisa repetir o nome dele em cada linha)
  const avatarOf = (id: string | null) => (chosenAvatar ? "" : labelOf(id));

  if (!db.tasksReady) {
    return (
      <>
        <PageHeader title="Tarefas" subtitle="As suas e as que o painel sugere." />
        <SchemaUpdateCard ready={() => getStore().tasksReady}>
          Para guardar as suas tarefas, o banco de dados precisa de uma tabela nova.
        </SchemaUpdateCard>
      </>
    );
  }

  async function lateToToday() {
    setMoving(true);
    try {
      await moveToToday(buckets.late, today);
      toast.success("Atrasadas passadas para hoje");
    } catch (err) {
      toast.error(err);
    } finally {
      setMoving(false);
    }
  }

  const todayAuto = suggested.filter((task) => task.today);
  const rows = (tasks: Task[]) =>
    tasks.map((task) => <TaskRow key={task.id} task={task} today={today} avatarLabel={avatarOf(task.avatar_id)} onEdit={() => setEditing(task)} />);
  const autoRows = (tasks: AutoTask[]) => tasks.map((task) => <AutoTaskRow key={task.key} task={task} today={today} avatarLabel={avatarOf(task.avatarId)} />);

  return (
    <>
      <PageHeader
        title="Tarefas"
        subtitle="As suas e as que o painel sugere a partir do que está registrado nos avatares."
        actions={
          <Button size="sm" onClick={() => setEditing("new")}>
            <Plus className="size-4" /> Detalhada
          </Button>
        }
      />

      <div className="space-y-4">
        <Card className="p-3">
          <QuickAdd defaultAvatar={chosenAvatar} defaultDate={view === "hoje" ? today : null} />
        </Card>

        <div className="space-y-2">
          <Segmented
            ariaLabel="Mostrar"
            value={view}
            onChange={(next: View) => setView(next)}
            items={[
              { value: "hoje", label: "Hoje" },
              { value: "breve", label: "Em breve" },
              { value: "todas", label: "Todas" },
              { value: "feitas", label: "Feitas" },
            ]}
          />
          <Select value={filter} onChange={(event) => setAvatarFilter(event.target.value)} aria-label="Avatar" className="h-10">
            <option value="todos">Avatar: todos</option>
            <option value="geral">Só as gerais</option>
            {db.avatars.map((avatar) => (
              <option key={avatar.id} value={avatar.id}>
                {labelOf(avatar.id)}
              </option>
            ))}
          </Select>
          <p className="px-1 text-xs leading-relaxed text-muted">
            Toque numa tarefa para editar tudo; no calendário{" "}
            <CalendarClock className="inline size-3.5 align-[-2px]" aria-hidden />, para mudar só a data.
          </p>
        </div>

        {view === "hoje" ? (
          <>
            {resting.length > 0 ? (
              <Callout icon={<Lightbulb />}>
                <p>
                  <strong>Dica do dia:</strong>{" "}
                  {resting.length === 1
                    ? `hoje a conta de ${resting[0].name} descansa`
                    : `hoje as contas de ${resting
                        .slice(0, -1)
                        .map((avatar) => avatar.name)
                        .join(", ")} e ${resting[resting.length - 1].name} descansam`}{" "}
                  — bom dia para adiantar a estrutura (site, entregável, checkout, automação).
                </p>
              </Callout>
            ) : null}
            {buckets.late.length > 0 ? (
              <Section
                title="Atrasadas"
                subtitle={plural(buckets.late.length, "tarefa", "tarefas")}
                actions={
                  <Button size="sm" onClick={() => void lateToToday()} loading={moving}>
                    Passar para hoje
                  </Button>
                }
              >
                <ul className="divide-y divide-line">{rows(buckets.late)}</ul>
              </Section>
            ) : null}
            <Section title="Hoje" subtitle={buckets.today.length > 0 ? plural(buckets.today.length, "tarefa sua", "tarefas suas") : undefined}>
              {buckets.today.length > 0 ? (
                <ul className="divide-y divide-line">{rows(buckets.today)}</ul>
              ) : (
                <p className="py-1 text-sm text-muted">
                  {buckets.late.length > 0 ? "Nenhuma marcada para hoje (só as atrasadas, acima)." : "Nada seu marcado para hoje."}
                </p>
              )}
            </Section>
            <AutoSection tasks={todayAuto} empty="Nada do painel para hoje: estrutura em dia, aquecimento feito." render={autoRows} />
          </>
        ) : null}

        {view === "breve" ? <Upcoming buckets={buckets} auto={suggested} today={today} rows={rows} autoRows={autoRows} /> : null}

        {view === "todas" ? (
          <Everything
            groups={
              filter === "todos"
                ? [null, ...db.avatars.map((avatar) => avatar.id)].map((id) => ({
                    id,
                    tasks: mine.filter((task) => isOpen(task) && task.avatar_id === id),
                    auto: suggested.filter((task) => task.avatarId === id),
                  }))
                : [{ id: chosenAvatar, tasks: mine.filter(isOpen), auto: suggested }]
            }
            title={(id) => (id ? labelOf(id) : "Gerais")}
            rows={rows}
            autoRows={autoRows}
          />
        ) : null}

        {view === "feitas" ? (
          buckets.done.length > 0 ? (
            <Section title="Feitas" subtitle="Nos últimos 30 dias. Toque no círculo para desfazer.">
              <ul className="divide-y divide-line">{rows(buckets.done)}</ul>
            </Section>
          ) : (
            <Card>
              <EmptyState icon={<CircleCheckBig />} title="Nada concluído nos últimos 30 dias" />
            </Card>
          )
        ) : null}
      </div>

      {editing ? (
        <TaskForm
          task={editing === "new" ? null : editing}
          initialAvatar={chosenAvatar}
          initialDate={view === "hoje" ? today : null}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </>
  );
}

function AutoSection({ tasks, empty, render }: { tasks: AutoTask[]; empty: string; render: (tasks: AutoTask[]) => React.ReactNode }) {
  return (
    <Section title="Do painel" subtitle="Tiradas do que está registrado nos avatares (as datas seguem o aquecimento). Concluir aqui marca lá.">
      {tasks.length > 0 ? <ul className="divide-y divide-line">{render(tasks)}</ul> : <p className="py-1 text-sm text-muted">{empty}</p>}
    </Section>
  );
}

/** Os próximos dias: as suas e as do painel que têm data (prazos da estrutura), dia a dia. */
function Upcoming({
  buckets,
  auto,
  today,
  rows,
  autoRows,
}: {
  buckets: ReturnType<typeof bucketTasks>;
  auto: AutoTask[];
  today: string;
  rows: (tasks: Task[]) => React.ReactNode;
  autoRows: (tasks: AutoTask[]) => React.ReactNode;
}) {
  const dates = new Map<string, { tasks: Task[]; auto: AutoTask[] }>();
  for (const group of buckets.upcoming) dates.set(group.date, { tasks: group.tasks, auto: [] });
  for (const task of auto) {
    if (!task.due || task.due <= today) continue;
    const entry = dates.get(task.due) ?? { tasks: [], auto: [] };
    entry.auto.push(task);
    dates.set(task.due, entry);
  }
  const ordered = [...dates.entries()].sort(([a], [b]) => a.localeCompare(b));
  if (ordered.length === 0) {
    return (
      <Card>
        <EmptyState icon={<CalendarClock />} title="Nada marcado para os próximos dias">
          Tarefas com data a partir de amanhã aparecem aqui, dia a dia — inclusive os prazos da estrutura de cada avatar.
        </EmptyState>
      </Card>
    );
  }
  return (
    <>
      {ordered.map(([date, entry]) => (
        <Section key={date} title={dayHeading(date, today)}>
          <ul className="divide-y divide-line">
            {rows(entry.tasks)}
            {autoRows(entry.auto)}
          </ul>
        </Section>
      ))}
    </>
  );
}

/** Tudo o que está por fazer, por avatar (as gerais primeiro). */
function Everything({
  groups,
  title,
  rows,
  autoRows,
}: {
  groups: Array<{ id: string | null; tasks: Task[]; auto: AutoTask[] }>;
  title: (id: string | null) => string;
  rows: (tasks: Task[]) => React.ReactNode;
  autoRows: (tasks: AutoTask[]) => React.ReactNode;
}) {
  const filled = groups
    .map((group) => ({ ...group, tasks: [...group.tasks].sort(compareTasks) }))
    .filter((group) => group.tasks.length > 0 || group.auto.length > 0);
  if (filled.length === 0) {
    return (
      <Card>
        <EmptyState icon={<ListChecks />} title="Nada por fazer">
          Escreva uma tarefa no campo acima. O painel também sugere tarefas sozinho: a estrutura de cada avatar (site,
          entregável, checkout, automação), o aquecimento do dia, os funis e vídeos para modelar.
        </EmptyState>
      </Card>
    );
  }
  return (
    <>
      {filled.map((group) => (
        <Section
          key={group.id ?? "geral"}
          title={title(group.id)}
          subtitle={[
            group.tasks.length > 0 ? plural(group.tasks.length, "sua", "suas") : "",
            group.auto.length > 0 ? `${group.auto.length} do painel` : "",
          ]
            .filter(Boolean)
            .join(" · ")}
        >
          <ul className="divide-y divide-line">
            {rows(group.tasks)}
            {autoRows(group.auto)}
          </ul>
        </Section>
      ))}
    </>
  );
}
