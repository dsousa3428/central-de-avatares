// Vendas pela Stripe — as regras que rodam no navegador, sem tela e sem rede:
// descobrir de que avatar é cada link de pagamento, juntar as vendas por semana
// e montar a lista do que muda no painel.
//
// Como o painel sabe de quem é cada venda: o dono cola o link de pagamento da
// Stripe (buy.stripe.com/…) nos links do avatar — no campo Checkout, ou num link
// extra quando o avatar tem mais de um. A Stripe diz por qual link cada venda
// entrou; o painel compara os endereços.

import { toISODate } from "./dates";
import type { Rates } from "./sales";
import { weekStart } from "./sales";
import type { Avatar, WeeklySale } from "./types";

/** Um link de pagamento da conta Stripe. */
export interface StripeLink {
  id: string;
  url: string;
  active: boolean;
}

/** Uma venda paga: t = quando (segundos desde 1970) · a = valor na menor unidade da moeda · c = moeda, em minúsculas. */
export interface StripeSale {
  t: number;
  a: number;
  c: string;
}

// ---------------------------------------------------------------------------
// De que avatar é cada link
// ---------------------------------------------------------------------------

/**
 * O endereço em forma comparável: sem "https://", sem "www.", sem barra no fim e
 * sem o que vem depois de ? ou # (o mesmo link de pagamento pode ser divulgado com
 * ?utm_source=…, ?prefilled_email=… e continua sendo o mesmo link).
 */
