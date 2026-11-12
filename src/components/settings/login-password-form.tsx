"use client";

import { useState } from "react";
import { toAppError } from "@/lib/errors";
import { getSupabase } from "@/lib/supabase";
import { invalid } from "@/components/common/validation";
import { Field, Input } from "@/components/ui/field";
import { FormModal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";

const MIN_LENGTH = 8;

/**
 * Troca a senha de LOGIN do painel (a do e-mail e senha da tela de entrada).
 * Não é a senha-mestra do cofre: aqui os campos são de senha de verdade, para o
 * navegador oferecer atualizar a senha que ele tem salva.
 */
export function LoginPasswordForm({ email, onClose }: { email: string; onClose: () => void }) {
  const toast = useToast();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [repeat, setRepeat] = useState("");

  async function submit() {
    if (!current) invalid("Digite a senha atual.");
    if (next.length < MIN_LENGTH) invalid(`A nova senha precisa ter pelo menos ${MIN_LENGTH} caracteres.`);
    if (next !== repeat) invalid("As duas senhas novas não são iguais.");
    if (next === current) invalid("A nova senha é igual à atual.");

    const auth = getSupabase().auth;
    // confere a senha atual antes de trocar (e renova a sessão: o Supabase pode exigir login recente)
    const check = await auth.signInWithPassword({ email, password: current });
    if (check.error) {
      const error = toAppError(check.error);
      if (error.kind === "network") throw error;
      invalid("A senha atual não confere.");
    }
    const { error } = await auth.updateUser({ password: next });
    if (error) {
      const failure = toAppError(error);
      if (failure.kind === "network") throw failure;
      invalid(
        /different from the old|same.*password/i.test(error.message)
          ? "A nova senha é igual à atual."
          : /weak|at least|should contain|characters/i.test(error.message)
            ? "O Supabase recusou a nova senha por ser fraca. Use uma senha mais longa, com letras e números."
            : `Não consegui trocar a senha: ${error.message}`,
      );
    }
    toast.success("Senha de login trocada");
  }

  return (
    <FormModal
      title="Trocar a senha de login"
      description={`A senha que você usa para entrar no painel com ${email}.`}
      onClose={onClose}
      onSubmit={submit}
      submitLabel="Trocar senha"
      size="sm"
    >
      {/* (ajuda o navegador a saber de qual login é esta senha) */}
      <input type="text" name="username" autoComplete="username" value={email} readOnly hidden />
      <Field label="Senha atual">
        <Input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" autoFocus />
      </Field>
      <Field label="Nova senha" hint={`Pelo menos ${MIN_LENGTH} caracteres.`}>
        <Input type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />
      </Field>
      <Field label="Repita a nova senha">
        <Input type="password" value={repeat} onChange={(e) => setRepeat(e.target.value)} autoComplete="new-password" />
      </Field>
      <p className="text-xs leading-relaxed text-muted">
        Esta não é a senha-mestra do cofre: trocar a senha de login não muda nada nas senhas guardadas. Nos outros
        aparelhos, o painel pode pedir para você entrar de novo.
      </p>
    </FormModal>
  );
}
