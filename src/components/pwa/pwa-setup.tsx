"use client";

import { useEffect } from "react";
import { rememberInstallPrompt } from "@/lib/pwa";

/**
 * Liga o aplicativo instalável: registra o service worker (só no painel
 * publicado — em desenvolvimento ele atrapalharia) e guarda o convite de
 * instalação do navegador para o botão "Instalar" das Configurações.
 */
export function PwaSetup() {
  useEffect(() => {
    const onPrompt = (event: Event) => {
      event.preventDefault(); // o painel oferece o botão na hora certa, em Configurações
      rememberInstallPrompt(event);
    };
    const onInstalled = () => rememberInstallPrompt(null);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);

    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {
        // sem service worker o painel funciona igual (só não mostra a página "Sem internet")
      });
    }
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);
  return null;
}
