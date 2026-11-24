// Tarefas que o próprio painel sugere: as regras (sem tela e sem banco).
//
// Não ficam guardadas em lugar nenhum — são calculadas na hora, a partir do que
// já está registrado em cada avatar. Por isso nunca ficam velhas: quando a coisa
// é feita (o passo da estrutura marcado, o dia do aquecimento feito…), a tarefa
// some sozinha. Concluir a tarefa aqui marca a coisa lá (ver task-actions.ts).
//
//  - Estrutura (site, entregável, checkout, automação) de quem está montando:
//    prazo = o dia em que o aquecimento termina; nos dias em que a conta descansa,
//    entra na lista de hoje ("bom dia para adiantar").
//  - Aquecimento: a conta para usar hoje; dias atrasados (resolver na tela Hoje).
//  - Reposição: os itens que faltam do checklist da conta nova.
//  - Vendas da semana passada sem lançamento.
//  - Funis para modelar (o próximo passo de cada modelo) e vídeos para modelar.

import { formatWeekdayDate, isValidISODate } from "./dates";
import { readFunnels, stepLabel } from "./funnels";
import { checklistProgress, readChecklist } from "./replacement";
import { addWeeks, weekLabel, weekStart } from "./sales";
import { accountsOf, currentAccount, isWarmupRunning, phoneLabel, profileShortLabel, warmupOf } from "./selectors";
import type { Db } from "./store";
import { readStructure, type StructureKey } from "./structure";
import type { Account, Avatar, TaskPriority, Warmup } from "./types";
import { avatarsMissingSales } from "./warnings";
import { warmupInfo, type WarmupInfo } from "./warmup";

export type AutoKind = "estrutura" | "aquecimento" | "reposicao" | "vendas" | "funil" | "video";

/** O que concluir a tarefa marca de verdade. */
export type AutoTarget =
  | { kind: "estrutura"; avatarId: string; step: StructureKey }
  | { kind: "aquecimento"; warmupId: string; day: number }
  | { kind: "reposicao"; accountId: string; item: string }
  | { kind: "funil"; avatarId: string; funnelId: string; stepId: string }
  | { kind: "video"; avatarId: string; videoId: string };

export interface AutoTask {
  /** Estável: o mesmo assunto tem sempre a mesma chave. */
  key: string;
  kind: AutoKind;
  title: string;
  /** null = de vários avatares (ex.: as vendas da semana). */
  avatarId: string | null;
  /** AAAA-MM-DD ou null (sem prazo). */
  due: string | null;
  priority: TaskPriority;
  /** Por que ela aparece agora. */
  reason: string;
  /** Onde fazer. */
  href: string;
  /** null = não dá para marcar daqui (só abrir o lugar). */
  target: AutoTarget | null;
  /** Entra na lista de hoje. */
  today: boolean;
  /** Estrutura de um avatar cuja conta descansa hoje (o melhor dia para adiantar). */
  restDay: boolean;
}

const STRUCTURE_TITLES: Record<StructureKey, string> = {
  site: "Fazer o site de vendas",
  entregavel: "Preparar o entregável",
  checkout: "Configurar o checkout",
  automacao: "Montar a automação",
};

function avatarHref(avatar: Avatar, aba?: string): string {
  return `/avatar?id=${avatar.id}${aba ? `&aba=${aba}` : ""}`;
}

function runningInfo(db: Db, account: Account, today: string): { warmup: Warmup; info: WarmupInfo } | null {
  const warmup = warmupOf(db, account.id);
  if (!warmup || !isWarmupRunning(account, warmup)) return null;
  return { warmup, info: warmupInfo(warmup, today) };
}

