"use client";

import { useRef } from "react";
import Link from "next/link";
import { Check } from "lucide-react";
import { cn } from "@/lib/format";
import { checklistProgress, readChecklist } from "@/lib/replacement";
import { removeChecklist, setChecklistItem } from "@/lib/replacement-actions";
import { phoneLabel, profileLabel, warmupOf } from "@/lib/selectors";
import { useStore } from "@/lib/store";
import type { Account, Avatar, ChecklistItem } from "@/lib/types";
import { ExternalLinkText } from "@/components/common/detail-row";
import { Button } from "@/components/ui/button";
import { Section } from "@/components/ui/card";
import { useConfirm } from "@/components/ui/confirm";
import { CopyButton } from "@/components/ui/copy-button";
import { useToast } from "@/components/ui/toast";

interface ReplacementChecklistProps {
  avatar: Avatar;
  account: Account;
}

/**
 * Checklist de reposição da conta nova: o que falta para ela ficar no ar, com o
 * que está no kit de reposição logo ao lado de cada passo (é só copiar e colar).
 */
export function ReplacementChecklist({ avatar, account }: ReplacementChecklistProps) {
  const toast = useToast();
  const confirm = useConfirm();
  // itens com gravação em andamento: um segundo toque no mesmo item é ignorado até a primeira terminar
  const saving = useRef(new Set<string>());

  const list = readChecklist(account.checklist);
  if (!list) return null;
  const progress = checklistProgress(list);
  const percent = Math.round((progress.done / progress.total) * 100);

  async function toggle(item: ChecklistItem) {
    if (saving.current.has(item.key)) return;
    saving.current.add(item.key);
    try {
      await setChecklistItem(account, item.key, !item.done);
    } catch (err) {
      toast.error(err);
    } finally {
      saving.current.delete(item.key);
    }
  }

  async function remove() {
    if (!progress.complete) {
      const ok = await confirm({
        title: "Dispensar o checklist?",
        message: `Ainda ${progress.pending.length === 1 ? "falta 1 item" : `faltam ${progress.pending.length} itens`}. O checklist sai desta conta (a conta em si não muda).`,
        confirmLabel: "Dispensar",
      });
      if (!ok) return;
    }
    try {
      await removeChecklist(account);
      toast.success(progress.complete ? "Reposição concluída" : "Checklist dispensado");
    } catch (err) {
      toast.error(err);
    }
  }

  return (
    <Section
      title="Checklist de reposição"
      subtitle={progress.complete ? "Tudo feito: a conta nova está no ar." : `${progress.done} de ${progress.total} feitos`}
      actions={
        <Button size="sm" variant={progress.complete ? "primary" : "ghost"} onClick={() => void remove()}>
          {progress.complete ? "Concluir" : "Dispensar"}
        </Button>
      }
    >
      <div
        role="progressbar"
        aria-label="Progresso da reposição"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        className="h-2 w-full overflow-hidden rounded-full bg-surface-2"
      >
        <div
          className={cn("h-full rounded-full transition-[width] duration-300", progress.complete ? "bg-emerald-500" : "bg-primary")}
          style={{ width: `${percent}%` }}
        />
      </div>

      <ul className="mt-2 divide-y divide-line">
        {list.map((item) => (
          <li key={item.key} className="py-1.5">
            <button
              type="button"
              role="checkbox"
              aria-checked={item.done}
              onClick={() => void toggle(item)}
              className="flex min-h-11 w-full items-center gap-3 rounded-lg text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <span
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center rounded-md border-2 transition-colors",
                  item.done ? "border-emerald-500 bg-emerald-500 text-white" : "border-line-strong bg-surface",
                )}
                aria-hidden
              >
                {item.done ? <Check className="size-4" strokeWidth={3} /> : null}
              </span>
              <span className={cn("min-w-0 flex-1 text-[15px] font-medium", item.done && "text-muted line-through")}>
                {item.label}
              </span>
            </button>
            <div className="pb-1.5 pl-9">
              <ItemDetails itemKey={item.key} avatar={avatar} account={account} />
            </div>
          </li>
        ))}
      </ul>
    </Section>
  );
}

/** Texto de apoio (o que falta fazer, ou onde preencher). */
function Hint({ children }: { children: React.ReactNode }) {
  return <p className="text-sm leading-relaxed text-muted">{children}</p>;
}

