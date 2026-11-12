import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

/** Só a origem do Supabase (ex.: https://abc.supabase.co), para liberar a conexão apenas com ele. */
function supabaseOrigin(): string | null {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").origin;
  } catch {
    return null;
  }
}

/**
 * Content-Security-Policy: diz ao navegador de onde o painel pode carregar
 * código e com quem pode abrir conexões de dados (só o próprio painel e o
 * Supabase). É uma camada a mais, não uma garantia: as páginas são estáticas
 * (sem "nonce"), por isso scripts escritos na própria página são permitidos, e
 * imagens e links para outros sites continuam liberados (fotos dos avatares,
 * links de venda).
 */
function contentSecurityPolicy(): string {
  const supabase = supabaseOrigin();
  const connect = ["'self'", supabase, isDev ? "ws:" : null].filter(Boolean).join(" ");
  const rules = [
    "default-src 'self'",
    // O Next.js escreve pequenos scripts dentro da própria página (por isso 'unsafe-inline');
    // em desenvolvimento ele também precisa de 'unsafe-eval'.
    `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    // as fotos dos avatares são links de qualquer site
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    `connect-src ${connect}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-src 'none'",
    "frame-ancestors 'none'",
    "worker-src 'self'",
    "manifest-src 'self'",
  ];
  if (supabase?.startsWith("https:")) rules.push("upgrade-insecure-requests");
  return rules.join("; ");
}

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  // O selo de desenvolvimento do Next.js fica no topo, longe do menu de baixo.
  devIndicators: { position: "top-right" },
  // Cabeçalhos de segurança e privacidade para um painel privado.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // não aparecer em buscadores
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
          // não permitir que outro site "embuta" o painel numa moldura
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          // ao abrir links (site de vendas etc.), não revelar o endereço do painel
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Content-Security-Policy", value: contentSecurityPolicy() },
        ],
      },
    ];
  },
};

export default nextConfig;