export function linkKey(url: string | null | undefined): string | null {
  const text = (url ?? "").trim();
  if (!text) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(text);
  // "mailto:…", "tel:…" e parecidos não são endereços de página ("site.com:8080/x" é: depois dos dois-pontos vem a porta)
  if (!withScheme && /^[a-z][a-z0-9+.-]*:(?!\d)/i.test(text)) return null;
  let parsed: URL;
  try {
    parsed = new URL(withScheme ? text : `https://${text}`);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
  const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
  if (!host) return null;
  // (o caminho fica como está: no endereço da Stripe, maiúsculas e minúsculas são letras diferentes)
  return `${host}${parsed.pathname.replace(/\/+$/, "")}`;
}

/** Todos os links cadastrados num avatar em que pode estar o link de pagamento. */
function avatarLinkKeys(avatar: Pick<Avatar, "checkout_url" | "sales_site_url" | "extra_links">): Set<string> {
  const keys = new Set<string>();
  const urls = [avatar.checkout_url, avatar.sales_site_url, ...(avatar.extra_links ?? []).map((link) => link?.url)];
  for (const url of urls) {
    const key = linkKey(url);
    if (key) keys.add(key);
  }
  return keys;
}

export interface LinkMatching {
  /** id do link → id do avatar dono dele (só os links que estão em um avatar só). */
  owner: Map<string, string>;
  /** id do avatar → os links de pagamento dele. */
  byAvatar: Map<string, StripeLink[]>;
  /** Links que estão em mais de um avatar: não dá para saber de quem é a venda. */
  shared: Array<{ link: StripeLink; avatarIds: string[] }>;
  /** Links da conta Stripe que nenhum avatar usa. */
  unused: StripeLink[];
}

export function matchLinks(
  avatars: ReadonlyArray<Pick<Avatar, "id" | "checkout_url" | "sales_site_url" | "extra_links">>,
  links: readonly StripeLink[],
): LinkMatching {
  const keysOf = avatars.map((avatar) => ({ id: avatar.id, keys: avatarLinkKeys(avatar) }));
  const matching: LinkMatching = { owner: new Map(), byAvatar: new Map(), shared: [], unused: [] };
  for (const link of links) {
    const key = linkKey(link.url);
    const owners = key ? keysOf.filter((avatar) => avatar.keys.has(key)).map((avatar) => avatar.id) : [];
    if (owners.length === 0) {
      matching.unused.push(link);
    } else if (owners.length > 1) {
      matching.shared.push({ link, avatarIds: owners });
    } else {
      matching.owner.set(link.id, owners[0]);
      matching.byAvatar.set(owners[0], [...(matching.byAvatar.get(owners[0]) ?? []), link]);
    }
  }
  return matching;
}

// ---------------------------------------------------------------------------
// Semanas e valores
// ---------------------------------------------------------------------------

/** A semana (a segunda-feira, AAAA-MM-DD) em que cai um instante, no horário do aparelho. */
export function weekOfTimestamp(seconds: number): string {
  return weekStart(toISODate(new Date(seconds * 1000)));
}

/** O instante (segundos desde 1970) em que um dia começa, no horário do aparelho. */
export function startOfDay(iso: string): number {
  const [year, month, day] = iso.slice(0, 10).split("-").map(Number);
  return Math.floor(new Date(year, month - 1, day).getTime() / 1000);
}

// A Stripe manda os valores na menor unidade da moeda: 2700 = € 27,00. Algumas moedas
// não têm centavos (2700 ienes = ¥ 2700) e algumas têm três casas.
// (UGX fica de fora de propósito: a Stripe a representa com duas casas, sempre "00".)
const NO_DECIMALS = new Set(["BIF", "CLP", "DJF", "GNF", "JPY", "KMF", "KRW", "MGA", "PYG", "RWF", "VND", "VUV", "XAF", "XOF", "XPF"]);
const THREE_DECIMALS = new Set(["BHD", "JOD", "KWD", "OMR", "TND"]);

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** O valor "por extenso" (27 para 2700 centavos de euro), com as duas casas que o painel guarda. */
export function fromMinorUnits(amount: number, currency: string): number {
  const code = currency.toUpperCase();
  const digits = NO_DECIMALS.has(code) ? 0 : THREE_DECIMALS.has(code) ? 3 : 2;
  return round2(amount / 10 ** digits);
}

/** As vendas de um avatar numa semana em uma moeda. */
export interface MoneyPart {
  currency: string;
  amount: number;
  count: number;
}

/** O que a Stripe diz que um avatar vendeu numa semana (uma parte por moeda, em ordem alfabética). */
export interface StripeWeek {
  avatarId: string;
  week: string;
  parts: MoneyPart[];
}

/** Junta as vendas de cada link no avatar dono dele, por semana e por moeda. */
export function weeklyFromStripe(
  salesByLink: ReadonlyMap<string, readonly StripeSale[]>,
  owner: ReadonlyMap<string, string>,
  weekOf: (seconds: number) => string = weekOfTimestamp,
): StripeWeek[] {
  // (soma na menor unidade — números inteiros — e só converte no fim: sem erro de centavos)
  const totals = new Map<string, { avatarId: string; week: string; minor: Map<string, { minor: number; count: number }> }>();
  for (const [linkId, sales] of salesByLink) {
    const avatarId = owner.get(linkId);
    if (!avatarId) continue;
    for (const sale of sales) {
      const week = weekOf(sale.t);
      const key = `${avatarId}:${week}`;
      let entry = totals.get(key);
      if (!entry) {
        entry = { avatarId, week, minor: new Map() };
        totals.set(key, entry);
      }
      const code = sale.c.toUpperCase();
      const part = entry.minor.get(code) ?? { minor: 0, count: 0 };
      part.minor += sale.a;
      part.count += 1;
      entry.minor.set(code, part);
    }
  }
  return [...totals.values()].map((entry) => ({
    avatarId: entry.avatarId,
    week: entry.week,
    parts: [...entry.minor.entries()]
      .map(([currency, part]) => ({ currency, amount: fromMinorUnits(part.minor, currency), count: part.count }))
      .sort((a, b) => a.currency.localeCompare(b.currency)),
  }));
}

/** O lançamento que resulta das vendas de uma semana (o painel guarda um valor e uma moeda por semana). */
export interface Settled extends MoneyPart {
  /** true = havia mais de uma moeda e elas foram somadas pelas cotações do painel. */
  converted: boolean;
  /** Vendas em outras moedas que ficaram de fora, por falta de cotação. */
  left: MoneyPart[];
}

/**
 * Uma semana com vendas em mais de uma moeda (dois links com preços em moedas
 * diferentes, por exemplo) vira um lançamento só:
 *  - se todas as moedas têm cotação em Vendas → Cotações, tudo é somado na moeda
 *    de maior valor (o total em reais fica igual ao de lançamentos separados);
 *  - se falta alguma cotação, fica a moeda com mais vendas e as outras ficam de
 *    fora (`left`) — a tela avisa, e na próxima atualização, já com a cotação
 *    digitada, o valor é corrigido.
 */
export function settle(parts: readonly MoneyPart[], rates: Rates): Settled {
  if (parts.length === 1) return { ...parts[0], converted: false, left: [] };
  const rateOf = (code: string) => (code === "BRL" ? 1 : rates[code]);
  const byCode = (a: MoneyPart, b: MoneyPart) => a.currency.localeCompare(b.currency);
  if (parts.every((part) => rateOf(part.currency) > 0)) {
    const inBRL = (part: MoneyPart) => part.amount * rateOf(part.currency);
    const main = [...parts].sort((a, b) => inBRL(b) - inBRL(a) || byCode(a, b))[0];
    const total = parts.reduce((sum, part) => sum + inBRL(part), 0);
    return {
      currency: main.currency,
      amount: round2(total / rateOf(main.currency)),
      count: parts.reduce((sum, part) => sum + part.count, 0),
      converted: true,
      left: [],
    };
  }
  const main = [...parts].sort((a, b) => b.count - a.count || b.amount - a.amount || byCode(a, b))[0];
  return { ...main, converted: false, left: parts.filter((part) => part !== main) };
}

// ---------------------------------------------------------------------------
// O que muda no painel
// ---------------------------------------------------------------------------

/** new = semana sem lançamento · change = o lançamento do painel está diferente da Stripe · zero = semana passada sem nenhuma venda */
export type PlanKind = "new" | "change" | "zero";

export interface PlanRow {
  key: string;
  avatarId: string;
  week: string;
  kind: PlanKind;
  /** O que está lançado no painel hoje (null = nada). */
  current: { amount: number; currency: string; count: number | null } | null;
  /** O que fica depois de atualizar. */
  next: MoneyPart;
  converted: boolean;
  left: MoneyPart[];
}

export interface Plan {
  /** Da semana mais recente para a mais antiga. */
  rows: PlanRow[];
  /** Quantos lançamentos do painel já estavam iguais aos da Stripe. */
  same: number;
}

export interface ZeroCandidate {
  avatarId: string;
  week: string;
  currency: string;
}

/**
 * Compara o que a Stripe diz com o que está lançado no painel.
 *
 * Semana sem venda na Stripe não mexe em nada — o lançamento que estiver no
 * painel continua (pode ter vindo de outro lugar). A exceção é `zeros`: os
 * avatares ligados à Stripe que o painel cobraria por não terem lançamento na
 * semana passada ganham um "0", que é o que a Stripe está dizendo.
 */
export function buildPlan(input: {
  weeks: readonly StripeWeek[];
  sales: ReadonlyArray<Pick<WeeklySale, "avatar_id" | "week_start" | "amount" | "currency" | "sales_count">>;
  rates: Rates;
  zeros?: readonly ZeroCandidate[];
}): Plan {
  const existing = new Map(input.sales.map((sale) => [`${sale.avatar_id}:${sale.week_start}`, sale]));
  const rows: PlanRow[] = [];
  const seen = new Set<string>();
  let same = 0;

  for (const week of input.weeks) {
    if (week.parts.length === 0) continue;
    const key = `${week.avatarId}:${week.week}`;
    seen.add(key);
    const { converted, left, ...next } = settle(week.parts, input.rates);
    const sale = existing.get(key);
    if (!sale) {
      rows.push({ key, avatarId: week.avatarId, week: week.week, kind: "new", current: null, next, converted, left });
      continue;
    }
    const current = { amount: Number(sale.amount), currency: sale.currency.toUpperCase(), count: sale.sales_count ?? null };
    if (current.currency === next.currency && Math.abs(current.amount - next.amount) < 0.005 && current.count === next.count) {
      same += 1;
      continue;
    }
    rows.push({ key, avatarId: week.avatarId, week: week.week, kind: "change", current, next, converted, left });
  }

  for (const zero of input.zeros ?? []) {
    const key = `${zero.avatarId}:${zero.week}`;
    if (seen.has(key) || existing.has(key)) continue;
    seen.add(key);
    rows.push({
      key,
      avatarId: zero.avatarId,
      week: zero.week,
      kind: "zero",
      current: null,
      next: { currency: zero.currency.toUpperCase(), amount: 0, count: 0 },
      converted: false,
      left: [],
    });
  }

  rows.sort((a, b) => b.week.localeCompare(a.week) || a.avatarId.localeCompare(b.avatarId));
  return { rows, same };
}
