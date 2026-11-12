"use client";

import { useState } from "react";
import { OctagonAlert, Pencil, Plus, TriangleAlert, UserRound } from "lucide-react";
import { formatDate, formatDateTime, formatDuration, relativeDay } from "@/lib/dates";
import { formatNumber, parseCount } from "@/lib/format";
import {
  accountToReplace,
  generationLabel,
  lifetimeDays,
  nextGeneration,
  phoneLabel,
  profileLabel,
} from "@/lib/selectors";
import { changeAccountStatus } from "@/lib/account-actions";
import { updateRow, useStore } from "@/lib/store";
import type { Account, AccountStatus, Avatar } from "@/lib/types";
import { DetailList, DetailRow } from "@/components/common/detail-row";
import { invalid } from "@/components/common/validation";
import { ACCOUNT_STATUS, AccountStatusBadge, ExampleBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Callout, Card, EmptyState, Section } from "@/components/ui/card";
import { CopyButton } from "@/components/ui/copy-button";
import { Field, Input, Select } from "@/components/ui/field";
import { FormModal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { AccountSecrets } from "@/components/vault/account-secrets";
import { useWarnings } from "@/components/warnings/use-warnings";
import { AccountForm } from "./account-form";
import { FallForm } from "./fall-form";
import { ReplacementChecklist } from "./replacement-checklist";

interface AccountTabProps {
  avatar: Avatar;
  /** Conta atual (geração mais nova que não caiu), se houver. */
  account: Account | null;
  /** Todas as contas do avatar, da mais nova para a mais antiga. */
  accounts: Account[];
}

export function AccountTab({ avatar, account, accounts }: AccountTabProps) {
  const [editing, setEditing] = useState<Account | null>(null);
  // "Conta caiu": passo 1 (data e motivo) e, em seguida, a criação da conta nova
  const [falling, setFalling] = useState<Account | null>(null);
  // (guarda só o id da conta substituída: a linha é lida de novo a cada desenho, já com a data da queda)
  const [creating, setCreating] = useState<{ replacingId: string | null } | null>(null);
  const [updatingFollowers, setUpdatingFollowers] = useState<Account | null>(null);

  return (
    <>
      {account ? (
        <CurrentAccount
          avatar={avatar}
          account={account}
          onEdit={() => setEditing(account)}
          onFell={() => setFalling(account)}
          onUpdateFollowers={() => setUpdatingFollowers(account)}
        />
      ) : (
        <NoAccount accounts={accounts} onCreate={() => setCreating({ replacingId: accountToReplace(accounts)?.id ?? null })} />
      )}

      {/* Fora dos ramos acima: se a conta deixar de ser a "atual" durante o salvamento
          (ex.: marcada como caída), a janela continua aberta até terminar. */}
      {editing ? <AccountForm avatar={avatar} account={editing} onClose={() => setEditing(null)} /> : null}
      {falling ? (
        <FallForm
          account={falling}
          nextGeneration={nextGeneration(accounts)}
          onClose={(fell) => {
            setFalling(null);
            // passo 2: a nova geração, no lugar da que caiu
            if (fell) setCreating({ replacingId: falling.id });
          }}
        />
      ) : null}
      {creating ? (
        <AccountForm
          avatar={avatar}
          replacing={accounts.find((row) => row.id === creating.replacingId)}
          onClose={() => setCreating(null)}
        />
      ) : null}
      {updatingFollowers ? (
        <FollowersForm account={updatingFollowers} onClose={() => setUpdatingFollowers(null)} />
      ) : null}
    </>
  );
}

function NoAccount({ accounts, onCreate }: { accounts: Account[]; onCreate: () => void }) {
  const last = accounts[0];
  return (
    <Card>
      <EmptyState
        icon={<UserRound />}
        title="Nenhuma conta ativa"
        action={
          <Button variant="primary" onClick={onCreate}>
            <Plus className="size-4" /> Nova conta ({generationLabel(nextGeneration(accounts))})
          </Button>
        }
      >
        {last
          ? `A última conta (@${last.handle}, ${generationLabel(last.generation)}) caiu${
              last.fell_on ? ` em ${formatDate(last.fell_on)}` : ""
            }. Suba uma nova geração para continuar: ela já vem com o mesmo @ e com o checklist de reposição.`
          : "Este avatar ainda não tem nenhuma conta cadastrada."}
      </EmptyState>
    </Card>
  );
}

interface CurrentAccountProps {
  avatar: Avatar;
  account: Account;
  onEdit: () => void;
  /** Abre o "Conta caiu" (data e motivo; depois, a conta nova). */
  onFell: () => void;
  onUpdateFollowers: () => void;
}

function CurrentAccount({ avatar, account, onEdit, onFell, onUpdateFollowers }: CurrentAccountProps) {
  const db = useStore();
  const toast = useToast();
  const phone = db.phones.find((p) => p.id === account.phone_id);
  const profile = db.profiles.find((p) => p.id === account.profile_id);
  const life = lifetimeDays(account);
  // os riscos em aberto desta conta (mesmo celular/perfil/proxy de outra conta, viva ou caída) também aparecem aqui
  const risks = useWarnings().active.filter(
    (warning) =>
      (warning.kind === "recurso_duplicado" || warning.kind === "recurso_de_caida") && warning.accountIds.includes(account.id),
  );

  async function changeStatus(next: AccountStatus) {
    if (next === account.status) return;
    if (next === "caida") {
      // precisa de data e motivo — e abre o caminho da conta nova
      onFell();
      return;
    }
    try {
      await changeAccountStatus(account, next);
      toast.success(`Status alterado para ${ACCOUNT_STATUS[next].label.toLowerCase()}`);
    } catch (err) {
      toast.error(err);
    }
  }

  return (
    <div className="space-y-4">
      {risks.map((warning) => (
        <Callout key={warning.id} tone="danger" icon={<TriangleAlert />}>
          <p className="font-medium">{warning.title}</p>
          <p>{warning.text}</p>
        </Callout>
      ))}

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
            <Button size="sm" onClick={() => onEdit()}>
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
              <Button size="sm" variant="soft" onClick={onUpdateFollowers}>
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

      <ReplacementChecklist avatar={avatar} account={account} />

      <AccountSecrets key={account.id} account={account} />

      <Card className="flex flex-col items-start gap-3 p-4 sm:flex-row sm:items-center md:p-5">
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold">Esta conta caiu?</p>
          <p className="mt-0.5 text-sm leading-relaxed text-muted">
            Marque a queda e o painel já abre a criação da {generationLabel(account.generation + 1)}, com o mesmo @, o
            kit de reposição e o checklist.
          </p>
        </div>
        <Button variant="danger-soft" onClick={onFell} className="shrink-0">
          <OctagonAlert className="size-4" /> Conta caiu
        </Button>
      </Card>
    </div>
  );
}

/** Atualização rápida do número de seguidores. */
function FollowersForm({ account, onClose }: { account: Account; onClose: () => void }) {
  const toast = useToast();
  const [value, setValue] = useState(account.followers !== null ? String(account.followers) : "");

  async function submit() {
    const followers = parseCount(value);
    if (followers === null) invalid("Não entendi o número. Exemplos: 1840, 1.840 ou 12,3 mil.");
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