/** Um valor pronto para copiar. */
function Value({ label, text, message, mono }: { label?: string; text: string; message: string; mono?: boolean }) {
  return (
    <div className="flex items-start gap-2">
      <p className="min-w-0 flex-1 py-1 text-sm leading-relaxed">
        {label ? <span className="text-muted">{label}: </span> : null}
        <span className={cn("whitespace-pre-wrap", mono && "font-mono text-[13px]")}>{text}</span>
      </p>
      <CopyButton text={text} message={message} />
    </div>
  );
}

function TabLink({ avatarId, tab, children }: { avatarId: string; tab: string; children: React.ReactNode }) {
  return (
    <Link href={`/avatar?id=${avatarId}&aba=${tab}`} className="font-medium text-primary underline-offset-2 hover:underline">
      {children}
    </Link>
  );
}

/** O que mostrar embaixo de cada passo: o dado da conta, ou o que o kit de reposição tem para aquele passo. */
function ItemDetails({ itemKey, avatar, account }: { itemKey: string; avatar: Avatar; account: Account }) {
  const db = useStore();
  const kit = avatar.kit ?? {};

  switch (itemKey) {
    case "email":
      return account.email ? (
        <Value text={account.email} message="E-mail copiado" />
      ) : (
        <Hint>Crie o e-mail e anote na conta (botão Editar, acima).</Hint>
      );
    case "perfil": {
      const profile = db.profiles.find((p) => p.id === account.profile_id);
      return <Hint>{profile ? profileLabel(profile) : "Crie um perfil novo no anti-detect e escolha na conta (botão Editar)."}</Hint>;
    }
    case "proxy":
      return account.proxy ? (
        <Value text={account.proxy} message="Proxy copiado" mono />
      ) : (
        <Hint>Anote o proxy novo na conta (botão Editar).</Hint>
      );
    case "celular": {
      const phone = db.phones.find((p) => p.id === account.phone_id);
      return <Hint>{phone ? phoneLabel(phone) : "Escolha na conta o celular em que ela vai rodar (botão Editar)."}</Hint>;
    }
    case "bio":
      return kit.display_name || kit.bio ? (
        <>
          {kit.display_name ? <Value label="Nome" text={kit.display_name} message="Nome copiado" /> : null}
          {kit.bio ? <Value label="Bio" text={kit.bio} message="Bio copiada" /> : null}
        </>
      ) : (
        <Hint>
          O kit ainda não tem nome nem bio. <TabLink avatarId={avatar.id} tab="kit">Preencher o kit</TabLink>
        </Hint>
      );
    case "link":
      return kit.bio_link ? (
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1 py-1 text-sm">
            <ExternalLinkText url={kit.bio_link} />
          </div>
          <CopyButton text={kit.bio_link} message="Link copiado" />
        </div>
      ) : (
        <Hint>
          O kit ainda não tem o link da bio. <TabLink avatarId={avatar.id} tab="kit">Preencher o kit</TabLink>
        </Hint>
      );
    case "destaques": {
      const highlights = kit.highlights ?? [];
      return highlights.length > 0 ? (
        <>
          {highlights.map((highlight) => (
            <Value
              key={highlight.id}
              label={highlight.title}
              text={highlight.text || highlight.title}
              message="Texto copiado"
            />
          ))}
        </>
      ) : (
        <Hint>
          O kit ainda não tem destaques. <TabLink avatarId={avatar.id} tab="kit">Preencher o kit</TabLink>
        </Hint>
      );
    }
    case "provas": {
      const proofs = kit.proof_links ?? [];
      return proofs.length > 0 ? (
        <>
          {proofs.map((proof) => (
            <div key={proof.id} className="flex items-center gap-2">
              <div className="min-w-0 flex-1 py-1 text-sm">
                <span className="text-muted">{proof.label}: </span>
                <ExternalLinkText url={proof.url} />
              </div>
              <CopyButton text={proof.url} message="Link copiado" />
            </div>
          ))}
        </>
      ) : (
        <Hint>
          O kit ainda não tem provas sociais. <TabLink avatarId={avatar.id} tab="kit">Preencher o kit</TabLink>
        </Hint>
      );
    }
    case "aquecimento":
      return (
        <Hint>
          {warmupOf(db, account.id) ? "Calendário criado. " : "A conta ainda não tem calendário. "}
          <TabLink avatarId={avatar.id} tab="aquecimento">
            {warmupOf(db, account.id) ? "Ver o aquecimento" : "Iniciar o aquecimento"}
          </TabLink>
        </Hint>
      );
    default:
      return null;
  }
}
