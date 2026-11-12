"use client";

import { useMemo, useState } from "react";
import { TriangleAlert } from "lucide-react";
import { formatDate, isValidISODate, todayISO } from "@/lib/dates";
import { clean, normalizeHandle, parseCount } from "@/lib/format";
import { FALL_REASONS } from "@/lib/reference";
import {
  accountsOf,
  describeAccount,
  generationLabel,
  latestAccount,
  nextGeneration,
  normalizeProxy,
  usageByPhone,
  usageByProfile,
  usageByProxy,
  type Usage,
} from "@/lib/selectors";
import { insertRow, logActivity, updateRow, useStore, type Db } from "@/lib/store";
import type { Account, AccountStatus, Avatar, RowPatch } from "@/lib/types";
import { invalid } from "@/components/common/validation";
import { PhoneForm } from "@/components/infra/phone-form";
import { ProfileForm } from "@/components/infra/profile-form";
import { ACCOUNT_STATUS } from "@/components/ui/badge";
import { Callout } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { FormModal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";

const NEW = "__novo__";

interface AccountFormProps {
  avatar: Avatar;
  account?: Account;
  /** Abre o formulário já com este status escolhido (ex.: marcar como caída). */
  initialStatus?: AccountStatus;
  onClose: () => void;
  onSaved?: (account: Account) => void;
}

function withoutSelf(usage: Usage | undefined, selfId: string | undefined): Usage {
  if (!usage) return { live: [], fallen: [] };
  return {
    live: usage.live.filter((a) => a.id !== selfId),
    fallen: usage.fallen.filter((a) => a.id !== selfId),
  };
}

function usageSuffix(usage: Usage): string {
  if (usage.live.length > 0) return " · em uso";
  if (usage.fallen.length > 0) return " · usado por conta caída";
  return "";
}

/** Aviso quando o celular/perfil/proxy escolhido já foi (ou está sendo) usado por outra conta. */
function ReuseWarning({ what, usage, db }: { what: string; usage: Usage; db: Db }) {
  if (usage.live.length === 0 && usage.fallen.length === 0) return null;
  return (
    <Callout tone={usage.fallen.length > 0 ? "danger" : "warn"} icon={<TriangleAlert />} className="mt-2">
      {usage.live.length > 0 ? (
        <p>
          <strong>{what} já está em uso</strong> por {usage.live.map((a) => describeAccount(db, a)).join("; ")}.
        </p>
      ) : null}
      {usage.fallen.length > 0 ? (
        <p>
          <strong>{what} foi usado por conta que caiu</strong>:{" "}
          {usage.fallen
            .map((a) => `${describeAccount(db, a)}${a.fell_on ? `, caiu em ${formatDate(a.fell_on)}` : ""}`)
            .join("; ")}
          . Reutilizar pode vincular as contas.
        </p>
      ) : null}
    </Callout>
  );
}

/** Criar ou editar uma conta (geração) de um avatar. */
export function AccountForm({ avatar, account, initialStatus, onClose, onSaved }: AccountFormProps) {
  const db = useStore();
  const toast = useToast();

  const siblings = useMemo(() => accountsOf(db, avatar.id), [db, avatar.id]);
  const previous = latestAccount(siblings);

  const [handle, setHandle] = useState(account?.handle ?? previous?.handle ?? "");
  const [generation, setGeneration] = useState(String(account?.generation ?? nextGeneration(siblings)));
  const [status, setStatus] = useState<AccountStatus>(initialStatus ?? account?.status ?? "aquecendo");
  const [email, setEmail] = useState(account?.email ?? "");
  const [phoneId, setPhoneId] = useState(account?.phone_id ?? "");
  const [profileId, setProfileId] = useState(account?.profile_id ?? "");
  const [proxy, setProxy] = useState(account?.proxy ?? "");
  const [createdOn, setCreatedOn] = useState(account?.created_on ?? todayISO());
  const [followers, setFollowers] = useState(
    account?.followers !== null && account?.followers !== undefined ? String(account.followers) : "",
  );
  const [notes, setNotes] = useState(account?.notes ?? "");
  const [fellOn, setFellOn] = useState(account?.fell_on ?? todayISO());
  const [fallReason, setFallReason] = useState(account?.fall_reason ?? "");
  const [creating, setCreating] = useState<"phone" | "profile" | null>(null);

  const phoneUsage = useMemo(() => usageByPhone(db), [db]);
  const profileUsage = useMemo(() => usageByProfile(db), [db]);
  const proxyUsage = useMemo(() => usageByProxy(db), [db]);

  const selfId = account?.id;
  const fallen = status === "caida";
  const proxyKey = normalizeProxy(proxy);

  function chooseProfile(id: string) {
    if (id === NEW) {
      setCreating("profile");
      return;
    }
    const before = db.profiles.find((p) => p.id === profileId);
    const next = db.profiles.find((p) => p.id === id);
    setProfileId(id);
    // preenche o proxy com o do perfil, se o campo estava vazio ou ainda era o do perfil anterior
    if (next?.proxy && (!proxy.trim() || normalizeProxy(proxy) === normalizeProxy(before?.proxy))) {
      setProxy(next.proxy);
    }
  }

  async function submit() {
    const cleanHandle = normalizeHandle(handle);
    if (!cleanHandle) invalid("Informe o @ do Instagram.");
    const gen = Number(generation);
    if (!Number.isInteger(gen) || gen < 1) invalid("A geração deve ser um número a partir de 1.");
    if (siblings.some((a) => a.id !== selfId && a.generation === gen)) {
      invalid(`Este avatar já tem uma conta na ${generationLabel(gen)}. Use outro número.`);
    }
    const today = todayISO();
    if (!isValidISODate(createdOn)) invalid("Informe uma data de criação válida.");
    if (createdOn > today) invalid("A data de criação não pode ser no futuro.");
    if (createdOn < "2010-01-01") invalid("Confira o ano da data de criação.");
    if (fallen) {
      if (!isValidISODate(fellOn)) invalid("Informe uma data válida para a queda da conta.");
      if (fellOn > today) invalid("A data da queda não pode ser no futuro.");
      if (fellOn < createdOn) invalid("A data da queda não pode ser anterior à data de criação.");
    }
    const followersNumber = followers.trim() ? parseCount(followers) : null;
    if (followers.trim() && followersNumber === null) {
      invalid("Não entendi o número de seguidores. Exemplos: 1840, 1.840 ou 12,3 mil.");
    }

    const values = {
      handle: cleanHandle,
      generation: gen,
      status,
      email: clean(email)?.toLowerCase() ?? null,
      phone_id: phoneId || null,
      profile_id: profileId || null,
      proxy: clean(proxy),
      created_on: createdOn,
      followers: followersNumber,
      notes: clean(notes),
      fell_on: fallen ? fellOn : null,
      fall_reason: fallen ? clean(fallReason) : null,
    };
    const fallMessage = `Conta caiu${values.fall_reason ? ` — ${values.fall_reason}` : ""}`;

    if (!account) {
      const row = await insertRow("accounts", {
        ...values,
        avatar_id: avatar.id,
        followers_updated_at: followersNumber !== null ? new Date().toISOString() : null,
      });
      await logActivity({
        avatar_id: avatar.id,
        account_id: row.id,
        kind: "conta_criada",
        message: `Conta criada (${generationLabel(gen)})`,
      });
      if (fallen) {
        await logActivity({ avatar_id: avatar.id, account_id: row.id, kind: "caiu", message: fallMessage });
      }
      toast.success("Conta criada");
      onSaved?.(row);
      return;
    }

    // edição: envia só o que mudou
    const patch: RowPatch<"accounts"> = {};
    for (const key of Object.keys(values) as Array<keyof typeof values>) {
      if (values[key] !== account[key]) {
        (patch as Record<string, unknown>)[key] = values[key];
      }
    }
    if ("followers" in patch) patch.followers_updated_at = new Date().toISOString();
    if (Object.keys(patch).length === 0) return;

    await updateRow("accounts", account.id, patch);
    if (patch.status) {
      await logActivity({
        avatar_id: avatar.id,
        account_id: account.id,
        kind: fallen ? "caiu" : "status_alterado",
        message: fallen
          ? fallMessage
          : `Status: ${ACCOUNT_STATUS[account.status].label} → ${ACCOUNT_STATUS[status].label}`,
        is_example: account.is_example,
      });
    }
    toast.success("Conta atualizada");
  }

  const reasonSuggestions = useMemo(() => {
    const used = db.accounts.map((a) => a.fall_reason).filter((r): r is string => Boolean(r));
    return [...new Set([...used, ...FALL_REASONS])].slice(0, 8);
  }, [db.accounts]);

  return (
    <>
      <FormModal
        title={account ? `Editar conta (${generationLabel(account.generation)})` : "Nova conta"}
        description={
          account
            ? undefined
            : `Uma nova geração do avatar ${avatar.name}. O @ já vem preenchido com o da conta anterior.`
        }
        onClose={onClose}
        onSubmit={submit}
      >
        <Field label="@ do Instagram">
          <span className="relative block">
            <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted">@</span>
            <Input
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              placeholder="nome.da.conta"
              className="pl-8"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
            />
          </span>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Geração">
            <Input value={generation} onChange={(e) => setGeneration(e.target.value)} inputMode="numeric" autoComplete="off" />
          </Field>
          <Field label="Status">
            <Select value={status} onChange={(e) => setStatus(e.target.value as AccountStatus)}>
              {(Object.keys(ACCOUNT_STATUS) as AccountStatus[]).map((key) => (
                <option key={key} value={key}>
                  {ACCOUNT_STATUS[key].label}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        {fallen ? (
          <div className="space-y-4 rounded-2xl border border-red-500/30 bg-red-500/5 p-3.5">
            <Field label="Data da queda">
              <Input type="date" value={fellOn} max={todayISO()} onChange={(e) => setFellOn(e.target.value)} />
            </Field>
            <Field label="Motivo provável" optional>
              <Input
                value={fallReason}
                onChange={(e) => setFallReason(e.target.value)}
                placeholder="O que você acha que causou a queda"
                autoComplete="off"
              />
            </Field>
            <div className="flex flex-wrap gap-1.5">
              {reasonSuggestions.map((reason) => (
                <button
                  key={reason}
                  type="button"
                  onClick={() => setFallReason(reason)}
                  className="rounded-full border border-line bg-surface px-2.5 py-1 text-xs text-muted transition-colors hover:text-fg"
                >
                  {reason}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <Field label="E-mail da conta" optional>
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="conta@exemplo.com"
            inputMode="email"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
          />
        </Field>

        <div>
          <Field label="Celular" optional>
            <Select value={phoneId} onChange={(e) => (e.target.value === NEW ? setCreating("phone") : setPhoneId(e.target.value))}>
              <option value="">— Não informado —</option>
              {db.phones.map((phone) => (
                <option key={phone.id} value={phone.id}>
                  {phone.nickname}
                  {phone.model ? ` (${phone.model})` : ""}
                  {usageSuffix(withoutSelf(phoneUsage.get(phone.id), selfId))}
                </option>
              ))}
              <option value={NEW}>＋ Cadastrar novo celular…</option>
            </Select>
          </Field>
          {!fallen && phoneId ? (
            <ReuseWarning what="Este celular" usage={withoutSelf(phoneUsage.get(phoneId), selfId)} db={db} />
          ) : null}
        </div>

        <div>
          <Field label="Perfil no anti-detect" optional>
            <Select value={profileId} onChange={(e) => chooseProfile(e.target.value)}>
              <option value="">— Não informado —</option>
              {db.profiles.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  Perfil {profile.number}
                  {profile.name ? ` — ${profile.name}` : ""}
                  {usageSuffix(withoutSelf(profileUsage.get(profile.id), selfId))}
                </option>
              ))}
              <option value={NEW}>＋ Cadastrar novo perfil…</option>
            </Select>
          </Field>
          {!fallen && profileId ? (
            <ReuseWarning what="Este perfil" usage={withoutSelf(profileUsage.get(profileId), selfId)} db={db} />
          ) : null}
        </div>

        <div>
          <Field label="Proxy / IP usado" optional>
            <Input
              value={proxy}
              onChange={(e) => setProxy(e.target.value)}
              placeholder="it-res-01.exemplo.net:8000"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
            />
          </Field>
          {!fallen && proxyKey ? (
            <ReuseWarning what="Este proxy" usage={withoutSelf(proxyUsage.get(proxyKey), selfId)} db={db} />
          ) : null}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Criada em">
            <Input type="date" value={createdOn} max={todayISO()} onChange={(e) => setCreatedOn(e.target.value)} />
          </Field>
          <Field label="Seguidores" optional>
            <Input value={followers} onChange={(e) => setFollowers(e.target.value)} inputMode="numeric" placeholder="0" autoComplete="off" />
          </Field>
        </div>

        <Field label="Anotações" optional>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
        </Field>

        <p className="text-xs leading-relaxed text-muted">
          Senhas e códigos de backup entram na etapa do cofre (criptografados com a sua senha-mestra).
        </p>
      </FormModal>

      {/* Fora do formulário acima: cadastro rápido de celular / perfil */}
      {creating === "phone" ? (
        <PhoneForm onClose={() => setCreating(null)} onSaved={(phone) => setPhoneId(phone.id)} />
      ) : null}
      {creating === "profile" ? (
        <ProfileForm
          onClose={() => setCreating(null)}
          onSaved={(profile) => {
            setProfileId(profile.id);
            if (profile.proxy && !proxy.trim()) setProxy(profile.proxy);
          }}
        />
      ) : null}
    </>
  );
}
