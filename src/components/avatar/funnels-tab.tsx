"use client";

import { useRef, useState } from "react";
import { Check, ChevronDown, CopyPlus, Filter, Pencil, Plus, Trash2 } from "lucide-react";
import { AppError } from "@/lib/errors";
import { cn, normalizeUrl, plural, uid } from "@/lib/format";
import {
  addFunnel,
  cloneFunnel,
  FUNNEL_KINDS,
  funnelProgress,
  kindInfo,
  missingKinds,
  readFunnels,
  removeFunnel,
  removeStep,
  saveFunnel,
  saveStep,
  setStepDone,
  stepLabel,
  type FunnelDetails,
} from "@/lib/funnels";
import { updateRow, useStore } from "@/lib/store";
import type { Avatar, FunnelModel, FunnelStep, FunnelStepKind } from "@/lib/types";
import { ExternalLinkText } from "@/components/common/detail-row";
import { invalid } from "@/components/common/validation";
import { Button } from "@/components/ui/button";
import { Card, EmptyState, Section } from "@/components/ui/card";
import { useConfirm } from "@/components/ui/confirm";
import { CopyButton } from "@/components/ui/copy-button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { FormModal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";

const GONE = "Este modelo foi apagado em outro aparelho. Feche esta janela e confira a lista.";

function isLink(value: string): boolean {
  return /^https?:\/\//i.test(value) || /^[\w-]+(\.[\w-]+)+\//.test(value);
}

/**
 * Funis para modelar: avatares de outras pessoas que servem de modelo para este,
 * com o funil de cada um registrado etapa por etapa (página de vendas, captura de
 * e-mail, ebook gratuito, venda, e-mails recebidos…).
 */
export function FunnelsTab({ avatar }: { avatar: Avatar }) {
  const toast = useToast();
  const funnels = readFunnels(avatar.kit);
  const [editingModel, setEditingModel] = useState<FunnelModel | "new" | null>(null);
  const [editingStep, setEditingStep] = useState<{ model: FunnelModel; step: FunnelStep | null; kind: FunnelStepKind } | null>(null);
  // Com um modelo só, o funil dele fica aberto; com vários, cada um abre no toque (a escolha fica só nesta tela).
  const [toggled, setToggled] = useState<Record<string, boolean>>({});
  // etapas com a marca "modelado" sendo gravada: um segundo toque é ignorado até a primeira terminar
  const saving = useRef(new Set<string>());

  const isOpen = (id: string) => toggled[id] ?? funnels.length === 1;

  async function saveModel(details: FunnelDetails, isNew: boolean) {
    await updateRow("avatars", avatar.id, (row) => ({ kit: saveFunnel(row.kit, details) }));
    // o modelo novo abre para receber as etapas; os outros se fecham, para ele não ficar perdido no fim de uma tela comprida
    if (isNew) setToggled({ ...Object.fromEntries(funnels.map((model) => [model.id, false])), [details.id]: true });
    toast.success("Modelo salvo");
  }

  async function deleteModel(id: string) {
    await updateRow("avatars", avatar.id, (row) => {
      const next = removeFunnel(row.kit, id);
      return next ? { kit: next } : null;
    });
    toast.success("Modelo apagado");
  }

  async function saveStepOf(funnelId: string, step: FunnelStep, position: number | undefined) {
    let gone = false;
    await updateRow("avatars", avatar.id, (row) => {
      const next = saveStep(row.kit, funnelId, step, position);
      gone = next === null;
      return next ? { kit: next } : null;
    });
    if (gone) throw new AppError("conflict", GONE);
    toast.success("Etapa salva");
  }

  async function deleteStep(funnelId: string, stepId: string) {
    await updateRow("avatars", avatar.id, (row) => {
      const next = removeStep(row.kit, funnelId, stepId);
      return next ? { kit: next } : null;
    });
    toast.success("Etapa apagada");
  }

  async function toggleDone(funnelId: string, step: FunnelStep) {
    if (saving.current.has(step.id)) return;
    saving.current.add(step.id);
    try {
      await updateRow(
        "avatars",
        avatar.id,
        (row) => {
          const next = setStepDone(row.kit, funnelId, step.id, !step.done);
          return next ? { kit: next } : null;
        },
        { optimistic: true },
      );
    } catch (err) {
      toast.error(err);
    } finally {
      saving.current.delete(step.id);
    }
  }

  return (
    <div className="space-y-4">
      <Section
        title="Funis para modelar"
        subtitle="Avatares que servem de modelo, com o funil de cada um."
        actions={
          <Button size="sm" variant="soft" onClick={() => setEditingModel("new")}>
            <Plus className="size-4" /> Adicionar
          </Button>
        }
      >
        {funnels.length === 0 ? (
          <EmptyState icon={<Filter />} title="Nenhum funil para modelar" className="py-5">
            Cadastre um avatar que serve de modelo e registre o funil dele, etapa por etapa: a página de vendas, a
            captura de e-mail, o ebook gratuito, a venda e os e-mails que chegam.
          </EmptyState>
        ) : (
          <p className="text-sm leading-relaxed text-muted">
            Registre cada etapa do funil do modelo e marque o que você já modelou para este avatar.
          </p>
        )}
      </Section>

      {funnels.map((model) => (
        <ModelCard
          key={model.id}
          model={model}
          open={isOpen(model.id)}
          onToggle={() => setToggled((current) => ({ ...current, [model.id]: !isOpen(model.id) }))}
          onEdit={() => setEditingModel(model)}
          onAddStep={(kind) => setEditingStep({ model, step: null, kind })}
          onEditStep={(step) => setEditingStep({ model, step, kind: step.kind })}
          onToggleDone={(step) => void toggleDone(model.id, step)}
        />
      ))}

      {editingModel ? (
        <ModelForm
          avatar={avatar}
          model={editingModel === "new" ? null : editingModel}
          onSave={saveModel}
          onDelete={deleteModel}
          onClose={() => setEditingModel(null)}
        />
      ) : null}
      {editingStep ? (
        <StepForm
          // (a lista de posições vem do modelo como está agora, não de quando a janela abriu)
          model={funnels.find((item) => item.id === editingStep.model.id) ?? editingStep.model}
          step={editingStep.step}
          kind={editingStep.kind}
          onSave={(step, position) => saveStepOf(editingStep.model.id, step, position)}
          onDelete={(stepId) => deleteStep(editingStep.model.id, stepId)}
          onClose={() => setEditingStep(null)}
        />
      ) : null}
    </div>
  );
}