/** A conta "de agora" de um avatar ativo, e em que pé ela está para a estrutura. */
function structureContext(
  db: Db,
  avatar: Avatar,
  today: string,
): { due: string | null; priority: TaskPriority; reason: string; restToday: boolean } | null {
  const account = currentAccount(accountsOf(db, avatar.id));
  if (!account) return null;
  const marked = readStructure(avatar.kit).some((step) => step.done);
  if (account.status === "ativa") {
    // (avatar sem nenhum passo marcado não é cobrado: já vendia antes de a estrutura existir no painel)
    return marked ? { due: today, priority: 1, reason: `@${account.handle} já está no ar.`, restToday: false } : null;
  }
  if (account.status !== "aquecendo") return null;
  const running = runningInfo(db, account, today);
  if (!running) return { due: null, priority: 3, reason: `@${account.handle} está aquecendo (sem calendário).`, restToday: false };
  const { info } = running;
  if (info.phase === "concluido") {
    return { due: today, priority: 1, reason: `O aquecimento de @${account.handle} terminou: a conta está pronta.`, restToday: false };
  }
  const restToday = Boolean(info.today && !info.today.use);
  const left = info.daysLeft;
  const when = left <= 0 ? "hoje" : left === 1 ? "amanhã" : `em ${left} dias (${formatWeekdayDate(info.endDate)})`;
  return {
    due: info.endDate,
    priority: left <= 3 ? 2 : 3,
    reason: restToday
      ? `@${account.handle} descansa hoje: bom dia para adiantar. A conta fica pronta ${when}.`
      : `@${account.handle} fica pronta ${when}.`,
    restToday,
  };
}

/** Todas as tarefas que o painel sugere hoje, das mais urgentes para as menos. */
export function buildAutoTasks(db: Db, today: string): AutoTask[] {
  const list: AutoTask[] = [];
  const active = db.avatars.filter((avatar) => avatar.status === "ativo");

  // --- estrutura: site, entregável, checkout e automação
  for (const avatar of active) {
    const pending = readStructure(avatar.kit).filter((step) => !step.done);
    if (pending.length === 0) continue;
    const context = structureContext(db, avatar, today);
    if (!context) continue;
    for (const step of pending) {
      list.push({
        key: `estrutura:${avatar.id}:${step.key}`,
        kind: "estrutura",
        title: STRUCTURE_TITLES[step.key],
        avatarId: avatar.id,
        due: context.due,
        priority: context.priority,
        reason: context.reason,
        href: avatarHref(avatar),
        target: { kind: "estrutura", avatarId: avatar.id, step: step.key },
        today: context.restToday || (context.due !== null && context.due <= today),
        restDay: context.restToday,
      });
    }
  }

  // --- aquecimento: a conta para usar hoje, e os dias que ficaram para trás
  for (const warmup of db.warmups) {
    const account = db.accounts.find((item) => item.id === warmup.account_id);
    const avatar = account ? db.avatars.find((item) => item.id === account.avatar_id) : undefined;
    if (!account || !avatar || !isWarmupRunning(account, warmup)) continue;
    const info = warmupInfo(warmup, today);
    if (info.late.length > 0) {
      const first = info.late[0];
      list.push({
        key: `aquecimento-atrasado:${warmup.id}:${first.n}`,
        kind: "aquecimento",
        title: `Resolver o aquecimento atrasado de @${account.handle}`,
        avatarId: avatar.id,
        due: first.date,
        priority: 1,
        reason:
          info.late.length === 1
            ? `O dia ${first.n} passou sem ser marcado: fez ou não fez?`
            : `${info.late.length} dias de uso passaram sem ser marcados.`,
        href: "/",
        target: null,
        today: true,
        restDay: false,
      });
    }
    const day = info.today;
    if (day?.use && !day.done) {
      const phone = db.phones.find((item) => item.id === account.phone_id);
      const profile = db.profiles.find((item) => item.id === account.profile_id);
      list.push({
        key: `aquecimento:${warmup.id}:${day.n}`,
        kind: "aquecimento",
        title: `Usar @${account.handle} por ${day.minutes} min`,
        avatarId: avatar.id,
        due: today,
        priority: 2,
        reason: [
          `Aquecimento, dia ${day.n} de ${info.totalDays}`,
          phone ? phoneLabel(phone) : "",
          profile ? profileShortLabel(profile) : "",
          day.task.trim(),
        ]
          .filter(Boolean)
          .join(" · "),
        href: avatarHref(avatar, "aquecimento"),
        target: { kind: "aquecimento", warmupId: warmup.id, day: day.n },
        today: true,
        restDay: false,
      });
    }
  }

  // --- reposição: o que falta do checklist da conta nova
  for (const account of db.accounts) {
    if (account.status === "caida") continue;
    const progress = checklistProgress(readChecklist(account.checklist));
    if (progress.total === 0 || progress.complete) continue;
    const avatar = db.avatars.find((item) => item.id === account.avatar_id);
    if (!avatar) continue;
    for (const item of progress.pending) {
      list.push({
        key: `reposicao:${account.id}:${item.key}`,
        kind: "reposicao",
        // (os passos do checklist são curtos — "Bio", "Destaques" —: o título diz de onde vêm)
        title: `Reposição: ${item.label}`,
        avatarId: avatar.id,
        due: null,
        priority: 2,
        reason: `Conta nova de @${account.handle}: faltam ${progress.pending.length} de ${progress.total} passos da reposição.`,
        href: avatarHref(avatar, "conta"),
        target: { kind: "reposicao", accountId: account.id, item: item.key },
        today: true,
        restDay: false,
      });
    }
  }

  // --- vendas da semana passada sem lançamento
  const lastWeek = addWeeks(weekStart(today), -1);
  const missing = avatarsMissingSales(db, lastWeek);
  if (missing.length > 0) {
    list.push({
      key: `vendas:${lastWeek}`,
      kind: "vendas",
      title: "Lançar as vendas da semana passada",
      avatarId: missing.length === 1 ? missing[0].id : null,
      due: today,
      priority: 2,
      reason: `Semana de ${weekLabel(lastWeek, today)}: ${missing.map((avatar) => avatar.name).join(", ")}.`,
      href: `/vendas?semana=${lastWeek}`,
      target: null,
      today: true,
      restDay: false,
    });
  }

  // --- funis para modelar: o próximo passo de cada modelo
  for (const avatar of active) {
    for (const model of readFunnels(avatar.kit)) {
      const index = model.steps.findIndex((step) => !step.done);
      if (index < 0) continue;
      const step = model.steps[index];
      list.push({
        key: `funil:${avatar.id}:${model.id}:${step.id}`,
        kind: "funil",
        title: `Modelar: ${stepLabel(step)}`,
        avatarId: avatar.id,
        due: null,
        priority: 4,
        reason: `Funil de ${model.name || "modelo sem nome"} · passo ${index + 1} de ${model.steps.length}.`,
        href: avatarHref(avatar, "funis"),
        target: { kind: "funil", avatarId: avatar.id, funnelId: model.id, stepId: step.id },
        today: false,
        restDay: false,
      });
    }
  }

  // --- vídeos para modelar
  for (const avatar of active) {
    for (const video of avatar.model_videos ?? []) {
      if (video.status !== "a_modelar") continue;
      list.push({
        key: `video:${avatar.id}:${video.id}`,
        kind: "video",
        title: `Modelar o vídeo: ${video.label}`,
        avatarId: avatar.id,
        due: null,
        priority: 4,
        reason: video.note?.trim() || "Vídeo para modelar.",
        href: avatarHref(avatar, "videos"),
        target: { kind: "video", avatarId: avatar.id, videoId: video.id },
        today: false,
        restDay: false,
      });
    }
  }

  return list.sort(compareAuto);
}

