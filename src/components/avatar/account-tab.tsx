"use client";

import { useState } from "react";
import { AtSign, Pencil, Plus, UserRound } from "lucide-react";
import { formatDate, formatDateTime, formatDuration, relativeDay } from "@/lib/dates";
import { formatNumber, parseInteger } from "@/lib/format";
import { generationLabel, lifetimeDays, nextGeneration, phoneLabel, profileLabel } from "@/lib/selectors";
import { logActivity, updateRow, useStore } from "@/lib/store";
import type { Account, AccountStatus, Avatar } from "@/lib/types";
import { DetailList, DetailRow } from "@/components/common/detail-row";
import { invalid } from "@/components/common/validation";
import { ACCOUNT_STATUS, AccountStatusBadge, ExampleBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, EmptyState, Section } from "@/components/ui/card";
import { CopyButton } from "@/components/ui/copy-button";
import { Field, Input, Select } from "@/components/ui/field";
import { FormModal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { AccountForm } from "./account-form";

interface AccountTabProps {
  avatar: Avatar;
  /** Conta atual (geração mais nova que não caiu), se houver. */
  account: Account | null;
  /** Todas as contas do avatar, da mais nova para a mais antiga. */
  accounts: Account[];
}

export function AccountTab({ avatar, account, accounts }: AccountTabProps) {
  const db = useStore();
  const toast = useToast();
  const [editing, setEditing] = useState<{ status?: AccountStatus } | null>(null);
  const [creating, setCreating] = useState(false);
  const [updatingFollowers, setUpdatingFollowers] = useState(false);

  if (!account) {
    const last = accounts[0];
    return (
      <>
        <Card>
          <EmptyState
            icon={<UserRound />}
            title="Nenhuma conta ativa"
            action={
              <Button variant="primary" onClick={() => setCreating(true)}>
                <Plus className="size-4" /> Nova conta ({generationLabel(nextGeneration(accounts))})
              </Button>
            }
          >
            {last
              ? `A última conta (@${last.handle}, ${generationLabel(last.generation)}) caiu${
                  last.fell_on ? ` em ${formatDate(last.fell_on)}` : ""
                }. Suba uma nova geração para continuar.`
              : "Este avatar ainda não tem nenhuma conta cadastrada."}
          </EmptyState>
        </Card>
        {creating ? <AccountForm avatar={avatar} onClose={() => setCreating(false)} /> : null}
      </>
    );
  }

  const phone = db.phones.find((p) => p.id === account.phone_id);
  const profile = db.profiles.find((p) => p.id === account.profile_id);
  const life = lifetimeDays(account);

  async function changeStatus(next: AccountStatus) {
    if (!account || next === account.status) return;
    if (next === "caida") {
      // precisa de data e motivo: abre o formulário já marcado como caída
      setEditing({ status: "caida" });
      return;
    }
    try {
      await updateRow("accounts", account.id, { status: next });
      await logActivity({
        avatar_id: avatar.id,
        account_id: account.id,
        kind: "status_alterado",
        message: `Status: ${ACCOUNT_STATUS[account.status].label} → ${ACCOUNT_STATUS[next].label}`,
        is_example: account.is_example,
      });
      toast.success(`Status alterado para ${ACCOUNT_STATUS[next].label.toLowerCase()}`);
    } catch (err) {
      toast.error(err);
    }
  }

  return (
    <div className="space-y-4">
      <Section
        title={`@${account.handle}`}
        subtitle={
          <span className="mt-1 flex flex-wrap items-center gap-1.5">
            <AccountStatusBadge status={account.status} />
            <span className="text-sm text-muted">{generationLabel(account.generation)}</span>
            {account.is_example ? <ExampleBadge /> : null}
          </span>
        }
        actions={
          <>
            <CopyButton text={`@${account.handle}`} message="@ copiado" />
            <Button size="sm" onClick={() => setEditing({})}>
              <Pencil className="size-4" /> Editar
            </Button>
          </>
        }
      >
        <DetailList>
          <DetailRow label="Status">
            <Select
              value={account.status}
              onChange={(e) => void changeStatus(e.target.value as AccountStatus)}
              aria-label="Status da conta"
              className="h-10"
            >
              {(Object.keys(ACCOUNT_STATUS) as AccountStatus[]).map((key) => (
                <option key={key} value={key}>
                  {ACCOUNT_STATUS[key].label}
                </option>
              ))}
            </Select>
          </DetailRow>
          <DetailRow label="E-mail" value={account.email} copy copyMessage="E-mail copiado" />
          <DetailRow label="Celular" value={phone ? phoneLabel(phone) : null}>
            {phone ? (
              <span>
                {phoneLabel(phone)}
                {phone.number ? <span className="block text-sm text-muted">{phone.number}</span> : null}
              </span>
            ) : undefined}
          </DetailRow>
          <DetailRow label="Perfil anti-detect" value={profile ? profileLabel(profile) : null} />
          <DetailRow label="Proxy / IP" value={account.proxy} copy copyMessage="Proxy copiado" mono />
          <DetailRow label="Criada em" value={formatDate(account.created_on)}>
            <span>
              {formatDate(account.created_on)}{" "}
              <span className="text-sm text-muted">({relativeDay(account.created_on)})</span>
            </span>
          </DetailRow>
          {life !== null ? <DetailRow label="Tempo de vida" value={formatDuration(life)} /> : null}
          <DetailRow label="Seguidores">
            <span className="flex items-center justify-between gap-3">
              <span>
                <span className="font-semibold tabular-nums">{formatNumber(account.followers)}</span>
                {account.followers_updated_at ? (
                  <span className="block text-xs text-muted">
                    atualizado em {formatDateTime(account.followers_updated_at)}
                  </span>
                ) : null}
              </span>
              <Button size="sm" variant="soft" onClick={() => setUpdatingFollowers(true)}>
                Atualizar
              </Button>
            </span>
          </DetailRow>
          {account.notes ? (
            <DetailRow label="Anotações">
              <span className="whitespace-pre-wrap">{account.notes}</span>
            </DetailRow>
          ) : null}
        </DetailList>
      </Section>

      <p className="flex items-start gap-2 px-1 text-xs leading-relaxed text-muted">
        <AtSign className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        Senhas e códigos de backup desta conta ficarão aqui a partir da etapa do cofre (criptografados com a sua
        senha-mestra).
      </p>

      {editing ? (
        <AccountForm
          avatar={avatar}
          account={account}
          initialStatus={editing.status}
          onClose={() => setEditing(null)}
        />
      ) : null}
      {updatingFollowers ? <FollowersForm account={account} onClose={() => setUpdatingFollowers(false)} /> : null}
    </div>
  );
}

/** Atualização rápida do número de seguidores. */
function FollowersForm({ account, onClose }: { account: Account; onClose: () => void }) {
  const toast = useToast();
  const [value, setValue] = useState(account.followers !== null ? String(account.followers) : "");

  async function submit() {
    const followers = parseInteger(value);
    if (followers === null || followers < 0) invalid("Digite o número de seguidores (só números).");
    await updateRow("accounts", account.id, { followers, followers_updated_at: new Date().toISOString() });
    toast.success("Seguidores atualizados");
  }

  return (
    <FormModal title="Atualizar seguidores" description={`@${account.handle}`} onClose={onClose} onSubmit={submit} size="sm">
      <Field label="Seguidores hoje">
        <Input value={value} onChange={(e) => setValue(e.target.value)} inputMode="numeric" autoComplete="off" autoFocus />
      </Field>
    </FormModal>
  );
}
