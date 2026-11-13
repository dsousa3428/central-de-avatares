// Funis para modelar: os avatares modelo e as etapas do funil de cada um, guardados em avatars.kit.funnels.
import assert from "node:assert/strict";
import { test } from "node:test";
import { buildSheets, sheetsReadme } from "../../src/lib/backup-sheets.ts";
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
} from "../../src/lib/funnels.ts";

const details = (id, name = "Padre Antonio") => ({ id, name, handle: "@padre.antonio", niche: "Receitas", notes: "Funil direto." });
const step = (id, kind = "pagina_vendas", extra = {}) => ({ id, kind, title: "", url: "", notes: "", detail: "", done: false, ...extra });

test("funis: os tipos de etapa, na ordem em que um funil costuma acontecer", () => {
  assert.deepEqual(FUNNEL_KINDS.map((info) => info.kind), ["pagina_vendas", "captura", "isca", "venda", "email", "outro"]);
  assert.deepEqual(FUNNEL_KINDS.map((info) => info.label), ["Página de vendas", "Captura de e-mail", "Ebook gratuito", "Venda", "E-mail recebido", "Outra etapa"]);
  // só a venda (preço) e o e-mail (quando chegou) têm o campo extra
  assert.deepEqual(FUNNEL_KINDS.filter((info) => info.detailLabel).map((info) => [info.kind, info.detailLabel]), [["venda", "Preço"], ["email", "Quando chegou"]]);
  assert.equal(kindInfo("tipo que não existe").kind, "outro");
});

test("funis: criar e corrigir um modelo sem mexer no resto do kit nem nas etapas dele", () => {
  const kit = { bio: "minha bio", structure: { site: true } };
  const created = saveFunnel(kit, details("m1"));
  assert.deepEqual(created, { bio: "minha bio", structure: { site: true }, funnels: [{ ...details("m1"), steps: [] }] });
  assert.deepEqual(kit, { bio: "minha bio", structure: { site: true } }); // o kit original não é alterado
  const withStep = saveStep(created, "m1", step("s1"));
  const renamed = saveFunnel(withStep, { ...details("m1", "Padre Antonio (Itália)"), extra: "campo estranho" });
  assert.equal(readFunnels(renamed)[0].name, "Padre Antonio (Itália)");
  assert.deepEqual(readFunnels(renamed)[0].steps.map((s) => s.id), ["s1"]); // as etapas continuam
  assert.equal("extra" in renamed.funnels[0], false); // só os campos do modelo são gravados
  // kit vazio ou ausente também serve
  assert.deepEqual(readFunnels(saveFunnel(null, details("m1"))).map((m) => m.id), ["m1"]);
  // um segundo modelo entra no fim
  assert.deepEqual(readFunnels(saveFunnel(renamed, details("m2", "Suor Maria"))).map((m) => m.name), ["Padre Antonio (Itália)", "Suor Maria"]);
});

test("funis: dado estranho guardado no kit não quebra a leitura", () => {
  for (const bad of [undefined, null, {}, { funnels: null }, { funnels: "texto" }, { funnels: { a: 1 } }]) assert.deepEqual(readFunnels(bad), []);
  const kit = {
    funnels: [
      null,
      "texto",
      { name: "sem id" },
      { id: "m1", name: 7, steps: "não é lista" },
      { id: "m1", name: "repetido" },
      { id: "m2", name: "Bom", handle: "@bom", steps: [null, { title: "sem id" }, { id: "s1", kind: "tipo novo", title: "Etapa", done: "sim" }, { id: "s1", kind: "venda" }, { id: "s2", kind: "email", detail: "dia 2", done: true }] },
    ],
  };
  assert.deepEqual(readFunnels(kit), [
    { id: "m1", name: "", handle: "", niche: "", notes: "", steps: [] },
    {
      id: "m2", name: "Bom", handle: "@bom", niche: "", notes: "",
      steps: [
        { id: "s1", kind: "outro", title: "Etapa", url: "", notes: "", detail: "", done: false }, // tipo desconhecido vira "outra etapa"
        { id: "s2", kind: "email", title: "", url: "", notes: "", detail: "dia 2", done: true },
      ],
    },
  ]);
});