function ModelCard({
  model,
  open,
  onToggle,
  onEdit,
  onAddStep,
  onEditStep,
  onToggleDone,
}: {
  model: FunnelModel;
  open: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onAddStep: (kind: FunnelStepKind) => void;
  onEditStep: (step: FunnelStep) => void;
  onToggleDone: (step: FunnelStep) => void;
}) {
  const progress = funnelProgress(model);
  const missing = missingKinds(model);
  const name = model.name || "Modelo sem nome";
  return (
    <Card className="px-4 py-4 md:px-5">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="text-[15px] font-semibold leading-snug">{name}</h3>
          {model.niche ? <p className="mt-0.5 text-sm text-muted">{model.niche}</p> : null}
          <p className="mt-0.5 text-sm text-muted">
            {progress.steps === 0
              ? "Nenhuma etapa registrada"
              : `${plural(progress.steps, "etapa", "etapas")} · ${plural(progress.done, "modelada", "modeladas")}`}
          </p>
        </div>
        <Button size="sm" variant="ghost" iconOnly aria-label={`Editar o modelo ${name}`} onClick={onEdit}>
          <Pencil className="size-4 text-muted" />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          iconOnly
          aria-expanded={open}
          aria-label={open ? `Esconder o funil de ${name}` : `Mostrar o funil de ${name}`}
          onClick={onToggle}
        >
          <ChevronDown className={cn("size-5 transition-transform", open && "rotate-180")} />
        </Button>
      </div>

      {open ? (
        <div className="mt-3 space-y-3">
          {model.handle ? (
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1 text-[15px]">
                {isLink(model.handle) ? (
                  <ExternalLinkText url={model.handle} />
                ) : (
                  <p className="break-all font-medium">{model.handle}</p>
                )}
              </div>
              <CopyButton text={model.handle} message="Perfil copiado" />
            </div>
          ) : null}
          {model.notes ? <LongText text={model.notes} /> : null}

          {model.steps.length > 0 ? (
            <ol className="divide-y divide-line border-y border-line">
              {model.steps.map((step, index) => (
                <StepRow
                  key={step.id}
                  step={step}
                  number={index + 1}
                  onEdit={() => onEditStep(step)}
                  onToggleDone={() => onToggleDone(step)}
                />
              ))}
            </ol>
          ) : null}

          <div className="space-y-2">
            <Button size="sm" variant="soft" onClick={() => onAddStep(missing[0]?.kind ?? "email")}>
              <Plus className="size-4" /> Adicionar etapa
            </Button>
            {missing.length > 0 ? (
              <div>
                <p className="text-xs text-muted">Ainda não registrado neste funil (toque para registrar):</p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {missing.map((info) => (
                    <Button key={info.kind} size="sm" onClick={() => onAddStep(info.kind)}>
                      {info.label}
                    </Button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </Card>
  );
}

function StepRow({
  step,
  number,
  onEdit,
  onToggleDone,
}: {
  step: FunnelStep;
  number: number;
  onEdit: () => void;
  onToggleDone: () => void;
}) {
  const info = kindInfo(step.kind);
  const label = stepLabel(step);
  // a "outra etapa" usa o próprio nome como rótulo; nas demais, o título vem embaixo do tipo
  const heading = step.kind === "outro" ? step.title.trim() || info.label : info.label;
  const title = step.kind === "outro" ? "" : step.title.trim();
  return (
    <li className="flex items-start gap-3 py-3">
      <button
        type="button"
        onClick={onToggleDone}
        aria-pressed={step.done}
        aria-label={step.done ? `Marcar como a modelar: ${label}` : `Marcar como modelado: ${label}`}
        title={step.done ? "Modelado — toque para desfazer" : "Toque para marcar como modelado"}
        className={cn(
          "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
          step.done ? "border-emerald-500 bg-emerald-500 text-white" : "border-line-strong text-transparent hover:border-emerald-500",
        )}
      >
        <Check className="size-4" strokeWidth={3} />
      </button>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">
          {number} · {heading}
          {step.detail ? <span className="font-medium normal-case tracking-normal"> · {step.detail}</span> : null}
        </p>
        {title ? (
          <p className={cn("mt-0.5 text-[15px] font-medium leading-snug", step.done && "text-muted line-through")}>{title}</p>
        ) : null}
        {step.url ? <ExternalLinkText url={step.url} className="mt-0.5 text-sm" /> : null}
        {step.notes ? <LongText text={step.notes} copyLabel="Copiar texto" className="mt-1" /> : null}
      </div>
      <Button size="sm" variant="ghost" iconOnly aria-label={`Editar a etapa ${number}: ${label}`} onClick={onEdit}>
        <Pencil className="size-4 text-muted" />
      </Button>
    </li>
  );
}

/** Um texto que pode ser comprido (um e-mail inteiro colado): mostra o começo e abre no toque. */
function LongText({ text, copyLabel, className }: { text: string; copyLabel?: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const long = text.length > 260 || text.split("\n").length > 5;
  return (
    <div className={className}>
      <p className={cn("whitespace-pre-wrap text-sm leading-relaxed text-muted", long && !open && "line-clamp-5")}>{text}</p>
      {long || copyLabel ? (
        <div className="mt-1 flex flex-wrap items-center gap-1">
          {long ? (
            <Button size="sm" variant="ghost" aria-expanded={open} onClick={() => setOpen(!open)} className="-ml-2 text-primary">
              {open ? "Ver menos" : "Ver tudo"}
            </Button>
          ) : null}
          {copyLabel ? (
            <CopyButton text={text} message="Texto copiado" label={copyLabel} className={cn("text-muted", !long && "-ml-2")} />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function ModelForm({
  avatar,
  model,
  onSave,
  onDelete,
  onClose,
}: {
  avatar: Avatar;
  model: FunnelModel | null;
  onSave: (details: FunnelDetails, isNew: boolean) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onClose: () => void;
}) {
  const db = useStore();
  const toast = useToast();
  const confirm = useConfirm();
  const [values, setValues] = useState(() => ({
    name: model?.name ?? "",
    handle: model?.handle ?? "",
    niche: model?.niche ?? "",
    notes: model?.notes ?? "",
  }));
  const [copying, setCopying] = useState(false);
  const others = db.avatars.filter((item) => item.id !== avatar.id);
  const set = (key: keyof typeof values, value: string) => setValues((current) => ({ ...current, [key]: value }));

  async function submit() {
    const name = values.name.trim();
    if (!name) invalid("Diga o nome do avatar modelo.");
    await onSave(
      { id: model?.id ?? uid(), name, handle: values.handle.trim(), niche: values.niche.trim(), notes: values.notes.trim() },
      model === null,
    );
  }

  async function remove() {
    if (!model) return;
    const ok = await confirm({
      title: "Apagar este modelo?",
      message:
        model.steps.length > 0
          ? `As ${plural(model.steps.length, "etapa", "etapas")} do funil dele são apagadas junto. Esta ação não pode ser desfeita.`
          : "Esta ação não pode ser desfeita.",
      confirmLabel: "Apagar",
      tone: "danger",
    });
    if (!ok) return;
    try {
      await onDelete(model.id);
      onClose();
    } catch (err) {
      toast.error(err);
    }
  }

  return (
    <>
      <FormModal
        title={model ? "Editar modelo" : "Novo modelo"}
        description={model ? undefined : "O avatar de outra pessoa cujo funil você quer estudar. As etapas você registra em seguida."}
        onClose={onClose}
        onSubmit={submit}
        extraActions={
          model ? (
            <Button variant="danger-ghost" onClick={() => void remove()} className="md:mr-auto">
              <Trash2 className="size-4" /> Apagar
            </Button>
          ) : null
        }
      >
        <Field label="Nome do avatar modelo">
          <Input value={values.name} onChange={(e) => set("name", e.target.value)} autoComplete="off" placeholder="Ex.: Padre Antonio" />
        </Field>
        <Field label="@ ou link do perfil" optional>
          <Input
            value={values.handle}
            onChange={(e) => set("handle", e.target.value)}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="@avatar.modelo"
          />
        </Field>
        <Field label="Nicho ou produto" optional>
          <Input value={values.niche} onChange={(e) => set("niche", e.target.value)} autoComplete="off" placeholder="Ex.: receitas de convento · ebook de € 27" />
        </Field>
        <Field label="Observações" optional>
          <Textarea
            value={values.notes}
            onChange={(e) => set("notes", e.target.value)}
            rows={3}
            autoComplete="off"
            placeholder="O que chama atenção neste funil"
          />
        </Field>
        {model && others.length > 0 ? (
          <Button size="sm" variant="ghost" onClick={() => setCopying(true)} className="-ml-2 text-muted">
            <CopyPlus className="size-4" /> Copiar para outro avatar
          </Button>
        ) : null}
      </FormModal>
      {/* (janela dentro de janela: fica fora do formulário da primeira) */}
      {copying && model ? <CopyForm model={model} others={others} onClose={() => setCopying(false)} /> : null}
    </>
  );
}

/** Leva uma cópia do modelo (com o funil inteiro) para outro avatar seu. */
function CopyForm({ model, others, onClose }: { model: FunnelModel; others: Avatar[]; onClose: () => void }) {
  const db = useStore();
  const toast = useToast();
  const [target, setTarget] = useState(others[0]?.id ?? "");
  // (a cópia nasce uma vez só: se a gravação precisar repetir, os identificadores continuam os mesmos)
  const [copy] = useState(() => cloneFunnel(model, uid));

  async function submit() {
    const avatar = db.avatars.find((item) => item.id === target);
    if (!avatar) invalid("Escolha o avatar que vai receber a cópia.");
    await updateRow("avatars", avatar.id, (row) => ({ kit: addFunnel(row.kit, copy) }));
    toast.success(`Funil copiado para ${avatar.name}`);
  }

  return (
    <FormModal
      title="Copiar para outro avatar"
      description={`Uma cópia de “${model.name}” com o funil inteiro, sem as marcas de “modelado”. Este aqui continua como está.`}
      onClose={onClose}
      onSubmit={submit}
      submitLabel="Copiar"
      size="sm"
    >
      <Field label="Avatar que recebe a cópia">
        <Select value={target} onChange={(e) => setTarget(e.target.value)}>
          {others.map((item) => {
            const flag = db.countries.find((country) => country.id === item.country_id)?.flag;
            return (
              <option key={item.id} value={item.id}>
                {flag ? `${flag} ` : ""}
                {item.name}
              </option>
            );
          })}
        </Select>
      </Field>
    </FormModal>
  );
}

function StepForm({
  model,
  step,
  kind: initialKind,
  onSave,
  onDelete,
  onClose,
}: {
  model: FunnelModel;
  step: FunnelStep | null;
  kind: FunnelStepKind;
  onSave: (step: FunnelStep, position: number | undefined) => Promise<void>;
  onDelete: (stepId: string) => Promise<void>;
  onClose: () => void;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const [kind, setKind] = useState<FunnelStepKind>(initialKind);
  const [values, setValues] = useState(() => ({
    title: step?.title ?? "",
    detail: step?.detail ?? "",
    url: step?.url ?? "",
    notes: step?.notes ?? "",
  }));
  const [id] = useState(() => step?.id ?? uid());
  const others = model.steps.filter((item) => item.id !== id);
  const current = model.steps.findIndex((item) => item.id === id);
  // posição escolhida (1 = primeira); "" = onde está (ou, na etapa nova, no fim)
  const [position, setPosition] = useState("");
  const info = kindInfo(kind);
  const set = (key: keyof typeof values, value: string) => setValues((now) => ({ ...now, [key]: value }));

  async function submit() {
    const title = values.title.trim();
    const url = normalizeUrl(values.url) ?? "";
    const notes = values.notes.trim();
    if (kind === "outro" && !title) invalid("Dê um nome para esta etapa.");
    if (!title && !url && !notes) invalid("Preencha ao menos o título, o link ou as anotações.");
    await onSave(
      { id, kind, title, url, notes, detail: info.detailLabel ? values.detail.trim() : "", done: step?.done ?? false },
      position === "" ? undefined : Number(position),
    );
  }

  async function remove() {
    if (!step) return;
    const ok = await confirm({
      title: "Apagar esta etapa?",
      message: "Esta ação não pode ser desfeita.",
      confirmLabel: "Apagar",
      tone: "danger",
    });
    if (!ok) return;
    try {
      await onDelete(step.id);
      onClose();
    } catch (err) {
      toast.error(err);
    }
  }

  return (
    <FormModal
      title={step ? "Editar etapa" : "Nova etapa"}
      description={`Funil de ${model.name || "modelo sem nome"}.`}
      onClose={onClose}
      onSubmit={submit}
      extraActions={
        step ? (
          <Button variant="danger-ghost" onClick={() => void remove()} className="md:mr-auto">
            <Trash2 className="size-4" /> Apagar
          </Button>
        ) : null
      }
    >
      <Field label="Tipo de etapa">
        <Select value={kind} onChange={(e) => setKind(e.target.value as FunnelStepKind)}>
          {FUNNEL_KINDS.map((item) => (
            <option key={item.kind} value={item.kind}>
              {item.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label={info.titleLabel} optional={kind !== "outro"}>
        <Input value={values.title} onChange={(e) => set("title", e.target.value)} autoComplete="off" placeholder={info.titlePlaceholder} />
      </Field>
      {info.detailLabel ? (
        <Field label={info.detailLabel} optional>
          <Input value={values.detail} onChange={(e) => set("detail", e.target.value)} autoComplete="off" placeholder={info.detailPlaceholder} />
        </Field>
      ) : null}
      <Field label="Link" optional hint="A página em si, ou um print ou arquivo que você guardou (Drive, por exemplo).">
        <Input
          value={values.url}
          onChange={(e) => set("url", e.target.value)}
          placeholder="https://…"
          inputMode="url"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
        />
      </Field>
      <Field label="Anotações" optional hint="O que vale modelar: estrutura, promessa, gatilhos. Pode colar o texto inteiro.">
        <Textarea value={values.notes} onChange={(e) => set("notes", e.target.value)} rows={5} autoComplete="off" />
      </Field>
      {others.length > 0 ? (
        <Field label="Posição no funil">
          <Select value={position} onChange={(e) => setPosition(e.target.value)}>
            <option value="">{step ? `Onde está (${current + 1}ª etapa)` : "No fim"}</option>
            {Array.from({ length: others.length + 1 }, (_, index) => index + 1)
              .filter((place) => (step ? place !== current + 1 : place <= others.length))
              .map((place) => (
                <option key={place} value={place}>
                  {place}ª etapa
                </option>
              ))}
          </Select>
        </Field>
      ) : null}
    </FormModal>
  );
}
