import type { MetadataRoute } from "next";
import { THEME_COLORS } from "@/lib/theme-script";

/** O "cartão de identidade" do aplicativo instalável: nome, ícones e como ele abre. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Central de Avatares",
    short_name: "Avatares",
    description: "Painel privado de organização de avatares.",
    lang: "pt-BR",
    id: "/",
    start_url: "/",
    scope: "/",
    // abre como aplicativo, sem a barra de endereço do navegador
    display: "standalone",
    background_color: THEME_COLORS.light,
    theme_color: THEME_COLORS.light,
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
