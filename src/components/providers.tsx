"use client";

import { useEffect } from "react";
import { AuthProvider } from "@/lib/auth";
import { applyTheme } from "@/lib/theme";
import { ConfirmProvider } from "@/components/ui/confirm";
import { ToastProvider } from "@/components/ui/toast";
import { VaultProvider } from "@/components/vault/vault-provider";

/** Mantém o tema em dia quando o sistema troca entre claro e escuro. */
function ThemeSync() {
  useEffect(() => {
    applyTheme();
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme();
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);
  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <ToastProvider>
        <VaultProvider>
          <ConfirmProvider>{children}</ConfirmProvider>
        </VaultProvider>
      </ToastProvider>
      <ThemeSync />
    </AuthProvider>
  );
}
