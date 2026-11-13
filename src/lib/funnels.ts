// Funis para modelar: avatares de outras pessoas que servem de modelo, com o funil
// de cada um registrado etapa por etapa — a página de vendas, a captura de e-mail,
// o ebook gratuito, a venda, os e-mails que chegam. Regras puras (sem tela e sem banco).
//
// A lista fica dentro do JSON `avatars.kit`, na chave `funnels` — como a estrutura
// (`kit.structure`), para não depender de uma coluna nova no banco. Toda gravação
// regrava o kit inteiro: use sempre a forma de função do `updateRow`.

import type { FunnelModel, FunnelStep, FunnelStepKind, ReplacementKit } from "./types";

export interface FunnelKindInfo {
  kind: FunnelStepKind;
  label: string;
  /** O que o campo "título" quer dizer nesta etapa. */
  titleLabel: string;
  titlePlaceholder: string;
  /** O campo extra da etapa (preço da venda, quando o e-mail chegou). */
  detailLabel?: string;
  detailPlaceholder?: string;
}

/** Os tipos de etapa, na ordem em que um funil costuma acontecer. */
export const FUNNEL_KINDS: readonly FunnelKindInfo[] = [
  { kind: "pagina_vendas", label: "Página de vendas", titleLabel: "Título ou promessa da página", titlePlaceholder: "Ex.: A dieta dos monges em 21 dias" },
  { kind: "captura", label: "Captura de e-mail", titleLabel: "Chamada da captura", titlePlaceholder: "Ex.: Receba o guia grátis no seu e-mail" },
  { kind: "isca", label: "Ebook gratuito", titleLabel: "Nome do material", titlePlaceholder: "Ex.: 7 receitas do convento" },
  {
    kind: "venda",
    label: "Venda",
    titleLabel: "Produto",
    titlePlaceholder: "Ex.: Curso completo + bônus",
    detailLabel: "Preço",
    detailPlaceholder: "Ex.: € 27",
  },
  {
    kind: "email",
    label: "E-mail recebido",
    titleLabel: "Assunto do e-mail",
    titlePlaceholder: "Ex.: Seu guia chegou (e um presente)",
    detailLabel: "Quando chegou",
    detailPlaceholder: "Ex.: na hora · dia 2 · dia 5",
  },
  { kind: "outro", label: "Outra etapa", titleLabel: "Nome da etapa", titlePlaceholder: "Ex.: Página de obrigado, upsell, anúncio…" },
];

const KINDS = new Set<string>(FUNNEL_KINDS.map((info) => info.kind));

export function kindInfo(kind: FunnelStepKind): FunnelKindInfo {
  return FUNNEL_KINDS.find((info) => info.kind === kind) ?? FUNNEL_KINDS[FUNNEL_KINDS.length - 1];
}

const text = (value: unknown): string => (typeof value === "string" ? value : "");

function readStep(raw: unknown): FunnelStep | null {
  if (!raw || typeof raw !== "object") return null;
  const step = raw as Record<string, unknown>;
  if (typeof step.id !== "string" || !step.id) return null;
  return {
    id: step.id,
    kind: typeof step.kind === "string" && KINDS.has(step.kind) ? (step.kind as FunnelStepKind) : "outro",
    title: text(step.title),
    url: text(step.url),
    notes: text(step.notes),
    detail: text(step.detail),
    done: step.done === true,
  };
}

/** Os modelos guardados no kit: só o que está bem formado (dado estranho não quebra a tela). */
export function readFunnels(kit: ReplacementKit | null | undefined): FunnelModel[] {
  const saved: unknown = kit?.funnels;
  if (!Array.isArray(saved)) return [];
  const models: FunnelModel[] = [];
  const seen = new Set<string>();
  for (const raw of saved) {
    if (!raw || typeof raw !== "object") continue;
    const model = raw as Record<string, unknown>;
    if (typeof model.id !== "string" || !model.id || seen.has(model.id)) continue;
    seen.add(model.id);
    const steps: FunnelStep[] = [];
    const stepIds = new Set<string>();
    for (const item of Array.isArray(model.steps) ? model.steps : []) {
      const step = readStep(item);
      if (!step || stepIds.has(step.id)) continue;
      stepIds.add(step.id);
      steps.push(step);
    }
    models.push({ id: model.id, name: text(model.name), handle: text(model.handle), niche: text(model.niche), notes: text(model.notes), steps });
  }
  return models;
}

function withFunnels(kit: ReplacementKit | null | undefined, funnels: FunnelModel[]): ReplacementKit {
  return { ...(kit ?? {}), funnels };
}

export type FunnelDetails = Pick<FunnelModel, "id" | "name" | "handle" | "niche" | "notes">;