test("funis: etapa nova vai para o fim; a posição escolhida vale ao criar e ao corrigir", () => {
  let kit = saveFunnel({}, details("m1"));
  const order = () => readFunnels(kit)[0].steps.map((s) => s.id).join(",");
  kit = saveStep(kit, "m1", step("a"));
  kit = saveStep(kit, "m1", step("b"));
  kit = saveStep(kit, "m1", step("c"));
  assert.equal(order(), "a,b,c");
  kit = saveStep(kit, "m1", step("d"), 1); // nova, já na primeira posição
  assert.equal(order(), "d,a,b,c");
  kit = saveStep(kit, "m1", step("e"), 3);
  assert.equal(order(), "d,a,e,b,c");
  kit = saveStep(kit, "m1", step("b", "venda", { title: "Curso" })); // corrigir sem escolher posição: fica onde está
  assert.equal(order(), "d,a,e,b,c");
  assert.equal(readFunnels(kit)[0].steps[3].title, "Curso");
  kit = saveStep(kit, "m1", step("c"), 1); // a última vai para a frente
  assert.equal(order(), "c,d,a,e,b");
  kit = saveStep(kit, "m1", step("c"), 5); // e volta para o fim
  assert.equal(order(), "d,a,e,b,c");
  kit = saveStep(kit, "m1", step("d"), 2); // "2ª etapa": depois de tirar a própria etapa da fila, ela entra na segunda posição
  assert.equal(order(), "a,d,e,b,c");
  // posição fora da lista não quebra
  assert.equal(readFunnels(saveStep(kit, "m1", step("z"), 99))[0].steps.at(-1).id, "z");
  assert.equal(readFunnels(saveStep(kit, "m1", step("z"), -3))[0].steps[0].id, "z");
  assert.equal(readFunnels(saveStep(kit, "m1", step("z"), Number.NaN))[0].steps.at(-1).id, "z");
  // modelo que não existe mais: nada a gravar
  assert.equal(saveStep(kit, "outro", step("z")), null);
});

test("funis: apagar etapa e modelo; marcar como modelado", () => {
  let kit = saveFunnel({ bio: "x" }, details("m1"));
  kit = saveFunnel(kit, details("m2", "Suor Maria"));
  kit = saveStep(kit, "m1", step("a"));
  kit = saveStep(kit, "m1", step("b"));
  kit = saveStep(kit, "m2", step("c"));

  const marked = setStepDone(kit, "m1", "b", true);
  assert.deepEqual(readFunnels(marked)[0].steps.map((s) => s.done), [false, true]);
  assert.deepEqual(funnelProgress(readFunnels(marked)[0]), { steps: 2, done: 1 });
  assert.equal(setStepDone(marked, "m1", "b", true), null); // já estava assim: nada a gravar
  assert.equal(setStepDone(kit, "m1", "não existe", true), null);
  assert.equal(setStepDone(kit, "não existe", "a", true), null);
  assert.deepEqual(readFunnels(setStepDone(marked, "m1", "b", false))[0].steps.map((s) => s.done), [false, false]);

  const without = removeStep(marked, "m1", "a");
  assert.deepEqual(readFunnels(without).map((m) => m.steps.map((s) => s.id)), [["b"], ["c"]]);
  assert.equal(removeStep(kit, "m1", "não existe"), null);
  assert.equal(removeStep(kit, "não existe", "a"), null);

  const gone = removeFunnel(kit, "m1");
  assert.deepEqual(gone, { bio: "x", funnels: [{ ...details("m2", "Suor Maria"), steps: [step("c")] }] });
  assert.equal(removeFunnel(gone, "m1"), null); // já tinha sido apagado (em outro aparelho, por exemplo)
});