/**
 * Primeiro as de hoje, depois pela data (sem data por último) e pela prioridade.
 * No empate fica a ordem em que foram montadas: os passos da estrutura e do
 * checklist na ordem em que são feitos (site → entregável → checkout → automação).
 */
export function compareAuto(a: AutoTask, b: AutoTask): number {
  return (
    Number(b.today) - Number(a.today) ||
    (a.due ?? "9999-99-99").localeCompare(b.due ?? "9999-99-99") ||
    a.priority - b.priority
  );
}

/**
 * O próximo dia de descanso da conta que está aquecendo (o melhor dia para
 * adiantar o que é daquele avatar). null quando não há calendário em andamento.
 */
export function nextRestDay(db: Db, avatarId: string, today: string): { date: string; handle: string } | null {
  const account = currentAccount(accountsOf(db, avatarId));
  if (!account || account.status !== "aquecendo") return null;
  const running = runningInfo(db, account, today);
  if (!running || running.info.phase === "concluido") return null;
  const day = [...running.warmup.days]
    .sort((a, b) => a.n - b.n)
    .find((entry) => !entry.use && isValidISODate(entry.date) && entry.date > today);
  return day ? { date: day.date, handle: account.handle } : null;
}

/** Os avatares cuja conta descansa hoje e que ainda têm estrutura por montar (a "dica do dia"). */
export function restingWithStructure(db: Pick<Db, "avatars">, tasks: readonly AutoTask[]): Avatar[] {
  const ids = new Set(tasks.filter((task) => task.restDay).map((task) => task.avatarId));
  return db.avatars.filter((avatar) => ids.has(avatar.id));
}
