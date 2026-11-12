"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { CircleAlert, CircleCheck, Info } from "lucide-react";
import { cn } from "@/lib/format";
import { errorMessage } from "@/lib/errors";

type ToastKind = "success" | "error" | "info";

interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
}

interface ToastApi {
  success: (message: string) => void;
  info: (message: string) => void;
  /** Aceita um texto ou qualquer erro (vira mensagem amigável). */
  error: (error: unknown) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const ICONS = { success: CircleCheck, error: CircleAlert, info: Info };
const TONES: Record<ToastKind, string> = {
  success: "text-emerald-400",
  error: "text-red-400",
  info: "text-sky-400",
};

let nextId = 1;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const layerRef = useRef<HTMLDivElement>(null);

  const push = useCallback((kind: ToastKind, message: string) => {
    const id = nextId++;
    setToasts((list) => [...list.slice(-2), { id, kind, message }]);
    window.setTimeout(
      () => setToasts((list) => list.filter((t) => t.id !== id)),
      kind === "error" ? 6500 : 2600,
    );
  }, []);

  const api = useMemo<ToastApi>(
    () => ({
      success: (message) => push("success", message),
      info: (message) => push("info", message),
      error: (error) => push("error", typeof error === "string" ? error : errorMessage(error)),
    }),
    [push],
  );

  // Mantém os avisos na "camada do topo" do navegador, acima de janelas abertas.
  useEffect(() => {
    const layer = layerRef.current;
    if (!layer || typeof layer.showPopover !== "function") return;
    try {
      if (layer.matches(":popover-open")) layer.hidePopover();
      if (toasts.length > 0) layer.showPopover();
    } catch {
      // navegador sem suporte: os avisos aparecem na camada normal
    }
  }, [toasts]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div ref={layerRef} popover="manual" className="cda-toast-layer" aria-live="polite">
        <div className="mx-auto flex w-full max-w-sm flex-col items-center gap-2">
          {toasts.map((toast) => {
            const Icon = ICONS[toast.kind];
            return (
              <div
                key={toast.id}
                role={toast.kind === "error" ? "alert" : "status"}
                className="cda-toast pointer-events-auto flex w-fit max-w-full items-start gap-2.5 rounded-2xl bg-neutral-900 px-4 py-3 text-sm font-medium text-white shadow-pop ring-1 ring-white/10"
              >
                <Icon className={cn("mt-0.5 size-4 shrink-0", TONES[toast.kind])} aria-hidden />
                <span className="min-w-0">{toast.message}</span>
              </div>
            );
          })}
        </div>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error("useToast precisa estar dentro de <ToastProvider>.");
  return api;
}
