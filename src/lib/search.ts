// Busca global: encontra avatares, contas, celulares, perfis anti-detect e países
// pelo que o dono lembra (um @, um nome, um e-mail, o número de um perfil…).
// Regras puras (sem tela e sem banco). Nunca olha o cofre de senhas.

import { generationLabel, phoneLabel, profileLabel } from "./selectors";
import type { Db } from "./store";

export type SearchKind = "avatar" | "conta" | "celular" | "perfil" | "pais";

export interface SearchResult {
  kind: SearchKind;
  id: string;
  title: string;
  subtitle: string;
  /** Para onde o resultado leva. */
  href: string;
  /** Quando a busca bateu fora do título: em que campo e com que texto ("e-mail: conta@exemplo.com"). */
  match: string | null;
}

/** Minúsculas, sem acentos e sem espaços nas pontas: "José  " → "jose". */
export function foldText(text: string | null | undefined): string {
  return (text ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLocaleLowerCase("pt-BR")
    .trim();
}

interface Field {
  label: string | null; // null = é o próprio título
  text: string | null | undefined;
  /** Peso do campo: quanto maior, mais para cima o resultado aparece. */
  weight: number;
}

/**
 * A nota de um item para a busca: todas as palavras digitadas precisam aparecer
 * em algum campo. Bater no começo de um campo vale mais que bater no meio; campo
 * igual ao que foi digitado vale mais ainda. 0 = não encontrou.
 */
function scoreOf(fields: Field[], words: string[]): { score: number; match: string | null } {
  let total = 0;
  let shown: string | null = null;
  for (const word of words) {
    let best = 0;
    let bestField: Field | null = null;
    for (const field of fields) {
      const text = foldText(field.text);
      if (!text) continue;
      const at = text.indexOf(word);
      if (at < 0) continue;
      const startsWord = at === 0 || /[^a-z0-9]/.test(text[at - 1]);
      const points = field.weight * (text === word ? 4 : at === 0 ? 3 : startsWord ? 2 : 1);
      if (points > best) {
        best = points;
        bestField = field;
      }
    }
    if (best === 0 || !bestField) return { score: 0, match: null };
    total += best;
    if (bestField.label && bestField.text && !shown) shown = `${bestField.label}: ${bestField.text.trim()}`;
  }
  return { score: total, match: shown };
}

const KIND_ORDER: Record<SearchKind, number> = { avatar: 0, conta: 1, celular: 2, perfil: 3, pais: 4 };

/** Procura em tudo. Devolve os melhores resultados primeiro (no máximo `limit`). */
export function searchAll(db: Db, query: string, limit = 40): SearchResult[] {
  const words = foldText(query)
    .split(/\s+/)
    .map((word) => word.replace(/^@+/, ""))
    .filter(Boolean);
  if (words.length === 0) return [];

  const found: Array<SearchResult & { score: number }> = [];
  // `bonus` só desempata entre resultados igualmente bons (ex.: a conta viva antes da que caiu)
  const add = (result: SearchResult, fields: Field[], bonus = 0) => {
    const { score, match } = scoreOf(fields, words);
    if (score > 0) found.push({ ...result, match, score: score + bonus });
  };
  const countryOf = (id: string) => db.countries.find((country) => country.id === id);
  const flagged = (id: string) => {
    const country = countryOf(id);
    return country ? `${country.flag ? `${country.flag} ` : ""}${country.name}` : "";
  };

  for (const avatar of db.avatars) {
    add(
      {
        kind: "avatar",
        id: avatar.id,
        title: avatar.name,
        subtitle: [flagged(avatar.country_id), avatar.niche].filter(Boolean).join(" · "),
        href: `/avatar?id=${avatar.id}`,
        match: null,
      },
      [
        { label: null, text: avatar.name, weight: 10 },
        { label: "nicho", text: avatar.niche, weight: 3 },
        { label: "produto", text: avatar.product_name, weight: 3 },
        { label: "anotações", text: avatar.notes, weight: 1 },
      ],
    );
  }

  for (const account of db.accounts) {
    const avatar = db.avatars.find((item) => item.id === account.avatar_id);
    if (!avatar) continue;
    const current = !db.accounts.some(
      (other) => other.avatar_id === account.avatar_id && other.status !== "caida" && other.generation > account.generation,
    );
    const live = account.status !== "caida";
    add(
      {
        kind: "conta",
        id: account.id,
        title: `@${account.handle}`,
        subtitle: `${avatar.name} · ${generationLabel(account.generation)}${live ? "" : " · caída"}`,
        // a conta atual abre na aba dela; as outras, no histórico do avatar
        href: `/avatar?id=${avatar.id}&aba=${live && current ? "conta" : "historico"}`,
        match: null,
      },
      [
        { label: null, text: account.handle, weight: 9 },
        { label: "e-mail", text: account.email, weight: 6 },
        { label: "proxy", text: account.proxy, weight: 4 },
        { label: "motivo da queda", text: account.fall_reason, weight: 1 },
        { label: "anotações", text: account.notes, weight: 1 },
      ],
      // com o mesmo @ em várias gerações: a conta viva primeiro, depois da mais nova para a mais antiga
      (live ? 0.5 : 0) + Math.min(account.generation, 400) / 1000,
    );
  }

  for (const phone of db.phones) {
    add(
      { kind: "celular", id: phone.id, title: phoneLabel(phone), subtitle: phone.number ?? "Celular", href: "/infraestrutura", match: null },
      [
        { label: null, text: phone.nickname, weight: 8 },
        { label: null, text: phone.model, weight: 5 },
        { label: "número", text: phone.number, weight: 5 },
        { label: "observação", text: phone.notes, weight: 1 },
      ],
    );
  }

  for (const profile of db.profiles) {
    add(
      {
        kind: "perfil",
        id: profile.id,
        title: profileLabel(profile),
        subtitle: profile.proxy ?? "Perfil anti-detect",
        href: "/infraestrutura",
        match: null,
      },
      [
        { label: null, text: profile.number, weight: 8 },
        { label: null, text: `perfil ${profile.number}`, weight: 8 },
        { label: null, text: profile.name, weight: 6 },
        { label: "proxy", text: profile.proxy, weight: 4 },
        { label: "observação", text: profile.notes, weight: 1 },
      ],
    );
  }

  for (const country of db.countries) {
    add(
      {
        kind: "pais",
        id: country.id,
        title: `${country.flag ? `${country.flag} ` : ""}${country.name}`,
        subtitle: [country.language, country.currency].filter(Boolean).join(" · "),
        href: "/paises",
        match: null,
      },
      [
        { label: null, text: country.name, weight: 7 },
        { label: "idioma", text: country.language, weight: 2 },
        { label: "tag", text: (country.warmup_tags ?? []).join(" "), weight: 2 },
      ],
    );
  }

  return found
    .sort((a, b) => b.score - a.score || KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.title.localeCompare(b.title, "pt-BR"))
    .slice(0, limit)
    .map(({ kind, id, title, subtitle, href, match }) => ({ kind, id, title, subtitle, href, match }));
}
