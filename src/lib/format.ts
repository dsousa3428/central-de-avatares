/** Junta classes CSS ignorando valores vazios. */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
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

/** "@Fra.Salvio " -> "fra.salvio" */
export function normalizeHandle(value: string): string {
  return value
    .trim()
    .replace(/^https?:\/\/(www\.)?instagram\.com\//i, "")
    .replace(/^@+/, "")
    .replace(/[/?#].*$/, "")
    .replace(/\s+/g, "")
    .toLowerCase();
}

/** Garante que um link digitado sem "https://" funcione ao clicar. */
export function normalizeUrl(value: string | null | undefined): string | null {
  const v = clean(value);
  if (!v) return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(v)) return v;
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

/** "1.234,50" ou "1234.5" -> 1234.5 ; vazio/inválido -> null */
export function parseDecimal(value: string): number | null {
  const v = value.trim().replace(/\s/g, "");
  if (!v) return null;
  let normalized = v;
  if (v.includes(",")) {
    // formato brasileiro: ponto = milhar, vírgula = decimal
    normalized = v.replace(/\./g, "").replace(",", ".");
  } else if (/^-?\d{1,3}(\.\d{3})+$/.test(v)) {
    // "1.234" ou "12.500.000": pontos são separadores de milhar
    normalized = v.replace(/\./g, "");
  }
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

/** "1.840" ou "1840" -> 1840 ; vazio/inválido -> null */
export function parseInteger(value: string): number | null {
  const digits = value.replace(/[^\d-]/g, "");
  if (!digits || digits === "-") return null;
  const n = parseInt(digits, 10);
  return Number.isFinite(n) ? n : null;
}

/** Ordena textos que podem conter números ("Perfil 2" antes de "Perfil 10"). */
export function naturalCompare(a: string, b: string): number {
  return a.localeCompare(b, "pt-BR", { numeric: true, sensitivity: "base" });
}

export function plural(n: number, singular: string, pluralForm: string): string {
  return `${n} ${n === 1 ? singular : pluralForm}`;
}
