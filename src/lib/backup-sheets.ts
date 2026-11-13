// As planilhas do backup: uma tabela por assunto, com nomes no lugar dos códigos
// internos, para abrir no Excel ou no Google Planilhas. Regras puras.
//
// Servem para LER fora do painel — a restauração usa o arquivo .json. As senhas
// do cofre nunca entram aqui (a coluna só diz "No cofre").

import { formatDate } from "./dates";
import { kindInfo, readFunnels } from "./funnels";
import { checklistProgress, readChecklist } from "./replacement";
import { cleanRates, inBRL } from "./sales";
import { generationLabel, phoneLabel, profileLabel } from "./selectors";
import type { Db } from "./store";
import { pendingLabels, structureProgress } from "./structure";
import type { AccountStatus } from "./types";

export interface Sheet {
  /** Nome do arquivo, sem a extensão. */
  name: string;
  /** A primeira linha é o cabeçalho. */
  table: string[][];
}

const STATUS: Record<AccountStatus, string> = {
  aquecendo: "Aquecendo",
  ativa: "Ativa",
  restrita: "Restrita",
  caida: "Caída",
};

const text = (value: string | null | undefined) => value ?? "";
/** Número como as planilhas em português esperam: "1234,5". */
const number = (value: number | null | undefined, digits?: number) =>
  value === null || value === undefined || Number.isNaN(Number(value))
    ? ""
    : (digits === undefined ? String(Number(value)) : Number(value).toFixed(digits)).replace(".", ",");
const date = (value: string | null | undefined) => (value ? formatDate(value.slice(0, 10)) : "");
const moment = (value: string | null | undefined) => {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const two = (n: number) => String(n).padStart(2, "0");
  return `${two(d.getDate())}/${two(d.getMonth() + 1)}/${d.getFullYear()} ${two(d.getHours())}:${two(d.getMinutes())}`;
};
const yes = (value: boolean) => (value ? "sim" : "não");
const list = (items: string[]) => items.filter(Boolean).join(" | ");