/** Cria um modelo, ou corrige os dados de um que já existe (as etapas dele continuam como estão). */
export function saveFunnel(kit: ReplacementKit | null | undefined, details: FunnelDetails): ReplacementKit {
  const funnels = readFunnels(kit);
  const clean: FunnelDetails = { id: details.id, name: details.name, handle: details.handle, niche: details.niche, notes: details.notes };
  const exists = funnels.some((model) => model.id === details.id);
  return withFunnels(
    kit,
    exists ? funnels.map((model) => (model.id === details.id ? { ...model, ...clean } : model)) : [...funnels, { ...clean, steps: [] }],
  );
}

/** Acrescenta um modelo inteiro (ex.: copiado de outro avatar). */
export function addFunnel(kit: ReplacementKit | null | undefined, model: FunnelModel): ReplacementKit {
  return withFunnels(kit, [...readFunnels(kit).filter((item) => item.id !== model.id), model]);
}

/** Devolve null se o modelo não existe mais (quem chama usa isso para não gravar à toa). */
export function removeFunnel(kit: ReplacementKit | null | undefined, funnelId: string): ReplacementKit | null {
  const funnels = readFunnels(kit);
  if (!funnels.some((model) => model.id === funnelId)) return null;
  return withFunnels(
    kit,
    funnels.filter((model) => model.id !== funnelId),
  );
}

/**
 * Grava uma etapa (nova ou já existente) na posição pedida — 1 é a primeira; sem
 * posição, a etapa nova vai para o fim e a existente fica onde está. Devolve null
 * se o modelo não existe mais.
 */
export function saveStep(
  kit: ReplacementKit | null | undefined,
  funnelId: string,
  step: FunnelStep,
  position?: number,
): ReplacementKit | null {
  const funnels = readFunnels(kit);
  const model = funnels.find((item) => item.id === funnelId);
  if (!model) return null;
  const index = model.steps.findIndex((item) => item.id === step.id);
  const others = model.steps.filter((item) => item.id !== step.id);
  const fallback = index >= 0 ? index : others.length;
  const wanted = position === undefined || !Number.isFinite(position) ? fallback : Math.round(position) - 1;
  const at = Math.min(Math.max(wanted, 0), others.length);
  const steps = [...others.slice(0, at), step, ...others.slice(at)];
  return withFunnels(
    kit,
    funnels.map((item) => (item.id === funnelId ? { ...item, steps } : item)),
  );
}

/** Devolve null se o modelo ou a etapa não existem mais. */
export function removeStep(kit: ReplacementKit | null | undefined, funnelId: string, stepId: string): ReplacementKit | null {
  const funnels = readFunnels(kit);
  const model = funnels.find((item) => item.id === funnelId);
  if (!model || !model.steps.some((step) => step.id === stepId)) return null;
  return withFunnels(
    kit,
    funnels.map((item) => (item.id === funnelId ? { ...item, steps: item.steps.filter((step) => step.id !== stepId) } : item)),
  );
}

/** Marca (ou desmarca) uma etapa como já modelada. Devolve null se ela não existe ou já estava assim. */
export function setStepDone(
  kit: ReplacementKit | null | undefined,
  funnelId: string,
  stepId: string,
  done: boolean,
): ReplacementKit | null {
  const funnels = readFunnels(kit);
  const step = funnels.find((item) => item.id === funnelId)?.steps.find((item) => item.id === stepId);
  if (!step || step.done === done) return null;
  return withFunnels(
    kit,
    funnels.map((item) =>
      item.id === funnelId ? { ...item, steps: item.steps.map((s) => (s.id === stepId ? { ...s, done } : s)) } : item,
    ),
  );
}

/** As etapas "de sempre" que o modelo ainda não tem registradas (a "outra etapa" não entra na conta). */
export function missingKinds(model: Pick<FunnelModel, "steps">): FunnelKindInfo[] {
  const present = new Set(model.steps.map((step) => step.kind));
  return FUNNEL_KINDS.filter((info) => info.kind !== "outro" && !present.has(info.kind));
}

/** Uma cópia do modelo com identificadores novos e nada marcado como modelado (para levar a outro avatar). */
export function cloneFunnel(model: FunnelModel, newId: () => string): FunnelModel {
  return { ...model, id: newId(), steps: model.steps.map((step) => ({ ...step, id: newId(), done: false })) };
}

/** "Página de vendas", "E-mail recebido: Seu guia chegou", "Página de obrigado" (a "outra etapa" usa o próprio nome). */
export function stepLabel(step: Pick<FunnelStep, "kind" | "title">): string {
  const title = step.title.trim();
  if (step.kind === "outro") return title || kindInfo("outro").label;
  return title ? `${kindInfo(step.kind).label}: ${title}` : kindInfo(step.kind).label;
}

export interface FunnelProgress {
  steps: number;
  done: number;
}

export function funnelProgress(model: Pick<FunnelModel, "steps">): FunnelProgress {
  return { steps: model.steps.length, done: model.steps.filter((step) => step.done).length };
}
