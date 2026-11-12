"use client";

import { createContext, useContext, useId } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/format";

const CONTROL =
  "w-full rounded-xl border border-line-strong bg-surface px-3.5 text-base text-fg shadow-card outline-none " +
  "transition-colors placeholder:text-muted/70 focus:border-primary focus:ring-2 focus:ring-ring/25 " +
  "disabled:cursor-not-allowed disabled:opacity-60 md:text-[15px]";

/** Liga o rótulo e a dica ao campo que estiver dentro do <Field>. */
const FieldContext = createContext<{ id: string; describedBy?: string } | null>(null);

interface FieldProps {
  label: string;
  hint?: React.ReactNode;
  error?: string | null;
  optional?: boolean;
  className?: string;
  children: React.ReactNode;
}

/** Rótulo + campo + dica. O campo vai dentro (children). */
export function Field({ label, hint, error, optional, className, children }: FieldProps) {
  const id = useId();
  const noteId = `${id}-nota`;
  const hasNote = Boolean(error || hint);
  return (
    <div className={cn("block", className)}>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-sm font-medium text-fg">
          {label}
        </label>
        {optional ? <span className="text-xs text-muted">opcional</span> : null}
      </div>
      <FieldContext.Provider value={{ id, describedBy: hasNote ? noteId : undefined }}>{children}</FieldContext.Provider>
      {error ? (
        <p id={noteId} className="mt-1.5 text-xs font-medium text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={noteId} className="mt-1.5 text-xs leading-relaxed text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

function useFieldProps(id: string | undefined, describedBy: string | undefined) {
  const field = useContext(FieldContext);
  return {
    id: id ?? field?.id,
    "aria-describedby": describedBy ?? field?.describedBy,
  };
}

export function Input({ className, id, "aria-describedby": describedBy, ...rest }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(CONTROL, "h-11", className)} {...useFieldProps(id, describedBy)} {...rest} />;
}

export function Textarea({
  className,
  rows = 3,
  id,
  "aria-describedby": describedBy,
  ...rest
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      rows={rows}
      className={cn(CONTROL, "min-h-11 resize-y py-2.5 leading-relaxed", className)}
      {...useFieldProps(id, describedBy)}
      {...rest}
    />
  );
}

export function Select({
  className,
  children,
  id,
  "aria-describedby": describedBy,
  ...rest
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <span className="relative block">
      <select className={cn(CONTROL, "h-11 appearance-none pr-10", className)} {...useFieldProps(id, describedBy)} {...rest}>
        {children}
      </select>
      <ChevronDown
        className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted"
        aria-hidden
      />
    </span>
  );
}

/** Mensagem de erro dentro de formulários. */
export function FormError({ message }: { message: string | null | undefined }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className="rounded-xl border border-red-500/30 bg-red-500/10 px-3.5 py-2.5 text-sm text-red-700 dark:text-red-300"
    >
      {message}
    </p>
  );
}
