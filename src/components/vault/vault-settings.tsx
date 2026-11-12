"use client";

import { useState } from "react";
import { KeyRound, LockKeyhole, LockKeyholeOpen, ShieldCheck } from "lucide-react";
import { plural } from "@/lib/format";
import { saveSettings, useStore } from "@/lib/store";
import { destroyVault, LOCK_OPTIONS, lockMinutesOf, lockVault } from "@/lib/vault";
import { Button } from "@/components/ui/button";
import { Callout, Section } from "@/components/ui/card";
import { useConfirm } from "@/components/ui/confirm";
import { Select } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { ChangeMasterPasswordForm, CreateVaultForm, LostPasswordWarning, UnlockVaultForm } from "./master-password-forms";
import { useVaultState } from "./vault-provider";

/** Bloco "Cofre de senhas" das Configurações: senha-mestra, trancar e tempo de trancamento. */
export function VaultSettings() {
  const db = useStore();
  const state = useVaultState();
  const toast = useToast();
  const confirm = useConfirm();
  const [dialog, setDialog] = useState<"create" | "unlock" | "change" | null>(null);
  const [busy, setBusy] = useState(false);

  const stored = db.accounts.filter((a) => a.secrets_enc).length;
  const minutes = lockMinutesOf(db.settings);

  async function changeMinutes(value: number) {
    try {
      await saveSettings({ prefs: { ...(db.settings?.prefs ?? {}), vault_lock_minutes: value } });
      toast.success(`O cofre vai trancar depois de ${plural(value, "minuto", "minutos")} sem uso`);
    } catch (err) {
      toast.error(err);
    }
  }

  async function forgot() {
    const ok = await confirm({
      title: "Apagar o cofre e começar de novo?",
      message: (
        <>
          <p>
            Sem a senha-mestra não existe como abrir o cofre. A única saída é <strong>apagar o cofre</strong> e criar
            outro, com uma senha-mestra nova.
          </p>
          <p className="mt-2">
            Isso apaga <strong>todas as senhas e códigos guardados</strong>
            {stored > 0 ? ` (${plural(stored, "conta", "contas")})` : ""}. O resto do painel — avatares, contas,
            aquecimento, vendas — continua igual. Não tem volta.
          </p>
        </>
      ),
      confirmLabel: "Apagar o cofre",
      tone: "danger",
      typeToConfirm: "APAGAR",
    });
    if (!ok) return;
    setBusy(true);
    try {
      await destroyVault();
      toast.success("Cofre apagado. Crie uma nova senha-mestra para voltar a guardar senhas.");
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  }

  const subtitle =
    state === "none"
      ? "Para guardar as senhas das contas com segurança."
      : state === "unlocked"
        ? "Aberto neste aparelho."
        : state === "locked"
          ? "Trancado."
          : "Criado por outra versão do painel.";

  return (
    <div id="cofre" className="scroll-mt-6">
      <Section title="Cofre de senhas" subtitle={subtitle}>
        {state === "none" ? (
          <>
            <p className="text-[15px] leading-relaxed">
              Senhas do Instagram e do e-mail, e-mails de recuperação e códigos de backup são{" "}
              <strong>cifrados neste aparelho</strong> com uma senha-mestra antes de irem para o banco. O banco só
              guarda o texto cifrado, e a senha-mestra não é salva em lugar nenhum.
            </p>
            <LostPasswordWarning className="mt-3" />
            <Button variant="primary" className="mt-3" onClick={() => setDialog("create")}>
              <KeyRound className="size-4" /> Criar senha-mestra
            </Button>
          </>
        ) : null}

        {state === "unsupported" ? (
          <Callout tone="warn">
            O cofre foi criado por uma versão mais nova do painel. Atualize a página (ou reabra o aplicativo) para
            usar as senhas.
          </Callout>
        ) : null}

        {state === "locked" || state === "unlocked" ? (
          <>
            <p className="flex items-center gap-2 text-[15px] font-medium">
              {state === "unlocked" ? (
                <LockKeyholeOpen className="size-4 text-emerald-500" aria-hidden />
              ) : (
                <LockKeyhole className="size-4 text-muted" aria-hidden />
              )}
              {stored === 0
                ? "Nenhuma conta com senhas guardadas ainda"
                : `${plural(stored, "conta", "contas")} com senhas guardadas`}
            </p>
            <p className="mt-1 text-sm leading-relaxed text-muted">
              As senhas ficam na aba “Conta atual” de cada avatar (e no Histórico, para contas antigas).
            </p>

            <div className="mt-3 flex flex-wrap gap-2">
              {state === "unlocked" ? (
                <Button
                  onClick={() => {
                    lockVault({ everywhere: true });
                    toast.info("Cofre trancado");
                  }}
                >
                  <LockKeyhole className="size-4" /> Trancar agora
                </Button>
              ) : (
                <Button variant="primary" onClick={() => setDialog("unlock")}>
                  <LockKeyholeOpen className="size-4" /> Destrancar
                </Button>
              )}
              <Button onClick={() => setDialog("change")}>Trocar senha-mestra</Button>
            </div>

            <label className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm">
              <span className="text-muted">Trancar sozinho depois de</span>
              <span className="w-56 max-w-full">
                <Select
                  value={String(minutes)}
                  onChange={(e) => void changeMinutes(Number(e.target.value))}
                  aria-label="Tempo sem uso até o cofre trancar sozinho"
                  className="h-10"
                >
                  {LOCK_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {plural(option, "minuto", "minutos")} sem uso
                    </option>
                  ))}
                </Select>
              </span>
            </label>

            <LostPasswordWarning className="mt-4" />
            <p className="mt-3 flex items-start gap-2 text-xs leading-relaxed text-muted">
              <ShieldCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              <span>
                As senhas são cifradas neste aparelho (AES-256) com uma chave tirada da sua senha-mestra. O cofre
                também tranca ao sair da conta ou recarregar a página.{" "}
                <button
                  type="button"
                  onClick={() => void forgot()}
                  disabled={busy}
                  className="font-medium text-danger underline-offset-2 hover:underline disabled:opacity-50"
                >
                  Esqueci a senha-mestra
                </button>
              </span>
            </p>
          </>
        ) : null}
      </Section>

      {dialog === "create" ? <CreateVaultForm onClose={() => setDialog(null)} /> : null}
      {dialog === "unlock" ? <UnlockVaultForm onClose={() => setDialog(null)} /> : null}
      {dialog === "change" ? <ChangeMasterPasswordForm onClose={() => setDialog(null)} /> : null}
    </div>
  );
}
