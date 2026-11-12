// Avisos automáticos: tudo que o painel percebe sozinho e que merece atenção.
// Regras puras (sem tela e sem banco) — a tela Hoje mostra a lista.
//
// Cada aviso tem um `id` estável: o mesmo problema gera sempre o mesmo id. É por
// ele que um aviso é "dispensado" (`settings.prefs.ignored_warnings`); quando a
// situação muda (ex.: mais uma conta passa a usar o mesmo celular) o id muda e o
// aviso volta a aparecer.

import { formatDate, formatDayMonth } from "./dates";
import { checklistProgress, readChecklist } from "./replacement";
import { addWeeks, weekEnd, weekLabel, weekStart } from "./sales";
import { pendingLabels, structureProgress } from "./structure";
import {
  avatarsWithoutLiveAccount,
  currentAccount,
  generationLabel,
  normalizeProxy,
  phoneLabel,
  profileShortLabel,
  runningWarmups,
  usageByPhone,
  usageByProfile,
  usageByProxy,
  warmingWithoutPlan,
  type Usage,
} from "./selectors";
import type { Db } from "./store";
import type { Account, AppPrefs, Avatar } from "./types";

export type WarningKind =
  | "recurso_duplicado" // o mesmo celular / perfil / proxy em duas contas vivas
  | "recurso_de_caida" // conta viva usando celular / perfil / proxy de uma conta que caiu
  | "avatar_sem_conta" // avatar ativo sem nenhuma conta em operação
  | "aquecimento_atrasado" // dia de uso do aquecimento que passou sem ser marcado
  | "sem_calendario" // conta "aquecendo" sem calendário de aquecimento
  | "semana_sem_vendas" // avatares ativos sem lançamento de vendas na semana passada
  | "pronta" // aquecimento concluído: conta pronta para operar
  | "estrutura_pendente" // o aquecimento terminou e ainda falta site, entregável, checkout ou automação
  | "reposicao_pendente"; // checklist de reposição com itens por fazer

/** danger = risco para as contas · warn = algo ficou para trás · info = lembrete · good = boa notícia */
export type WarningLevel = "danger" | "warn" | "info" | "good";

export interface Warning {
  id: string;
  kind: WarningKind;
  level: WarningLevel;
  title: string;
  text: string;
  /** Para onde o toque leva. */
  href: string;
  /** O que o toque faz, em uma ou duas palavras. */
  action: string;
  /** Os avatares a que o aviso diz respeito. */
  avatarIds: string[];
  /** As contas a que o aviso diz respeito (vazio quando ele é sobre o avatar, ou sobre vários de uma vez). */
  accountIds: string[];
}

const LEVEL_ORDER: Record<WarningLevel, number> = { danger: 0, warn: 1, info: 2, good: 3 };

function accountHref(avatarId: string): string {
  return `/avatar?id=${avatarId}&aba=conta`;
}

function joinList(items: string[], max = 3): string {
  const shown = items.slice(0, max);
  const rest = items.length - shown.length;
  if (rest > 0) return `${shown.join(", ")} e mais ${rest}`;
  if (shown.length <= 1) return shown.join("");
  return `${shown.slice(0, -1).join(", ")} e ${shown[shown.length - 1]}`;
}

type Resource = "celular" | "perfil" | "proxy";

const RESOURCE: Record<Resource, { one: string; article: string; bare: string }> = {
  celular: { one: "Celular", article: "um celular", bare: "celular" },
  perfil: { one: "Perfil anti-detect", article: "um perfil anti-detect", bare: "perfil" },
  proxy: { one: "Proxy", article: "um proxy", bare: "proxy" },
};

/** O que uma conta viva está usando e que já foi de uma conta caída. */
interface Reused {
  type: Resource;
  key: string;
  name: string;
  fallenIds: string[];
  /** De quem era, por extenso: "Fra' Salvio · @fra.salvio (1ª geração), caída em 03/11/2026". */
  from: string;
}

/**
 * Os avatares ativos que deveriam ter um lançamento de vendas numa semana e não têm.
 * Só quem tinha conta no ar naquela semana: criada até o domingo e ainda de pé na
 * segunda. (Avatar novo, ou que passou a semana inteira sem conta, não tinha o que lançar.)
 */
