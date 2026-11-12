"use client";

import { useState } from "react";
import { History, KeyRound, Pencil, Plus, Trash2 } from "lucide-react";
import { formatDate, formatDateTime, formatDuration } from "@/lib/dates";
import { formatNumber } from "@/lib/format";
import { generationLabel, lifetimeDays, phoneLabel, profileShortLabel } from "@/lib/selectors";
import { deleteRow, useStore } from "@/lib/store";
import type { Account, Avatar } from "@/lib/types";
import { AccountStatusBadge, ExampleBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, EmptyState } from "@/components/ui/card";
import { useConfirm } from "@/components/ui/confirm";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { AccountSecrets } from "@/components/vault/account-secrets";
import { AccountForm } from "./account-form";

interface HistoryTabProps {
  avatar: Avatar;
  /** Da geração mais nova para a mais antiga. */
  accounts: Account[];
}

export function HistoryTab({ avatar, accounts }: HistoryTabProps) {
  const db = useStore();
  const toast = useToast();
  const confirm = useConfirm();
  const [editing, setEditing] = useState<Account | "new" | null>(null);
  const [secretsOf, setSecretsOf] = useState<string | null>(null);
  const secretsAccount = accounts.find((a) => a.id === secretsOf);

  const fallenLives = accounts
    .filter((a) => a.status === "caida")
    .map((a) => lifetimeDays(a))
    .filter((d): d is number => d !== null);
  const averageLife =
    fallenLives.length > 0 ? Math.round(fallenLives.reduce((sum, d) => sum + d, 0) / fallenLives.length) : null;

  async function remove(account: Account) {
    const ok = await confirm({
      title: `Apagar a conta @${account.handle} (${generationLabel(account.generation)})?`,
      message:
        "A conta sai do histórico junto com a linha do tempo e o aquecimento dela. As vendas lançadas continuam no avatar. Esta ação não pode ser desfeita.",
      confirmLabel: "Apagar conta",
      tone: "danger",
    });
    if (!ok) return;
    try {
      await deleteRow("accounts", account.id);
      toast.success("Conta apagada");
    } catch (err) {
      toast.error(err);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted">
          {accounts.length === 0
            ? "Nenhuma conta cadastrada."
            : `${accounts.length === 1 ? "1 conta" : `${accounts.length} contas`}${
                averageLife !== null ? ` · as que caíram viveram em média ${formatDuration(averageLife)}` : ""
              }`}
        </p>
        <Button size="sm" variant="soft" onClick={() => setEditing("new")}>
          <Plus className="size-4" /> Nova conta
        </Button>
      </div>

      {accounts.length === 0 ? (
        <Card>
          <EmptyState icon={<History />} title="Sem histórico ainda">
            Quando você cadastrar contas para este avatar, todas as gerações aparecem aqui.
          </EmptyState>
        </Card>
      ) : (
        accounts.map((account) => {
          const phone = db.phones.find((p) => p.id === account.phone_id);
          const profile = db.profiles.find((p) => p.id === account.profile_id);
          const life = lifetimeDays(account);
          const events = db.activity.filter((e) => e.account_id === account.id);
          const fallen = account.status === "caida";
          return (
            <Card key={account.id} className="p-4 md:p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                    {generationLabel(account.generation)}
                  </p>
                  <p className="mt-0.5 break-all text-[15px] font-semibold">@{account.handle}</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <AccountStatusBadge status={account.status} />
                    {account.is_example ? <ExampleBadge /> : null}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    iconOnly
                    aria-label="Senhas da conta"
                    title={account.secrets_enc ? "Senhas guardadas no cofre" : "Senhas da conta"}
                    onClick={() => setSecretsOf(account.id)}
                  >
                    <KeyRound className={account.secrets_enc ? "size-4 text-primary" : "size-4 text-muted"} />
                  </Button>
                  <Button size="sm" variant="ghost" iconOnly aria-label="Editar conta" onClick={() => setEditing(account)}>
                    <Pencil className="size-4 text-muted" />
                  </Button>
                  <Button size="sm" variant="ghost" iconOnly aria-label="Apagar conta" onClick={() => void remove(account)}>
                    <Trash2 className="size-4 text-muted" />
                  </Button>
                </div>
              </div>

              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5 text-sm">
                <div>
                  <dt className="text-muted">Criada em</dt>
                  <dd className="font-medium">{formatDate(account.created_on)}</dd>
                </div>
                <div>
                  <dt className="text-muted">{fallen ? "Caiu em" : "Tempo de vida"}</dt>
                  <dd className="font-medium">
                    {fallen ? formatDate(account.fell_on) : life !== null ? formatDuration(life) : "—"}
                  </dd>
                </div>
                {fallen ? (
                  <div>
                    <dt className="text-muted">Viveu</dt>
                    <dd className="font-medium">{life !== null ? formatDuration(life) : "—"}</dd>
                  </div>
                ) : null}
                <div>
                  <dt className="text-muted">Seguidores</dt>
                  <dd className="font-medium tabular-nums">{formatNumber(account.followers)}</dd>
                </div>
                <div>
                  <dt className="text-muted">Celular</dt>
                  <dd className="font-medium">{phone ? phoneLabel(phone) : "—"}</dd>
                </div>
                <div>
                  <dt className="text-muted">Perfil anti-detect</dt>
                  <dd className="font-medium">{profile ? profileShortLabel(profile) : "—"}</dd>
                </div>
                {account.proxy ? (
                  <div className="col-span-2">
                    <dt className="text-muted">Proxy / IP</dt>
                    <dd className="break-all font-mono text-[13px]">{account.proxy}</dd>
                  </div>
                ) : null}
                {fallen ? (
                  <div className="col-span-2">
                    <dt className="text-muted">Motivo provável</dt>
                    <dd className="font-medium">{account.fall_reason || "—"}</dd>
                  </div>
                ) : null}
                {account.notes ? (
                  <div className="col-span-2">
                    <dt className="text-muted">Anotações</dt>
                    <dd className="whitespace-pre-wrap">{account.notes}</dd>
                  </div>
                ) : null}
              </dl>

              {events.length > 0 ? (
                <details className="group mt-4 rounded-xl bg-surface-2/70 px-3.5 py-2.5">
                  <summary className="cursor-pointer select-none text-sm font-medium text-muted marker:text-muted hover:text-fg">
                    Linha do tempo ({events.length})
                  </summary>
                  <ol className="mt-2.5 space-y-2.5 border-l-2 border-line pl-4">
                    {[...events].reverse().map((event) => (
                      <li key={event.id} className="relative text-sm">
                        <span className="absolute -left-[21px] top-1.5 size-2 rounded-full bg-line-strong" aria-hidden />
                        <p className="leading-snug">{event.message}</p>
                        <p className="text-xs text-muted">{formatDateTime(event.occurred_at)}</p>
                      </li>
                    ))}
                  </ol>
                </details>
              ) : null}
            </Card>
          );
        })
      )}

      {editing ? (
        <AccountForm
          avatar={avatar}
          account={editing === "new" ? undefined : editing}
          onClose={() => setEditing(null)}
        />
      ) : null}
      {secretsAccount ? (
        <Modal
          open
          onClose={() => setSecretsOf(null)}
          title="Senhas e códigos"
          description={`@${secretsAccount.handle} · ${generationLabel(secretsAccount.generation)}`}
        >
          <AccountSecrets key={secretsAccount.id} account={secretsAccount} bare />
        </Modal>
      ) : null}
    </div>
  );
}
