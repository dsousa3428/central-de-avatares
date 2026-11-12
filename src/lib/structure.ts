// Estrutura de vendas do avatar: o que precisa ficar pronto enquanto a conta
// aquece — o site, o entregável, o checkout e a automação. Regras puras.
//
// As marcações ficam dentro do JSON `avatars.kit`, na chave `structure`
// ({ site: true, checkout: true }). Não é o lugar mais óbvio, mas assim o painel
// não depende de uma coluna nova no banco (o dono teria de rodar o script SQL
// antes de poder marcar o primeiro passo).

import type { ReplacementKit } from "./types";

export type StructureKey = "site" | "entregavel" | "checkout" | "automacao";

/** Os passos da estrutura, na ordem em que costumam ser feitos. */
export const STRUCTURE: ReadonlyArray<{ key: StructureKey; label: string; help: string }> = [
  { key: "site", label: "Site de vendas", help: "A página que apresenta o produto." },
  { key: "entregavel", label: "Entregável", help: "O produto pronto e a página (ou pasta) de entrega." },
  { key: "checkout", label: "Checkout", help: "O link de pagamento funcionando." },
  { key: "automacao", label: "Automação", help: "As mensagens e a entrega automáticas depois da compra." },
];

export interface StructureStep {
  key: StructureKey;
  label: string;
  help: string;
  done: boolean;
}

/** Os quatro passos com a marcação de cada um (o que não foi marcado conta como por fazer). */
export function readStructure(kit: ReplacementKit | null | undefined): StructureStep[] {
  const saved = kit?.structure;
  const marks = saved && typeof saved === "object" && !Array.isArray(saved) ? saved : {};
  return STRUCTURE.map((step) => ({ ...step, done: marks[step.key] === true }));
}

/**
 * O kit com um passo marcado (ou desmarcado). Devolve o mesmo kit, sem copiar,
 * se o passo já estava assim — quem chama usa isso para não gravar à toa.
 */
export function setStructureDone(kit: ReplacementKit | null | undefined, key: StructureKey, done: boolean): ReplacementKit {
  const current = kit ?? {};
  if (readStructure(current).find((step) => step.key === key)?.done === done) return current;
  const marks: Partial<Record<StructureKey, boolean>> = {};
  for (const step of readStructure(current)) {
    if (step.key === key ? done : step.done) marks[step.key] = true;
  }
  return { ...current, structure: marks };
}

export interface StructureProgress {
  done: number;
  total: number;
  /** Os passos que ainda faltam, na ordem. */
  pending: StructureStep[];
  complete: boolean;
}

export function structureProgress(kit: ReplacementKit | null | undefined): StructureProgress {
  const steps = readStructure(kit);
  const pending = steps.filter((step) => !step.done);
  return { done: steps.length - pending.length, total: steps.length, pending, complete: pending.length === 0 };
}

/** "Checkout e Automação" */
export function pendingLabels(progress: StructureProgress): string {
  const labels = progress.pending.map((step) => step.label);
  if (labels.length <= 1) return labels.join("");
  return `${labels.slice(0, -1).join(", ")} e ${labels[labels.length - 1]}`;
}