export function avatarsMissingSales(db: Pick<Db, "avatars" | "accounts" | "sales">, week: string): Avatar[] {
  const lastDay = weekEnd(week);
  const launched = new Set(db.sales.filter((sale) => sale.week_start === week).map((sale) => sale.avatar_id));
  return db.avatars.filter(
    (avatar) =>
      avatar.status === "ativo" &&
      !launched.has(avatar.id) &&
      db.accounts.some(
        (account) =>
          account.avatar_id === avatar.id &&
          account.created_on <= lastDay &&
          (account.status !== "caida" || (account.fell_on !== null && account.fell_on >= week)),
      ),
  );
}

export function buildWarnings(db: Db, today: string): Warning[] {
  const warnings: Warning[] = [];
  const avatarOf = (account: Account) => db.avatars.find((avatar) => avatar.id === account.avatar_id);
  const who = (account: Account) => {
    const avatar = avatarOf(account);
    return `${avatar ? `${avatar.name} · ` : ""}@${account.handle} (${generationLabel(account.generation)})`;
  };
  const avatarIdsOf = (accounts: Account[]) => [...new Set(accounts.map((account) => account.avatar_id))];
  const newest = (accounts: Account[]) =>
    [...accounts].sort((a, b) => b.created_on.localeCompare(a.created_on) || b.generation - a.generation)[0];

  // --- o mesmo celular, perfil ou proxy em duas contas ao mesmo tempo, ou igual ao de uma conta caída
  const resources: Array<{ type: Resource; usage: Map<string, Usage>; nameOf: (key: string) => string }> = [
    {
      type: "celular",
      usage: usageByPhone(db),
      nameOf: (key) => phoneLabel(db.phones.find((phone) => phone.id === key)),
    },
    {
      type: "perfil",
      usage: usageByProfile(db),
      nameOf: (key) => profileShortLabel(db.profiles.find((profile) => profile.id === key)),
    },
    {
      type: "proxy",
      usage: usageByProxy(db),
      nameOf: (key) =>
        db.accounts.find((account) => normalizeProxy(account.proxy) === key)?.proxy?.trim() ?? key,
    },
  ];
  const reusedBy = new Map<string, { account: Account; items: Reused[] }>();
  for (const { type, usage, nameOf } of resources) {
    const words = RESOURCE[type];
    for (const [key, { live, fallen }] of usage) {
      const name = nameOf(key);
      if (live.length >= 2) {
        const ids = live.map((account) => account.id).sort();
        warnings.push({
          id: `duplo:${type}:${key}:${ids.join("+")}`,
          kind: "recurso_duplicado",
          level: "danger",
          title: `${words.one} em ${live.length} contas ao mesmo tempo`,
          // (em ordem alfabética: o texto não muda de lugar conforme a ordem em que as contas foram carregadas)
          text: `${name}: ${joinList(live.map(who).sort((a, b) => a.localeCompare(b, "pt-BR")))}.`,
          href: accountHref(newest(live).avatar_id),
          action: "Ver conta",
          avatarIds: avatarIdsOf(live),
          accountIds: ids,
        });
      }
      if (fallen.length > 0) {
        const fallenIds = fallen.map((account) => account.id).sort();
        const from = joinList(
          fallen.map((account) => `${who(account)}${account.fell_on ? `, caída em ${formatDate(account.fell_on)}` : ""}`),
          2,
        );
        for (const account of live) {
          const entry = reusedBy.get(account.id) ?? { account, items: [] };
          // (o proxy aparece como está escrito nesta conta, não como estava na que caiu)
          const shown = type === "proxy" ? account.proxy?.trim() || name : name;
          entry.items.push({ type, key, name: shown, fallenIds, from });
          reusedBy.set(account.id, entry);
        }
      }
    }
  }
  // Um aviso só por conta viva, dizendo tudo o que ela usa e que já foi de conta caída
  // (quem reaproveitou celular, perfil e proxy da mesma conta não recebe três avisos).
  const reusing = [...reusedBy.values()].sort((a, b) => who(a.account).localeCompare(who(b.account), "pt-BR"));
  for (const { account, items } of reusing) {
    const what =
      items.length === 1 ? RESOURCE[items[0].type].article : joinList(items.map((item) => RESOURCE[item.type].bare));
    // o que veio da mesma conta caída é dito de uma vez só
    const sources = new Map<string, string[]>();
    for (const item of items) sources.set(item.from, [...(sources.get(item.from) ?? []), item.name]);
    const sentences = [...sources.entries()].map(
      ([from, names]) => `${joinList(names)} ${names.length === 1 ? "já foi" : "já foram"} de ${from}.`,
    );
    warnings.push({
      id: `caida:${account.id}:${items.map((item) => `${item.type}:${item.key}:${item.fallenIds.join("+")}`).join("|")}`,
      kind: "recurso_de_caida",
      level: "danger",
      title: `@${account.handle} usa ${what} de conta que caiu`,
      text: `${sentences.join(" ")} Reutilizar pode vincular as contas.`,
      href: accountHref(account.avatar_id),
      action: "Ver conta",
      avatarIds: avatarIdsOf([account]),
      accountIds: [account.id],
    });
  }

  // --- avatar ativo sem nenhuma conta em operação
  for (const avatar of avatarsWithoutLiveAccount(db)) {
    const had = db.accounts.some((account) => account.avatar_id === avatar.id);
    warnings.push({
      id: `semconta:${avatar.id}`,
      kind: "avatar_sem_conta",
      level: "danger",
      title: `${avatar.name} está sem conta em operação`,
      text: had ? "A última conta caiu. Suba uma nova geração para continuar." : "Avatar ativo que ainda não tem nenhuma conta.",
      href: accountHref(avatar.id),
      action: "Subir conta",
      avatarIds: [avatar.id],
      accountIds: [],
    });
  }

  // --- aquecimento: atrasado, concluído ou sem calendário
  for (const row of runningWarmups(db, today)) {
    const name = `${row.avatar.name} · @${row.account.handle}`;
    const href = `/avatar?id=${row.avatar.id}&aba=aquecimento`;
    if (row.info.late.length > 0) {
      const first = row.info.late[0];
      warnings.push({
        id: `atraso:${row.warmup.id}:${first.date}`,
        kind: "aquecimento_atrasado",
        level: "warn",
        title: `${name}: aquecimento atrasado`,
        text:
          row.info.late.length === 1
            ? `O dia ${first.n} (${formatDayMonth(first.date)}) passou sem ser marcado.`
            : `${row.info.late.length} dias de uso passaram sem ser marcados (desde ${formatDayMonth(first.date)}).`,
        href,
        action: "Resolver",
        avatarIds: [row.avatar.id],
        accountIds: [row.account.id],
      });
    } else if (row.info.phase === "concluido") {
      // a conta ficou pronta, mas o que ela vai vender ainda não: é a hora de avisar
      const structure = structureProgress(row.avatar.kit);
      if (!structure.complete) {
        warnings.push({
          id: `estrutura:${row.avatar.id}:${structure.pending.map((step) => step.key).join("+")}`,
          kind: "estrutura_pendente",
          level: "warn",
          title: `${row.avatar.name}: falta terminar a estrutura`,
          text: `O aquecimento de @${row.account.handle} terminou, mas ainda falta: ${pendingLabels(structure)}.`,
          href: `/avatar?id=${row.avatar.id}`,
          action: "Ver estrutura",
          avatarIds: [row.avatar.id],
          accountIds: [row.account.id],
        });
      }
      warnings.push({
        id: `pronta:${row.warmup.id}`,
        kind: "pronta",
        level: "good",
        title: `${name}: aquecimento concluído`,
        text: "Conta pronta para operar. Marque como ativa quando começar a postar.",
        href,
        action: "Ver",
        avatarIds: [row.avatar.id],
        accountIds: [row.account.id],
      });
    }
  }
  // --- conta já no ar com a estrutura começada e não terminada
  // (Avatar sem nenhum passo marcado fica de fora: quem já vendia antes de a estrutura existir
  // no painel não deve ser cobrado por ela. O id é o mesmo do aviso do fim do aquecimento:
  // dispensado lá, continua dispensado quando a conta é marcada como ativa.)
  for (const avatar of db.avatars) {
    if (avatar.status !== "ativo") continue;
    const structure = structureProgress(avatar.kit);
    if (structure.complete || structure.done === 0) continue;
    const account = currentAccount(db.accounts.filter((item) => item.avatar_id === avatar.id));
    if (!account || account.status !== "ativa") continue;
    warnings.push({
      id: `estrutura:${avatar.id}:${structure.pending.map((step) => step.key).join("+")}`,
      kind: "estrutura_pendente",
      level: "warn",
      title: `${avatar.name}: falta terminar a estrutura`,
      text: `@${account.handle} já está ativa, mas ainda falta: ${pendingLabels(structure)}.`,
      href: `/avatar?id=${avatar.id}`,
      action: "Ver estrutura",
      avatarIds: [avatar.id],
      accountIds: [account.id],
    });
  }

  for (const account of warmingWithoutPlan(db)) {
    const avatar = avatarOf(account);
    if (!avatar) continue;
    warnings.push({
      id: `semplano:${account.id}`,
      kind: "sem_calendario",
      level: "warn",
      title: `${avatar.name} · @${account.handle}: aquecendo sem calendário`,
      text: "A conta está em aquecimento, mas sem calendário de aquecimento.",
      href: `/avatar?id=${avatar.id}&aba=aquecimento`,
      action: "Iniciar",
      avatarIds: [avatar.id],
      accountIds: [account.id],
    });
  }

  // --- semana passada sem lançamento de vendas
  const lastWeek = addWeeks(weekStart(today), -1);
  const missing = avatarsMissingSales(db, lastWeek);
  if (missing.length > 0) {
    warnings.push({
      id: `vendas:${lastWeek}`,
      kind: "semana_sem_vendas",
      level: "warn",
      title: "Vendas da semana passada sem lançamento",
      text: `Semana de ${weekLabel(lastWeek, today)}: falta lançar ${joinList(missing.map((avatar) => avatar.name))}. Se não vendeu nada, lance 0.`,
      href: `/vendas?semana=${lastWeek}`,
      action: "Lançar",
      avatarIds: missing.map((avatar) => avatar.id),
      accountIds: [],
    });
  }

  // --- checklist de reposição com itens por fazer
  for (const account of db.accounts) {
    if (account.status === "caida") continue;
    const progress = checklistProgress(readChecklist(account.checklist));
    if (progress.total === 0 || progress.complete) continue;
    const avatar = avatarOf(account);
    if (!avatar) continue;
    warnings.push({
      id: `reposicao:${account.id}`,
      kind: "reposicao_pendente",
      level: "info",
      title: `${avatar.name} · @${account.handle}: reposição em andamento`,
      text: `${progress.pending.length === 1 ? "Falta 1 item" : `Faltam ${progress.pending.length} itens`} do checklist: ${joinList(
        progress.pending.map((item) => item.label),
      )}.`,
      href: accountHref(avatar.id),
      action: "Ver checklist",
      avatarIds: [avatar.id],
      accountIds: [account.id],
    });
  }

  return warnings
    .map((warning, index) => ({ warning, index }))
    .sort((a, b) => LEVEL_ORDER[a.warning.level] - LEVEL_ORDER[b.warning.level] || a.index - b.index)
    .map(({ warning }) => warning);
}

