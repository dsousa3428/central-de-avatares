"use client";

import { useEffect, useState } from "react";
import { Copy, Eye, EyeOff, KeyRound, Lock, LockKeyhole, LockKeyholeOpen, Pencil, Plus } from "lucide-react";
import { copySecret } from "@/lib/clipboard";
import { cn } from "@/lib/format";
import { generationLabel } from "@/lib/selectors";
import type { Account } from "@/lib/types";
import { hideSecretsOf, loadSecrets, lockVault, revealKey, saveSecrets, setRevealed } from "@/lib/vault";
import { EMPTY_SECRETS, hasSecrets, SECRET_FIELDS, type AccountSecrets, type SecretField } from "@/lib/vault-crypto";
import { Button } from "@/components/ui/button";
import { Callout, Section } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { FormModal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { CreateVaultForm, UnlockVaultForm } from "./master-password-forms";
import { SecretInput, SecretTextarea } from "./secret-input";
import { useVault, useVaultState } from "./vault-provider";

const FIELDS: Record<SecretField, { label: string; what: string; copied: string }> = {
  instagram_password: { label: "Senha do Instagram", what: "a senha do Instagram", copied: "Senha do Instagram copiada" },
  email_password: { label: "Senha do e-mail", what: "a senha do e-mail", copied: "Senha do e-mail copiada" },
  recovery_email: { label: "E-mail de recuperação", what: "o e-mail de recuperação", copied: "E-mail de recuperação copiado" },
  backup_codes: { label: "Códigos de backup / 2FA", what: "os códigos de backup", copied: "Códigos copiados" },
};

interface AccountSecretsProps {
  account: Account;
  /** Sem a moldura de cartão (para usar dentro de uma janela). */
  bare?: boolean;
}

/**
 * Senhas e códigos de uma conta, guardados no cofre: escondidos por padrão,
 * com botões de mostrar e de copiar. Pede a senha-mestra quando o cofre está trancado.
 */
export function AccountSecrets({ account, bare }: AccountSecretsProps) {
  const state = useVaultState();
  const vault = useVault();
  const toast = useToast();
  const [dialog, setDialog] = useState<"create" | "unlock" | null>(null);
  // A janela de edição vale só para a abertura do cofre em que foi aberta: se o cofre
  // trancar, ela fecha na hora (nenhuma senha fica num formulário esquecido aberto).
  const [editingIn, setEditingIn] = useState<number | null>(null);
  const editing = vault.unlocked && editingIn === vault.session;
  const edit = () => setEditingIn(vault.session);

  const payload = account.secrets_enc;
  const cached = vault.secrets.get(account.id);
  const entry = cached && cached.payload === payload ? cached : undefined;
  const accountId = account.id;

  // Com o cofre aberto, decifra as senhas desta conta (só na memória).
  useEffect(() => {
    if (state === "unlocked" && payload && !entry) void loadSecrets({ id: accountId, secrets_enc: payload });
  }, [state, payload, entry, accountId]);

  // Quando este bloco sai da tela (outra aba do avatar, outra tela, janela fechada), nada fica à mostra.
  useEffect(() => () => hideSecretsOf(accountId), [accountId]);

  function lock() {
    lockVault({ everywhere: true });
    toast.info("Cofre trancado");
  }

  let subtitle: string;
  let actions: React.ReactNode = null;
  let body: React.ReactNode;

  if (state === "none") {
    subtitle = "Ainda sem cofre";
    body = (
      <Prompt
        icon={<KeyRound />}
        text="Guarde aqui a senha do Instagram, a senha do e-mail, o e-mail de recuperação e os códigos de backup. Tudo é cifrado neste aparelho com a sua senha-mestra antes de ir para o banco."
        action={
          <Button variant="primary" onClick={() => setDialog("create")}>
            <KeyRound className="size-4" /> Criar senha-mestra
          </Button>
        }
      />
    );
  } else if (state === "unsupported") {
    subtitle = "Cofre de outra versão";
    body = (
      <Callout tone="warn">
        O cofre foi criado por uma versão mais nova do painel. Atualize a página (ou reabra o aplicativo) para usar as
        senhas.
      </Callout>
    );
  } else if (state === "locked") {
    subtitle = "Cofre trancado";
    body = (
      <Prompt
        icon={<Lock />}
        text={
          payload
            ? "Esta conta tem senhas guardadas. Destranque o cofre para ver."
            : "Destranque o cofre para guardar as senhas desta conta."
        }
        action={
          <Button variant="primary" onClick={() => setDialog("unlock")}>
            <LockKeyholeOpen className="size-4" /> Destrancar
          </Button>
        }
      />
    );
  } else {
    subtitle = "Cofre aberto";
    actions = (
      <>
        {entry?.secrets ? (
          <Button size="sm" onClick={edit}>
            <Pencil className="size-4" /> Editar
          </Button>
        ) : null}
        <Button size="sm" variant="ghost" iconOnly aria-label="Trancar o cofre" title="Trancar o cofre" onClick={lock}>
          <LockKeyhole className="size-4 text-muted" />
        </Button>
      </>
    );
    if (!payload) {
      body = (
        <Prompt
          icon={<KeyRound />}
          text="Nenhuma senha guardada para esta conta."
          action={
            <Button variant="primary" onClick={edit}>
              <Plus className="size-4" /> Adicionar senhas
            </Button>
          }
        />
      );
    } else if (!entry) {
      body = <p className="py-3 text-sm text-muted">Abrindo…</p>;
    } else if (entry.error !== undefined) {
      body = (
        <Callout tone={entry.replaceable ? "danger" : "warn"}>
          <p>{entry.error}</p>
          {entry.replaceable ? (
            <Button size="sm" className="mt-2" onClick={edit}>
              Guardar de novo
            </Button>
          ) : null}
        </Callout>
      );
    } else {
      const secrets = entry.secrets;
      body = (
        <dl className="divide-y divide-line">
          {SECRET_FIELDS.map((field) => (
            <SecretRow
              key={field}
              accountId={account.id}
              field={field}
              value={secrets[field]}
              shown={vault.revealed.has(revealKey(account.id, field))}
            />
          ))}
        </dl>
      );
    }
  }

  const initial = entry?.secrets ?? EMPTY_SECRETS;
  const dialogs = (
    <>
      {dialog === "create" ? <CreateVaultForm onClose={() => setDialog(null)} /> : null}
      {dialog === "unlock" ? <UnlockVaultForm onClose={() => setDialog(null)} /> : null}
      {editing ? <SecretsForm account={account} initial={initial} onClose={() => setEditingIn(null)} /> : null}
    </>
  );

  if (bare) {
    return (
      <>
        <div className="mb-1 flex items-center justify-between gap-3">
          <p className="text-sm text-muted">{subtitle}</p>
          {actions ? <div className="flex shrink-0 items-center gap-1.5">{actions}</div> : null}
        </div>
        {body}
        {dialogs}
      </>
    );
  }

  return (
    <>
      <Section title="Senhas e códigos" subtitle={subtitle} actions={actions}>
        {body}
      </Section>
      {dialogs}
    </>
  );
}

function Prompt({ icon, text, action }: { icon: React.ReactNode; text: string; action: React.ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-3 py-1 sm:flex-row sm:items-center">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-muted [&_svg]:size-5">
        {icon}
      </span>
      <p className="min-w-0 flex-1 text-sm leading-relaxed text-muted">{text}</p>
      <div className="shrink-0">{action}</div>
    </div>
  );
}

interface SecretRowProps {
  accountId: string;
  field: SecretField;
  value: string;
  shown: boolean;
}

/** Uma linha do cofre: escondida por padrão, com mostrar e copiar. */
function SecretRow({ accountId, field, value, shown }: SecretRowProps) {
  const toast = useToast();
  const { label, what, copied } = FIELDS[field];

  async function copy() {
    const ok = await copySecret(value);
    if (ok) toast.success(copied);
    else toast.error("Não consegui copiar. Toque em mostrar e copie manualmente.");
  }

  return (
    <div className="flex min-h-14 items-start gap-1 py-2.5">
      <div className="min-w-0 flex-1 pt-0.5">
        <dt className="text-sm text-muted">{label}</dt>
        <dd
          className={cn(
            "mt-0.5 text-[15px]",
            value && shown && "select-all whitespace-pre-wrap font-mono text-sm leading-relaxed",
          )}
        >
          {!value ? (
            <span className="text-muted">—</span>
          ) : shown ? (
            value
          ) : (
            <span className="tracking-[0.2em] text-muted" aria-label="escondido">
              ••••••••••
            </span>
          )}
        </dd>
      </div>
      {value ? (
        <>
          <Button
            size="sm"
            variant="ghost"
            iconOnly
            aria-label={shown ? `Esconder ${what}` : `Mostrar ${what}`}
            aria-pressed={shown}
            onClick={() => setRevealed(accountId, field, !shown)}
          >
            {shown ? <EyeOff className="size-4 text-muted" /> : <Eye className="size-4 text-muted" />}
          </Button>
          <Button size="sm" variant="ghost" iconOnly aria-label={`Copiar ${what}`} onClick={() => void copy()}>
            <Copy className="size-4 text-muted" />
          </Button>
        </>
      ) : null}
    </div>
  );
}

interface SecretsFormProps {
  account: Account;
  initial: AccountSecrets;
  onClose: () => void;
}

/** Edita as senhas de uma conta. Ao salvar, tudo é cifrado neste aparelho antes de ir para o banco. */
function SecretsForm({ account, initial, onClose }: SecretsFormProps) {
  const toast = useToast();
  const [values, setValues] = useState<AccountSecrets>(initial);
  // o bloco cifrado que estava na conta quando esta janela abriu (para não gravar por cima de uma versão mais nova)
  const [base] = useState(account.secrets_enc ?? null);

  function set(field: SecretField, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
  }

  async function submit() {
    const secrets: AccountSecrets = {
      instagram_password: values.instagram_password.trim(),
      email_password: values.email_password.trim(),
      recovery_email: values.recovery_email.trim(),
      backup_codes: values.backup_codes.replace(/\r\n?/g, "\n").trim(),
    };
    await saveSecrets(account, secrets, base);
    toast.success(hasSecrets(secrets) ? "Senhas guardadas no cofre" : "Senhas removidas do cofre");
  }

  return (
    <FormModal
      title="Senhas da conta"
      description={`@${account.handle} · ${generationLabel(account.generation)}`}
      onClose={onClose}
      onSubmit={submit}
    >
      <Field label={FIELDS.instagram_password.label} optional>
        <SecretInput
          value={values.instagram_password}
          onChange={(v) => set("instagram_password", v)}
          what={FIELDS.instagram_password.what}
        />
      </Field>
      <Field
        label={FIELDS.email_password.label}
        optional
        hint={account.email ? `E-mail da conta: ${account.email}` : undefined}
      >
        <SecretInput
          value={values.email_password}
          onChange={(v) => set("email_password", v)}
          what={FIELDS.email_password.what}
        />
      </Field>
      <Field label={FIELDS.recovery_email.label} optional>
        <SecretInput
          value={values.recovery_email}
          onChange={(v) => set("recovery_email", v)}
          what={FIELDS.recovery_email.what}
          placeholder="recuperacao@exemplo.com"
        />
      </Field>
      <Field label={FIELDS.backup_codes.label} optional hint="Um código por linha, ou a chave do autenticador.">
        <SecretTextarea
          value={values.backup_codes}
          onChange={(v) => set("backup_codes", v)}
          what={FIELDS.backup_codes.what}
        />
      </Field>
      <p className="flex items-start gap-2 text-xs leading-relaxed text-muted">
        <LockKeyhole className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        Ao salvar, tudo é cifrado neste aparelho com a sua senha-mestra. O banco só recebe o texto cifrado.
      </p>
    </FormModal>
  );
}
