"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";
import { Button } from "./button";
import { Input } from "./field";
import { Modal } from "./modal";

export interface ConfirmOptions {
  title: string;
  message?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "default" | "danger";
  /** Exige digitar este texto para liberar o botão (ações sem volta). */
  typeToConfirm?: string;
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const [typed, setTyped] = useState("");
  const resolver = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback<ConfirmFn>((next) => {
    resolver.current?.(false);
    setTyped("");
    setOptions(next);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  function finish(value: boolean) {
    resolver.current?.(value);
    resolver.current = null;
    setOptions(null);
  }

  const expected = options?.typeToConfirm?.trim() ?? "";
  const unlocked = !expected || typed.trim().toLowerCase() === expected.toLowerCase();

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Modal
        open={options !== null}
        onClose={() => finish(false)}
        title={options?.title ?? ""}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => finish(false)}>
              {options?.cancelLabel ?? "Cancelar"}
            </Button>
            <Button
              variant={options?.tone === "danger" ? "danger" : "primary"}
              disabled={!unlocked}
              onClick={() => finish(true)}
            >
              {options?.confirmLabel ?? "Confirmar"}
            </Button>
          </>
        }
      >
        <div className="space-y-4 text-[15px] leading-relaxed text-muted">
          {options?.message ? <div>{options.message}</div> : null}
          {expected ? (
            <label className="block">
              <span className="mb-1.5 block text-sm text-fg">
                Para confirmar, digite <strong className="font-semibold">{expected}</strong>
              </span>
              <Input
                value={typed}
                onChange={(event) => setTyped(event.target.value)}
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
              />
            </label>
          ) : null}
        </div>
      </Modal>
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  const confirm = useContext(ConfirmContext);
  if (!confirm) throw new Error("useConfirm precisa estar dentro de <ConfirmProvider>.");
  return confirm;
}