// ---------------------------------------------------------------------------
// Avisos dispensados
// ---------------------------------------------------------------------------

/** Os ids dispensados, lidos das preferências (ignora qualquer coisa que não seja texto). */
export function ignoredIds(prefs: AppPrefs | null | undefined): string[] {
  const raw = prefs?.ignored_warnings;
  return Array.isArray(raw) ? raw.filter((id): id is string => typeof id === "string" && id !== "") : [];
}

/** Separa os avisos em "à mostra" e "dispensados". */
export function splitWarnings(all: Warning[], ignored: readonly string[]): { active: Warning[]; dismissed: Warning[] } {
  const set = new Set(ignored);
  return { active: all.filter((warning) => !set.has(warning.id)), dismissed: all.filter((warning) => set.has(warning.id)) };
}

/**
 * A lista de dispensados depois de dispensar (ou trazer de volta) avisos. Ids de
 * avisos que não existem mais são descartados — a lista não cresce para sempre.
 */
export function nextIgnored(
  ignored: readonly string[],
  all: Warning[],
  change: { add?: readonly string[]; remove?: readonly string[] },
): string[] {
  const existing = new Set(all.map((warning) => warning.id));
  const next = new Set(ignored.filter((id) => existing.has(id)));
  for (const id of change.add ?? []) if (existing.has(id)) next.add(id);
  for (const id of change.remove ?? []) next.delete(id);
  return [...next].sort();
}

/** Os avisos que contam no número da navegação: riscos e pendências (não os lembretes nem as boas notícias). */
export function countAttention(active: Warning[]): number {
  return active.filter((warning) => warning.level === "danger" || warning.level === "warn").length;
}