test("funis: o que ainda falta registrar e como cada etapa é chamada", () => {
  const model = { steps: [step("a", "pagina_vendas"), step("b", "email"), step("c", "email"), step("d", "outro", { title: "Upsell" })] };
  assert.deepEqual(missingKinds(model).map((info) => info.label), ["Captura de e-mail", "Ebook gratuito", "Venda"]);
  assert.deepEqual(missingKinds({ steps: [] }).map((info) => info.kind), ["pagina_vendas", "captura", "isca", "venda", "email"]); // "outra etapa" nunca "falta"
  assert.equal(stepLabel(step("a", "pagina_vendas")), "Página de vendas");
  assert.equal(stepLabel(step("a", "email", { title: "  Seu guia chegou " })), "E-mail recebido: Seu guia chegou");
  assert.equal(stepLabel(step("a", "outro", { title: "Página de obrigado" })), "Página de obrigado");
  assert.equal(stepLabel(step("a", "outro")), "Outra etapa");
});

test("funis: copiar um modelo para outro avatar leva o funil inteiro, com identificadores novos e nada modelado", () => {
  const model = { ...details("m1"), steps: [step("a", "venda", { title: "Curso", detail: "€ 27", done: true }), step("b", "email")] };
  let n = 0;
  const copy = cloneFunnel(model, () => `novo-${++n}`);
  assert.deepEqual(copy, {
    ...details("novo-1"),
    steps: [step("novo-2", "venda", { title: "Curso", detail: "€ 27", done: false }), step("novo-3", "email")],
  });
  assert.equal(model.steps[0].done, true); // o original continua como estava
  // entra no kit do outro avatar sem mexer no que ele já tinha; gravar de novo a mesma cópia não duplica
  const target = saveFunnel({ bio: "outro avatar" }, details("m9", "Já existia"));
  const once = addFunnel(target, copy);
  assert.deepEqual(readFunnels(once).map((m) => m.id), ["m9", "novo-1"]);
  assert.deepEqual(readFunnels(addFunnel(once, copy)).map((m) => m.id), ["m9", "novo-1"]);
  assert.equal(once.bio, "outro avatar");
});

test("funis: a planilha do backup tem uma linha por etapa", () => {
  const db = {
    countries: [{ id: "it", name: "Itália", flag: "🇮🇹", currency: "EUR" }],
    avatars: [
      {
        id: "a1", name: "Fra' Salvio", country_id: "it", extra_links: [], model_videos: [], reference_profiles: [],
        kit: {
          funnels: [
            {
              ...details("m1"),
              steps: [
                step("s1", "pagina_vendas", { title: "A dieta dos monges", url: "https://exemplo.com/dieta", notes: "Promessa no topo", done: true }),
                step("s2", "email", { title: "Seu guia chegou", detail: "na hora" }),
              ],
            },
            { ...details("m2", "Sem etapas"), handle: "", niche: "", notes: "" },
          ],
        },
      },
      { id: "a2", name: "Sem funis", country_id: "it", extra_links: [], model_videos: [], reference_profiles: [], kit: {} },
    ],
    accounts: [], phones: [], profiles: [], warmups: [], sales: [], activity: [], settings: null,
  };
  const sheet = buildSheets(db).find((item) => item.name === "funis");
  assert.deepEqual(sheet.table, [
    ["Avatar", "País", "Modelo", "Perfil do modelo", "Nicho ou produto", "Observações", "Etapa", "Tipo", "Título", "Preço / quando chegou", "Link", "Anotações", "Modelado"],
    ["Fra' Salvio", "Itália", "Padre Antonio", "@padre.antonio", "Receitas", "Funil direto.", "1", "Página de vendas", "A dieta dos monges", "", "https://exemplo.com/dieta", "Promessa no topo", "sim"],
    ["Fra' Salvio", "Itália", "Padre Antonio", "@padre.antonio", "Receitas", "Funil direto.", "2", "E-mail recebido", "Seu guia chegou", "na hora", "", "", "não"],
    ["Fra' Salvio", "Itália", "Sem etapas", "", "", "", "", "", "", "", "", "", ""],
  ]);
  assert.match(sheetsReadme("hoje"), /funis\.csv\s+funis para modelar/);
});
