import type { NextConfig } from "next";

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
        ],
      },
    ];
  },
};

export default nextConfig;