export function buildSheets(db: Db): Sheet[] {
  const countryOf = (id: string) => db.countries.find((country) => country.id === id);
  const avatarOf = (id: string | null) => db.avatars.find((avatar) => avatar.id === id);
  const accountOf = (id: string | null) => db.accounts.find((account) => account.id === id);
  const rates = cleanRates(db.settings?.brl_rates);

  const countries: string[][] = [["País", "Idioma", "Moeda", "Fuso horário", "Tags de aquecimento", "Anotações"]];
  for (const country of db.countries) {
    countries.push([
      country.name,
      text(country.language),
      country.currency,
      text(country.timezone),
      list(country.warmup_tags ?? []),
      text(country.notes),
    ]);
  }

  const avatars: string[][] = [
    [
      "Avatar",
      "País",
      "Nicho",
      "Situação",
      "Estrutura",
      "Produto",
      "Preço",
      "Moeda",
      "Site de vendas",
      "Checkout",
      "Página de entrega",
      "Pasta de entregáveis",
      "Outros links",
      "Kit: nome de exibição",
      "Kit: bio",
      "Kit: link da bio",
      "Kit: destaques",
      "Kit: fotos e provas sociais",
      "Vídeos para modelar",
      "Perfis de exemplo",
      "Anotações",
    ],
  ];
  for (const avatar of db.avatars) {
    const kit = avatar.kit ?? {};
    const structure = structureProgress(kit);
    avatars.push([
      avatar.name,
      text(countryOf(avatar.country_id)?.name),
      text(avatar.niche),
      avatar.status === "ativo" ? "Ativo" : "Pausado",
      structure.complete ? "Pronta" : `${structure.done} de ${structure.total} (falta ${pendingLabels(structure)})`,
      text(avatar.product_name),
      number(avatar.product_price, 2),
      text(avatar.product_currency),
      text(avatar.sales_site_url),
      text(avatar.checkout_url),
      text(avatar.delivery_page_url),
      text(avatar.deliverables_folder_url),
      list((avatar.extra_links ?? []).map((link) => `${link.label}: ${link.url}`)),
      text(kit.display_name),
      text(kit.bio),
      text(kit.bio_link),
      list((kit.highlights ?? []).map((item) => (item.text ? `${item.title}: ${item.text}` : item.title))),
      list((kit.proof_links ?? []).map((link) => `${link.label}: ${link.url}`)),
      list(
        (avatar.model_videos ?? []).map(
          (video) => `${video.label}: ${video.url} (${video.status === "modelado" ? "modelado" : "a modelar"})`,
        ),
      ),
      list((avatar.reference_profiles ?? []).map((profile) => (profile.note ? `${profile.handle} (${profile.note})` : profile.handle))),
      text(avatar.notes),
    ]);
  }

  const accounts: string[][] = [
    [
      "Avatar",
      "País",
      "Conta",
      "Geração",
      "Status",
      "E-mail",
      "Celular",
      "Perfil anti-detect",
      "Proxy / IP",
      "Criada em",
      "Caiu em",
      "Motivo da queda",
      "Seguidores",
      "Senhas",
      "Checklist de reposição",
      "Anotações",
    ],
  ];
  for (const account of [...db.accounts].sort(
    (a, b) =>
      text(avatarOf(a.avatar_id)?.name).localeCompare(text(avatarOf(b.avatar_id)?.name), "pt-BR") || a.generation - b.generation,
  )) {
    const avatar = avatarOf(account.avatar_id);
    const phone = db.phones.find((item) => item.id === account.phone_id);
    const profile = db.profiles.find((item) => item.id === account.profile_id);
    const progress = checklistProgress(readChecklist(account.checklist));
    accounts.push([
      text(avatar?.name),
      text(avatar ? countryOf(avatar.country_id)?.name : null),
      `@${account.handle}`,
      String(account.generation),
      STATUS[account.status] ?? account.status,
      text(account.email),
      phone ? phoneLabel(phone) : "",
      profile ? profileLabel(profile) : "",
      text(account.proxy),
      date(account.created_on),
      date(account.fell_on),
      text(account.fall_reason),
      number(account.followers),
      account.secrets_enc ? "No cofre" : "",
      progress.total > 0 ? `${progress.done} de ${progress.total}` : "",
      text(account.notes),
    ]);
  }

  const warmups: string[][] = [["Avatar", "Conta", "Geração", "Dia", "Data", "Usa a conta", "Minutos", "O que fazer", "Feito", "Calendário encerrado em"]];
  for (const warmup of db.warmups) {
    const account = accountOf(warmup.account_id);
    const avatar = account ? avatarOf(account.avatar_id) : undefined;
    for (const day of [...(warmup.days ?? [])].sort((a, b) => a.n - b.n)) {
      warmups.push([
        text(avatar?.name),
        account ? `@${account.handle}` : "",
        account ? String(account.generation) : "",
        String(day.n),
        date(day.date),
        yes(day.use),
        day.use ? String(day.minutes) : "",
        text(day.task),
        day.use ? yes(day.done) : "",
        moment(warmup.finished_at),
      ]);
    }
  }

  const sales: string[][] = [
    ["Avatar", "País", "Semana (segunda-feira)", "Valor", "Moeda", "Quantidade de vendas", "Cotação para reais", "Valor em reais", "Conta na semana", "Observação"],
  ];
  for (const sale of [...db.sales].sort(
    (a, b) => b.week_start.localeCompare(a.week_start) || text(avatarOf(a.avatar_id)?.name).localeCompare(text(avatarOf(b.avatar_id)?.name), "pt-BR"),
  )) {
    const avatar = avatarOf(sale.avatar_id);
    const account = accountOf(sale.account_id);
    sales.push([
      text(avatar?.name),
      text(avatar ? countryOf(avatar.country_id)?.name : null),
      date(sale.week_start),
      number(Number(sale.amount), 2),
      sale.currency,
      number(sale.sales_count),
      sale.currency === "BRL" ? "" : number(sale.brl_rate === null ? rates[sale.currency.toUpperCase()] : Number(sale.brl_rate)),
      number(inBRL(sale, rates), 2),
      account ? `@${account.handle} (${generationLabel(account.generation)})` : "",
      text(sale.notes),
    ]);
  }

  const phones: string[][] = [["Apelido", "Modelo", "Número / chip", "Observação"]];
  for (const phone of db.phones) phones.push([phone.nickname, text(phone.model), text(phone.number), text(phone.notes)]);

  const profiles: string[][] = [["Número", "Nome", "Proxy", "Observação"]];
  for (const profile of db.profiles) profiles.push([profile.number, text(profile.name), text(profile.proxy), text(profile.notes)]);

  const history: string[][] = [["Quando", "Avatar", "Conta", "Geração", "O que aconteceu"]];
  for (const entry of db.activity) {
    const account = accountOf(entry.account_id);
    history.push([
      moment(entry.occurred_at),
      text(avatarOf(entry.avatar_id)?.name),
      account ? `@${account.handle}` : "",
      account ? String(account.generation) : "",
      text(entry.message),
    ]);
  }

  // Funis para modelar: uma linha por etapa (o modelo sem etapa nenhuma ganha uma linha só com os dados dele).
  const funnels: string[][] = [
    ["Avatar", "País", "Modelo", "Perfil do modelo", "Nicho ou produto", "Observações", "Etapa", "Tipo", "Título", "Preço / quando chegou", "Link", "Anotações", "Modelado"],
  ];
  for (const avatar of db.avatars) {
    for (const model of readFunnels(avatar.kit)) {
      const head = [avatar.name, text(countryOf(avatar.country_id)?.name), model.name, model.handle, model.niche, model.notes];
      if (model.steps.length === 0) funnels.push([...head, "", "", "", "", "", "", ""]);
      model.steps.forEach((step, index) => {
        funnels.push([...head, String(index + 1), kindInfo(step.kind).label, step.title, step.detail, step.url, step.notes, yes(step.done)]);
      });
    }
  }

  return [
    { name: "paises", table: countries },
    { name: "avatares", table: avatars },
    { name: "contas", table: accounts },
    { name: "aquecimentos", table: warmups },
    { name: "vendas", table: sales },
    { name: "funis", table: funnels },
    { name: "celulares", table: phones },
    { name: "perfis-anti-detect", table: profiles },
    { name: "historico", table: history },
  ];
}

/** O bilhete que vai junto no .zip, explicando o que é cada arquivo. */
export function sheetsReadme(exportedAt: string): string {
  return [
    "Central de Avatares — planilhas",
    `Geradas em ${exportedAt}.`,
    "",
    "Cada arquivo .csv é uma tabela do painel, para abrir no Excel ou no Google Planilhas:",
    "  paises.csv              países e tags de aquecimento",
    "  avatares.csv            avatares, produto, links e kit de reposição",
    "  contas.csv              todas as contas (gerações), com status, celular, perfil e proxy",
    "  aquecimentos.csv        o calendário de aquecimento de cada conta, dia a dia",
    "  vendas.csv              vendas por semana",
    "  funis.csv               funis para modelar: cada avatar modelo e as etapas do funil dele",
    "  celulares.csv           celulares cadastrados",
    "  perfis-anti-detect.csv  perfis do navegador anti-detect",
    "  historico.csv           linha do tempo das contas",
    "",
    "As senhas do cofre NÃO estão aqui (a coluna Senhas só diz “No cofre”).",
    "Estas planilhas são para consulta. Para restaurar o painel, use o arquivo de backup (.json).",
    "",
  ].join("\r\n");
}
