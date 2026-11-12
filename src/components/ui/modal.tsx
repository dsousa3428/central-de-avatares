"use client";

import { useId, useLayoutEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/format";
import { errorMessage } from "@/lib/errors";
import { Button } from "./button";
import { FormError } from "./field";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: "sm" | "md" | "lg";
  /** Fechar ao tocar fora. Desligue em formulários para não perder o que foi digitado. */
  closeOnBackdrop?: boolean;
}

const WIDTHS = { sm: "md:max-w-md", md: "md:max-w-lg", lg: "md:max-w-2xl" };

/**
 * Janela sobre a tela. No celular sobe de baixo; no computador fica no centro.
 * Usa o <dialog> nativo: Esc e o botão "voltar" do Android fecham a janela.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
  closeOnBackdrop = true,
}: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const pressedBackdrop = useRef(false);
  const titleId = useId();

  useLayoutEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open) {
      if (!dialog.open) dialog.showModal();
    } else if (dialog.open) {
      dialog.close();
    }
    // Ao sair da tela (ou desmontar), fecha para não travar o resto do app.
    return () => {
      if (dialog.open) dialog.close();
    };
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="cda-dialog"
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClose={(event) => {
        // fechado pelo navegador (ex.: Esc duas vezes): avisa quem abriu
        if (open && !event.currentTarget.open) onClose();
      }}
    >
      {open ? (
        <div
          className="flex h-full w-full items-end justify-center md:items-center md:p-6"
          onPointerDown={(event) => {
            pressedBackdrop.current = event.target === event.currentTarget;
          }}
          onClick={(event) => {
            const onBackdrop = event.target === event.currentTarget && pressedBackdrop.current;
            pressedBackdrop.current = false;
            if (onBackdrop && closeOnBackdrop) onClose();
          }}
        >
          <div
            className={cn(
              "cda-dialog-panel flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-3xl border border-line bg-surface shadow-pop",
              "md:max-h-[88dvh] md:rounded-3xl",
              WIDTHS[size],
            )}
          >
            <header className="flex items-start gap-3 border-b border-line px-5 py-4">
              <div className="min-w-0 flex-1">
                <h2 id={titleId} className="text-lg font-semibold leading-snug">
                  {title}
                </h2>
                {description ? <p className="mt-1 text-sm leading-relaxed text-muted">{description}</p> : null}
              </div>
              <Button variant="ghost" size="sm" iconOnly aria-label="Fechar" onClick={onClose} className="-mr-2 -mt-1">
                <X className="size-5" />
              </Button>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">{children}</div>
            {footer ? (
              <footer className="flex flex-wrap items-center gap-2 border-t border-line px-5 pt-3 pb-[calc(12px+env(safe-area-inset-bottom))] md:pb-3 [&>button]:flex-1 md:justify-end md:[&>button]:flex-none">
                {footer}
              </footer>
            ) : null}
          </div>
        </div>
      ) : null}
    </dialog>
  );
}

interface FormModalProps {
  onClose: () => void;
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
  /** Salva. Se der erro (throw), a mensagem aparece na janela e ela continua aberta. */
  onSubmit: () => Promise<void> | void;
  submitLabel?: string;
  size?: "sm" | "md" | "lg";
  /** Botões extras à esquerda (ex.: apagar). */
  extraActions?: React.ReactNode;
}

/**
 * Janela com formulário (Cancelar / Salvar). Monte-a só quando for abrir:
 * `{editando && <FormModal … />}` — assim cada abertura começa limpa.
 */
export function FormModal({
  onClose,
  title,
  description,
  children,
  onSubmit,
  submitLabel = "Salvar",
  size,
  extraActions,
}: FormModalProps) {
  const formId = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await onSubmit();
      onClose();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={busy ? () => {} : onClose}
      title={title}
      description={description}
      size={size}
      closeOnBackdrop={false}
      footer={
        <>
          {extraActions}
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button variant="primary" type="submit" form={formId} loading={busy}>
            {submitLabel}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={handleSubmit} className="space-y-4" noValidate>
        {children}
        <FormError message={error} />
      </form>
    </Modal>
  );
}
