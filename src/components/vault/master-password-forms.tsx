"use client";

import { useEffect, useMemo, useState } from "react";
import { TriangleAlert } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { cn, plural } from "@/lib/format";
import { REKEY_UNAVAILABLE, schemaVersion, useStore } from "@/lib/store";
import { changeMasterPassword, createVaultWithPassword, unlockVault } from "@/lib/vault";
import { MIN_MASTER_PASSWORD, passwordStrength, type PasswordStrength } from "@/lib/vault-crypto";
import { CopySchemaButton } from "@/components/common/copy-schema-button";
import { invalid } from "@/components/common/validation";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { FormModal, Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { MasterPasswordInput } from "./secret-input";
import { useCloseWhenIdle } from "./use-close-when-idle";

/** O aviso que o dono do painel pediu para ficar bem claro. */
export function LostPasswordWarning({ className }: { className?: string }) {
  return (
    <Callout tone="danger" icon={<TriangleAlert />} className={className}>
      <strong>Se você perder a senha-mestra, as senhas guardadas não podem ser recuperadas</strong> — nem por você, nem
      pelo suporte, nem por ninguém. Ela não fica salva em lugar nenhum. Anote num papel e guarde em lugar seguro.
    </Callout>
  );
}

const STRENGTH: Record<PasswordStrength, { label: string; tone: string; tip: string }> = {
  curta: { label: "curta demais", tone: "text-danger", tip: `Use pelo menos ${MIN_MASTER_PASSWORD} caracteres.` },
  fraca: {
    label: "fácil de adivinhar",
    tone: "text-danger",
    tip: "Evite repetições, sequências, só números, nomes dos seus avatares e palavras como “senha”. Junte 3 ou 4 palavras soltas.",
  },
  boa: { label: "boa", tone: "text-emerald-600 dark:text-emerald-400", tip: "Com 16 caracteres ou mais fica forte." },
  forte: { label: "forte", tone: "text-emerald-600 dark:text-emerald-400", tip: "Ótimo." },
};

/** Nomes que não devem valer como senha-mestra: avatares, contas, países e os e-mails do painel. */
function usePasswordContext(): string[] {
  const db = useStore();
  const auth = useAuth();
  const loginEmail = auth.status === "signed_in" ? auth.email : null;
  return useMemo(
    () =>
      [
        ...db.avatars.map((avatar) => avatar.name),
        ...db.accounts.flatMap((account) => [account.handle, account.email]),
        ...db.countries.map((country) => country.name),
        loginEmail,
      ].filter((text): text is string => Boolean(text)),
    [db.avatars, db.accounts, db.countries, loginEmail],
  );
}

function StrengthHint({ password, context }: { password: string; context: string[] }) {
  if (!password) {
    return (
      <>
        Pelo menos {MIN_MASTER_PASSWORD} caracteres. Uma frase de 3 ou 4 palavras soltas é fácil de lembrar e difícil
        de adivinhar. Não use a mesma senha do login.
      </>
    );
  }
  const level = STRENGTH[passwordStrength(password, context)];
  return (
    <>
      Força: <strong className={cn("font-semibold", level.tone)}>{level.label}</strong>. {level.tip}
    </>
  );
}

function checkNewPassword(password: string, repeat: string, context: string[]) {
  if (password !== password.trim()) invalid("A senha-mestra não pode começar nem terminar com espaço.");
  const strength = passwordStrength(password, context);
  if (strength === "curta") invalid(`A senha-mestra precisa ter pelo menos ${MIN_MASTER_PASSWORD} caracteres.`);
  if (strength === "fraca") {
    invalid(
      "Essa senha-mestra é fácil de adivinhar (repetição, sequência, só números, nome de avatar ou palavra muito comum). Junte 3 ou 4 palavras soltas.",
    );
  }
  if (password !== repeat) invalid("As duas senhas não são iguais. Digite de novo.");
}

/** Cria o cofre: escolhe a senha-mestra (uma vez só). */
export function CreateVaultForm({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  useCloseWhenIdle(onClose);
  const context = usePasswordContext();
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [understood, setUnderstood] = useState(false);

  async function submit() {
    checkNewPassword(password, repeat, context);
    if (!understood) invalid("Marque a caixa confirmando que você entendeu o aviso sobre perder a senha-mestra.");
    await createVaultWithPassword(password);
    toast.success("Cofre criado e aberto");
  }

  return (
    <FormModal
      title="Criar senha-mestra"
      description="Ela tranca o cofre onde ficam as senhas das contas."
      onClose={onClose}
      onSubmit={submit}
      submitLabel="Criar cofre"
    >
      <LostPasswordWarning />
      <Field label="Senha-mestra" hint={<StrengthHint password={password} context={context} />}>
        <MasterPasswordInput value={password} onChange={setPassword} autoFocus />
      </Field>
      <Field label="Repita a senha-mestra">
        <MasterPasswordInput value={repeat} onChange={setRepeat} />
      </Field>
      <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-line bg-surface-2/60 p-3.5">
        <input
          type="checkbox"
          checked={understood}
          onChange={(e) => setUnderstood(e.target.checked)}
          className="mt-0.5 size-5 shrink-0 accent-[var(--primary)]"
        />
        <span className="text-sm leading-relaxed">
          Entendi: sem a senha-mestra, as senhas guardadas ficam perdidas para sempre.
        </span>
      </label>
    </FormModal>
  );
}

/** Pede a senha-mestra para destrancar o cofre. */
export function UnlockVaultForm({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  useCloseWhenIdle(onClose);
  const [password, setPassword] = useState("");

  async function submit() {
    if (!password) invalid("Digite a senha-mestra.");
    await unlockVault(password);
    toast.success("Cofre aberto");
  }

  return (
    <FormModal
      title="Destrancar o cofre"
      description="Digite a sua senha-mestra para ver e guardar senhas."
      onClose={onClose}
      onSubmit={submit}
      submitLabel="Destrancar"
      size="sm"
    >
      <Field label="Senha-mestra">
        <MasterPasswordInput value={password} onChange={setPassword} autoFocus />
      </Field>
      <p className="text-xs leading-relaxed text-muted">
        O cofre tranca sozinho depois de alguns minutos sem uso. Esqueceu a senha-mestra? Veja as opções em
        Configurações → Cofre de senhas.
      </p>
    </FormModal>
  );
}

/**
 * Troca a senha-mestra. Como a chave do cofre sai da senha, todas as senhas
 * guardadas são cifradas de novo com a senha nova — tudo de uma vez.
 */
export function ChangeMasterPasswordForm({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  useCloseWhenIdle(onClose);
  const context = usePasswordContext();
  const [current, setCurrent] = useState("");
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  // O banco precisa da função que grava a troca de uma vez só (script SQL de 2 em diante).
  const [ready, setReady] = useState<boolean | null>(null);

  const checking = ready === null;
  useEffect(() => {
    if (!checking) return;
    let active = true;
    schemaVersion()
      .then((version) => {
        if (active) setReady(version >= 2);
      })
      .catch(() => {
        if (active) setReady(true); // sem resposta agora: deixa tentar; o erro certo aparece ao salvar
      });
    return () => {
      active = false;
    };
  }, [checking]);

  async function submit() {
    if (!current) invalid("Digite a senha-mestra atual.");
    checkNewPassword(password, repeat, context);
    if (password === current.trim()) invalid("A senha nova é igual à atual.");
    let result;
    try {
      result = await changeMasterPassword(current, password);
    } catch (err) {
      if (err instanceof AppError && err.code === REKEY_UNAVAILABLE) setReady(false);
      throw err;
    }
    toast.success(
      result.unreadable > 0
        ? `Senha-mestra trocada. ${plural(result.unreadable, "conta tinha", "contas tinham")} senhas que já não abriam e continuam assim.`
        : "Senha-mestra trocada",
    );
  }

  if (ready === false) {
    return (
      <Modal
        open
        onClose={onClose}
        title="Trocar a senha-mestra"
        description="Antes, o banco de dados precisa de uma atualização (uma vez só)."
        footer={
          <>
            <Button variant="secondary" onClick={onClose}>
              Fechar
            </Button>
            <Button variant="primary" onClick={() => setReady(null)}>
              Já rodei
            </Button>
          </>
        }
      >
        <div className="space-y-4 text-[15px] leading-relaxed">
          <p>
            Trocar a senha-mestra regrava, de uma vez só, as senhas de todas as contas. Para isso o banco precisa do
            script atualizado. Leva um minuto, e <strong>não apaga nada</strong>:
          </p>
          <ol className="list-decimal space-y-2 pl-5 marker:font-semibold marker:text-muted">
            <li>
              Toque em <strong>Copiar script SQL</strong> aqui embaixo.
            </li>
            <li>
              No Supabase, abra <strong>SQL Editor</strong> (menu da esquerda), cole o script e clique em{" "}
              <strong>Run</strong>. Deve aparecer <em>“Tudo certo!”</em>.
            </li>
            <li>
              Volte aqui e toque em <strong>Já rodei</strong>.
            </li>
          </ol>
          <CopySchemaButton />
          <p className="text-sm text-muted">
            Enquanto isso, o cofre continua funcionando normalmente com a senha-mestra atual.
          </p>
        </div>
      </Modal>
    );
  }

  return (
    <FormModal
      title="Trocar a senha-mestra"
      description="As senhas guardadas continuam no cofre, cifradas de novo com a senha nova."
      onClose={onClose}
      onSubmit={submit}
      submitLabel="Trocar senha"
    >
      <Field label="Senha-mestra atual">
        <MasterPasswordInput value={current} onChange={setCurrent} autoFocus />
      </Field>
      <Field label="Nova senha-mestra" hint={<StrengthHint password={password} context={context} />}>
        <MasterPasswordInput value={password} onChange={setPassword} />
      </Field>
      <Field label="Repita a nova senha-mestra">
        <MasterPasswordInput value={repeat} onChange={setRepeat} />
      </Field>
      <LostPasswordWarning />
      <p className="text-xs leading-relaxed text-muted">
        Se você acha que alguém descobriu a senha-mestra antiga, troque também as senhas das próprias contas: quem
        já tinha a senha antiga pode ter copiado o que estava guardado.
      </p>
    </FormModal>
  );
}
