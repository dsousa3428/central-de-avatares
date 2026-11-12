"use client";

import { useMemo, useState } from "react";
import { TriangleAlert } from "lucide-react";
import { formatDate, isValidISODate, todayISO } from "@/lib/dates";
import { clean, normalizeHandle, parseCount } from "@/lib/format";
import { factsOf, newChecklist, readChecklist, syncChecklist } from "@/lib/replacement";
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
import { afterStatusChange } from "@/lib/account-actions";
import { insertRow, logActivity, updateRow, useStore, type Db } from "@/lib/store";
import { describePlan, planFromSettings } from "@/lib/warmup";
import { startWarmup } from "@/lib/warmup-actions";
import { acknowledgeReuse } from "@/lib/warning-actions";
import type { Account, AccountStatus, Avatar, RowPatch } from "@/lib/types";
import { invalid } from "@/components/common/validation";
import { PhoneForm } from "@/components/infra/phone-form";
import { ProfileForm } from "@/components/infra/profile-form";
import { ACCOUNT_STATUS } from "@/components/ui/badge";
import { Callout } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { FormModal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { checkFallDate, FallFields } from "./fall-fields";

const NEW = "__novo__";

interface AccountFormProps {
  avatar: Avatar;
  account?: Account;
  /** Abre o formulário já com este status escolhido (ex.: marcar como caída). */
  initialStatus?: AccountStatus;
  /**
   * Reposição: a conta nova entra no lugar desta, que caiu. A conta nova ganha o
   * checklist de reposição (só vale ao criar).
   */
  replacing?: Account;
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

/** O que aparece ao lado de um celular ou perfil na lista: " · em uso", " · usado por conta caída" (ou os dois). */
function usageSuffix(usage: Usage): string {
  const notes = [usage.live.length > 0 ? "em uso" : null, usage.fallen.length > 0 ? "usado por conta caída" : null];
  return notes
    .filter(Boolean)
    .map((note) => ` · ${note}`)
    .join("");
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

/** "o celular e o proxy", "o celular, o perfil e o proxy" */
function joinWords(words: string[]): string {
  if (words.length <= 1) return words.join("");
  return `${words.slice(0, -1).join(", ")} e ${words[words.length - 1]}`;
}

/** Criar ou editar uma conta (geração) de um avatar. */
export function AccountForm({ avatar, account, initialStatus, replacing, onClose, onSaved }: AccountFormProps) {
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
  const [withWarmup, setWithWarmup] = useState(true);
  // a confirmação de reuso vale para a escolha em que foi marcada: trocar celular, perfil ou proxy pede de novo
  const [reuseConfirmedFor, setReuseConfirmedFor] = useState("");
  const warmupPlan = planFromSettings(db.settings);

  const phoneUsage = useMemo(() => usageByPhone(db), [db]);
  const profileUsage = useMemo(() => usageByProfile(db), [db]);
  const proxyUsage = useMemo(() => usageByProxy(db), [db]);

  const selfId = account?.id;
  const fallen = status === "caida";
  const proxyKey = normalizeProxy(proxy);

  // Celular, perfil ou proxy que já foram de uma conta que caiu só entram com confirmação.
  // (Na edição, só o que foi trocado agora: o que a conta já tinha não é perguntado de novo.)
  const reused: Array<{ key: string; word: string }> = [];
  if (!fallen) {
    if (phoneId && phoneId !== (account?.phone_id ?? "") && withoutSelf(phoneUsage.get(phoneId), selfId).fallen.length > 0) {
      reused.push({ key: `celular:${phoneId}`, word: "o celular" });
    }
    if (
      profileId &&
      profileId !== (account?.profile_id ?? "") &&
      withoutSelf(profileUsage.get(profileId), selfId).fallen.length > 0
    ) {
      reused.push({ key: `perfil:${profileId}`, word: "o perfil" });
    }
    if (
      proxyKey &&
      proxyKey !== normalizeProxy(account?.proxy) &&
      withoutSelf(proxyUsage.get(proxyKey), selfId).fallen.length > 0
    ) {
      reused.push({ key: `proxy:${proxyKey}`, word: "o proxy" });
    }
  }
  const reuseKey = reused.map((item) => item.key).join("|");
  const reuseWords = joinWords(reused.map((item) => item.word));
  const reuseConfirmed = reused.length === 0 || reuseConfirmedFor === reuseKey;

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
    if (fallen) checkFallDate(fellOn, createdOn);
    if (!reuseConfirmed) {
      invalid(
        `Você escolheu ${reuseWords} de uma conta que caiu. Troque por outro ou marque a confirmação no fim do formulário.`,
      );
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
        // reposição: a conta nova já nasce com o checklist (o que os dados dela respondem vem marcado)
        ...(replacing && !fallen ? { checklist: syncChecklist(newChecklist(), factsOf(values, false)) } : {}),
      });
      await logActivity({
        avatar_id: avatar.id,
        account_id: row.id,
        kind: "conta_criada",
        message: replacing
          ? `Conta criada (${generationLabel(gen)}) no lugar da ${generationLabel(replacing.generation)}, que caiu`
          : `Conta criada (${generationLabel(gen)})`,
      });
      if (fallen) {
        await logActivity({ avatar_id: avatar.id, account_id: row.id, kind: "caiu", message: fallMessage });
      }
      if (status === "aquecendo" && withWarmup) {
        try {
          await startWarmup(row, createdOn, warmupPlan);
        } catch (err) {
          // a conta foi criada; o calendário pode ser iniciado depois, na aba Aquecimento
          toast.error(err);
        }
      }
      if (reused.length > 0) await acknowledgeReuse(row.id).catch(() => undefined);
      toast.success(replacing && !fallen ? "Conta criada. Siga o checklist de reposição." : "Conta criada");
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

    await updateRow("accounts", account.id, (row) => {
      // conta de reposição: o que acabou de ser preenchido (e-mail, perfil, proxy, celular) marca o checklist
      const list = readChecklist(row.checklist);
      if (!list) return patch;
      const synced = syncChecklist(list, factsOf({ ...row, ...patch }, false));
      return synced === list ? patch : { ...patch, checklist: synced };
    });
    if (patch.status) await afterStatusChange(account, account.status, status, values.fall_reason);
    if (reused.length > 0) await acknowledgeReuse(account.id).catch(() => undefined);
    toast.success("Conta atualizada");
  }

  return (
    <>
      <FormModal
        title={account ? `Editar conta (${generationLabel(account.generation)})` : "Nova conta"}
        description={
          account
            ? undefined
            : replacing
              ? `Passo 2 de 2 · Reposição de @${replacing.handle} (${generationLabel(replacing.generation)})${
                  replacing.fell_on ? `, que caiu em ${formatDate(replacing.fell_on)}` : ""
                }. O @ já vem preenchido; e-mail, celular, perfil e proxy começam em branco, para você colocar os novos.`
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
            <FallFields fellOn={fellOn} onFellOn={setFellOn} reason={fallReason} onReason={setFallReason} />
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

        {reused.length > 0 ? (
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-red-500/40 bg-red-500/5 p-3.5">
            <input
              type="checkbox"
              checked={reuseConfirmed}
              onChange={(e) => setReuseConfirmedFor(e.target.checked ? reuseKey : "")}
              className="mt-0.5 size-5 shrink-0 accent-[var(--danger)]"
            />
            <span className="text-sm leading-relaxed">
              <span className="font-medium">Reutilizar {reuseWords} de conta que caiu</span>
              <span className="block text-muted">
                Sem marcar, o painel não salva. Reutilizar pode vincular esta conta à que caiu: o mais seguro é
                escolher outro.
              </span>
            </span>
          </label>
        ) : null}

        {!account && status === "aquecendo" ? (
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-line bg-surface-2/60 p-3.5">
            <input
              type="checkbox"
              checked={withWarmup}
              onChange={(e) => setWithWarmup(e.target.checked)}
              className="mt-0.5 size-5 shrink-0 accent-[var(--primary)]"
            />
            <span className="text-sm leading-relaxed">
              <span className="font-medium">Criar o calendário de aquecimento</span>
              <span className="block text-muted">
                {describePlan(warmupPlan)}, começando na data de criação. Você ajusta depois, dia a dia.
              </span>
            </span>
          </label>
        ) : null}

        <p className="text-xs leading-relaxed text-muted">
          {replacing && !account
            ? "Depois de salvar, o checklist de reposição aparece na aba Conta atual, com o kit ao lado de cada passo. "
            : ""}
          As senhas e os códigos de backup ficam no cofre: depois de salvar, abra “Senhas e códigos” na aba Conta
          atual.
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
