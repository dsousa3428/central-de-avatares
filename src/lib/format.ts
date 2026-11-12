import { twMerge } from "tailwind-merge";

/**
 * Junta classes CSS ignorando valores vazios. Quando duas classes brigam pelo
 * mesmo estilo (ex.: "w-full" e "w-16"), vale a que vem por último.
 */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return twMerge(parts.filter(Boolean).join(" "));
}

/** Identificador único para itens de listas (links, vídeos etc.). */
export function uid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Texto digitado -> texto limpo, ou null se ficou vazio. */
export function clean(value: string | null | undefined): string | null {
  const v = (value ?? "").trim();
  return v === "" ? null : v;
}

/**
 * Deixa só o nome da conta, em minúsculas:
 * "@Fra.Salvio", "instagram.com/fra.salvio/" e "https://www.instagram.com/fra.salvio?x=1" -> "fra.salvio"
 */
export function normalizeHandle(value: string): string {
  return value
    .trim()
    .replace(/^(https?:\/\/)?([a-z0-9-]+\.)*instagram\.com\//i, "")
    .replace(/^@+/, "")
    .replace(/[/?#].*$/, "")
    .replace(/\s+/g, "")
    .toLowerCase();
}

/** Garante que um link digitado sem "https://" funcione ao clicar. */
export function normalizeUrl(value: string | null | undefined): string | null {
  const v = clean(value);
  if (!v) return null;
  // já tem protocolo ("https://…", "tg://…") ou é um link de e-mail/telefone
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(v) || /^(mailto|tel):/i.test(v)) return v;
  return `https://${v}`;
}

/** Só aceita abrir links http(s) — evita "javascript:" e afins. */
export function safeHref(value: string | null | undefined): string | undefined {
  const v = normalizeUrl(value);
  if (!v) return undefined;
  return /^https?:\/\//i.test(v) ? v : undefined;
}

/** "https://www.exemplo.com/pagina?x=1" -> "exemplo.com/pagina" */
export function prettyUrl(value: string | null | undefined): string {
  const v = clean(value);
  if (!v) return "";
  return v
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .replace(/\/$/, "");
}

export function initials(name: string): string {
  const words = name
    .replace(/['’`]/g, "")
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

export function formatMoney(value: number | null | undefined, currency: string | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  const code = (currency || "").toUpperCase();
  try {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: code }).format(value);
  } catch {
    const n = new Intl.NumberFormat("pt-BR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
    return code ? `${n} ${code}` : n;
  }
}

export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat("pt-BR").format(value);
}

/**
 * Valor em dinheiro digitado à mão -> número. Vazio ou inválido -> null.
 * "27,90" -> 27.9 · "1.234,50" -> 1234.5 · "1,234.50" -> 1234.5 · "1.234" -> 1234 · "0.5" -> 0.5
 */
export function parseDecimal(value: string): number | null {
  const v = value.trim().replace(/\s/g, "");
  if (!/^-?\d[\d.,]*$/.test(v)) return null;
  const lastComma = v.lastIndexOf(",");
  const lastDot = v.lastIndexOf(".");
  let normalized: string;
  if (lastComma >= 0 && lastDot >= 0) {
    // vírgula e ponto juntos: o que vem por último é o separador decimal
    normalized = lastComma > lastDot ? v.replace(/\./g, "").replace(",", ".") : v.replace(/,/g, "");
  } else if (lastComma >= 0) {
    // só vírgula: decimal, no padrão brasileiro (e só pode haver uma)
    if (v.indexOf(",") !== lastComma) return null;
    normalized = v.replace(",", ".");
  } else if (/^-?[1-9]\d{0,2}(\.\d{3})+$/.test(v)) {
    // "1.234" ou "12.500.000": pontos separando milhares
    normalized = v.replace(/\./g, "");
  } else {
    if (v.indexOf(".") !== lastDot) return null;
    normalized = v;
  }
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

/**
 * Contagem digitada à mão (ex.: seguidores) -> número inteiro. Vazio ou inválido -> null.
 * "1840" · "1.840" · "12,3 mil" -> 12300 · "12.3k" -> 12300 · "1,2 mi" -> 1200000
 */
export function parseCount(value: string): number | null {
  const v = value.trim().toLowerCase().replace(/\s+/g, " ");
  if (!v) return null;
  const short = /^(\d+(?:[.,]\d+)?) ?(k|mil|m|mi|milhão|milhao|milhões|milhoes)$/.exec(v);
  if (short) {
    const factor = short[2] === "k" || short[2] === "mil" ? 1_000 : 1_000_000;
    const n = Math.round(Number(short[1].replace(",", ".")) * factor);
    return Number.isFinite(n) ? n : null;
  }
  if (/^\d+$/.test(v)) return Number(v);
  if (/^\d{1,3}([., ]\d{3})+$/.test(v)) return Number(v.replace(/[., ]/g, ""));
  return null;
}

/** Ordena textos que podem conter números ("Perfil 2" antes de "Perfil 10"). */
export function naturalCompare(a: string, b: string): number {
  return a.localeCompare(b, "pt-BR", { numeric: true, sensitivity: "base" });
}

export function plural(n: number, singular: string, pluralForm: string): string {
  return `${n} ${n === 1 ? singular : pluralForm}`;
}
