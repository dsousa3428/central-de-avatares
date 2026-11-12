"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/format";
import { Input, Textarea } from "@/components/ui/field";

const TOGGLE =
  "absolute right-1 flex size-9 items-center justify-center rounded-lg text-muted transition-colors hover:text-fg " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

function Toggle({ show, onToggle, what, className }: { show: boolean; onToggle: () => void; what: string; className?: string }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={show ? `Esconder ${what}` : `Mostrar ${what}`}
      aria-pressed={show}
      className={cn(TOGGLE, className)}
    >
      {show ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
    </button>
  );
}

// Os campos do cofre são de texto comum com as letras cobertas por CSS — e não
// campos "de senha" do navegador. Motivo: num campo de senha o navegador oferece
// "salvar senha" e passa a sugerir o que guardou, inclusive na tela de login do
// painel (onde a senha-mestra acabaria sendo enviada como se fosse a de login).
// A senha-mestra não deve ser salva em lugar nenhum, e as senhas das contas são
// dados do painel, não senhas *deste site*. Onde esse CSS não existe, o campo
// volta a ser um campo de senha comum.
const MASKED = "[-webkit-text-security:disc]";

function canMaskWithCss(): boolean {
  return typeof CSS !== "undefined" && typeof CSS.supports === "function" && CSS.supports("-webkit-text-security", "disc");
}

/** Avisos para o teclado e para gerenciadores de senha: não aprender, não sugerir, não preencher. */
const QUIET = {
  autoComplete: "off",
  autoCapitalize: "none",
  autoCorrect: "off",
  spellCheck: false,
  "data-1p-ignore": "true",
  "data-lpignore": "true",
  "data-bwignore": "true",
  "data-form-type": "other",
} as const;

interface MasterPasswordInputProps {
  value: string;
  onChange: (value: string) => void;
  autoFocus?: boolean;
}

/** Campo da senha-mestra: coberto, com botão de mostrar. */
export function MasterPasswordInput({ value, onChange, autoFocus }: MasterPasswordInputProps) {
  const [show, setShow] = useState(false);
  const css = canMaskWithCss();
  return (
    <span className="relative block">
      <Input
        type={show || css ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoFocus={autoFocus}
        className={cn("pr-12", !show && css && MASKED)}
        {...QUIET}
        // (só vale quando o campo cai no modo "senha" do navegador)
        autoComplete={css ? "off" : "new-password"}
      />
      <Toggle show={show} onToggle={() => setShow((v) => !v)} what="a senha-mestra" className="top-1/2 -translate-y-1/2" />
    </span>
  );
}

interface SecretInputProps {
  value: string;
  onChange: (value: string) => void;
  /** Usado no rótulo do botão de mostrar (ex.: "a senha do Instagram"). */
  what: string;
  placeholder?: string;
}

/** Campo de uma linha para um segredo de conta: coberto, com botão de mostrar. */
export function SecretInput({ value, onChange, what, placeholder }: SecretInputProps) {
  const [show, setShow] = useState(false);
  const css = canMaskWithCss();
  return (
    <span className="relative block">
      <Input
        type={show || css ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn("pr-12 font-mono", !show && css && MASKED)}
        {...QUIET}
      />
      <Toggle show={show} onToggle={() => setShow((v) => !v)} what={what} className="top-1/2 -translate-y-1/2" />
    </span>
  );
}

/** Campo de várias linhas (códigos de backup): coberto, com botão de mostrar. */
export function SecretTextarea({ value, onChange, what, placeholder }: SecretInputProps) {
  const css = canMaskWithCss();
  // sem o CSS não há como cobrir um campo de várias linhas: nesse caso ele fica sempre à mostra
  const [show, setShow] = useState(!css);
  return (
    <span className="relative block">
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={4}
        className={cn("pr-12 font-mono text-sm md:text-sm", !show && MASKED)}
        {...QUIET}
      />
      {css ? <Toggle show={show} onToggle={() => setShow((v) => !v)} what={what} className="top-1" /> : null}
    </span>
  );
}
