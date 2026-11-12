// Dados de exemplo (fictícios): país Itália + avatar Fra' Salvio.
// Servem só para ver o painel funcionando. Tudo aqui é marcado com
// is_example = true, para poder ser apagado de uma vez em Configurações.

import { getSupabase } from "./supabase";
import { toAppError } from "./errors";
import { addDays, todayISO } from "./dates";
import { uid } from "./format";
import type {
  Account,
  AntidetectProfile,
  Avatar,
  Country,
  KitHighlight,
  LabeledLink,
  ModelVideo,
  Phone,
  ReferenceProfile,
} from "./types";
import type { Db } from "./store";
import { buildDays, DEFAULT_WARMUP_PLAN } from "./warmup";

/**
 * Aumente quando os exemplos ganharem dados novos.
 *  1 = país, avatar, contas, celulares e perfis
 *  2 = + calendário de aquecimento da conta de exemplo que está aquecendo
 */
export const EXAMPLES_VERSION = 2;

async function insertOne<T>(table: string, values: Record<string, unknown>): Promise<T> {
  const { data, error } = await getSupabase().from(table).insert(values).select().single();
  if (error) throw toAppError(error);
  return data as T;
}

/** Cria os exemplos. Chamado na primeira vez que o painel abre vazio. */
export async function seedExamples(): Promise<void> {
  const today = todayISO();
  const ex = { is_example: true };

  const [phoneA, phoneB] = await Promise.all([
    insertOne<Phone>("phones", {
      ...ex,
      nickname: "Celular A",
      model: "Samsung Galaxy A15",
      number: "+39 351 000 0001",
      notes: "Exemplo fictício. Usado na 1ª conta do Fra' Salvio (que caiu).",
    }),
    insertOne<Phone>("phones", {
      ...ex,
      nickname: "Celular B",
      model: "Xiaomi Redmi 13C",
      number: "+39 351 000 0002",
      notes: "Exemplo fictício.",
    }),
  ]);

  const [profile1, profile2] = await Promise.all([
    insertOne<AntidetectProfile>("antidetect_profiles", {
      ...ex,
      number: "101",
      name: "Fra' Salvio IT — 1ª conta",
      proxy: "it-res-01.exemplo.net:8000",
      notes: "Exemplo fictício.",
    }),
    insertOne<AntidetectProfile>("antidetect_profiles", {
      ...ex,
      number: "102",
      name: "Fra' Salvio IT — 2ª conta",
      proxy: "it-res-02.exemplo.net:8000",
      notes: "Exemplo fictício.",
    }),
  ]);

  const country = await insertOne<Country>("countries", {
    ...ex,
    name: "Itália",
    flag: "🇮🇹",
    language: "Italiano",
    currency: "EUR",
    timezone: "Europe/Rome",
    warmup_tags: [
      "#benessere",
      "#rimedinaturali",
      "#erbe",
      "#tisane",
      "#vitasana",
      "#ricettedellanonna",
      "cucina tradizionale",
      "@erboristeria.esempio",
    ],
    notes: "País de exemplo, para você conhecer o painel.",
    position: 0,
  });

  const extraLinks: LabeledLink[] = [
    { id: uid(), label: "Grupo de suporte", url: "https://exemplo.com/suporte" },
  ];
  const highlights: KitHighlight[] = [
    { id: uid(), title: "Chi sono", text: "Sono Fra' Salvio 🌿 Da 40 anni raccolgo le erbe del nostro orto." },
    { id: uid(), title: "Ricette", text: "Le ricette più amate: tisane, unguenti e rimedi della tradizione." },
    { id: uid(), title: "Recensioni", text: "Cosa dicono le persone che hanno provato il ricettario." },
  ];
  const proofLinks: LabeledLink[] = [
    { id: uid(), label: "Prova social 1 (print de depoimento)", url: "https://exemplo.com/provas/depoimento-1.jpg" },
    { id: uid(), label: "Prova social 2 (print de depoimento)", url: "https://exemplo.com/provas/depoimento-2.jpg" },
    { id: uid(), label: "Foto de perfil", url: "https://exemplo.com/fotos/fra-salvio-perfil.jpg" },
  ];
  const videos: ModelVideo[] = [
    {
      id: uid(),
      label: "Frade mostrando a horta (gancho forte nos 3 primeiros segundos)",
      url: "https://exemplo.com/videos/horta",
      status: "a_modelar",
      note: "Modelar o gancho e o corte rápido.",
    },
    {
      id: uid(),
      label: "Receita de chá em 30 segundos",
      url: "https://exemplo.com/videos/cha-30s",
      status: "a_modelar",
      note: "",
    },
    {
      id: uid(),
      label: "Depoimento de cliente lendo o livro",
      url: "https://exemplo.com/videos/depoimento",
      status: "modelado",
      note: "Já gravado em 03/11.",
    },
  ];
  const references: ReferenceProfile[] = [
    { id: uid(), handle: "@frate.erborista.esempio", note: "Estilo visual e tom de voz." },
    { id: uid(), handle: "@ricette.della.nonna.esempio", note: "Formato dos carrosséis." },
  ];

  const avatar = await insertOne<Avatar>("avatars", {
    ...ex,
    country_id: country.id,
    name: "Fra' Salvio",
    niche: "Remédios naturais e bem-estar (frade herbalista)",
    status: "ativo",
    product_name: "Il Ricettario di Fra' Salvio (e-book)",
    product_price: 27,
    product_currency: "EUR",
    sales_site_url: "https://exemplo.com/fra-salvio",
    checkout_url: "https://exemplo.com/fra-salvio/checkout",
    delivery_page_url: "https://exemplo.com/fra-salvio/obrigado",
    deliverables_folder_url: "https://exemplo.com/pasta-de-entregaveis",
    extra_links: extraLinks,
    kit: {
      display_name: "Fra' Salvio 🌿",
      bio: "Frate erborista 🌿 Rimedi naturali della tradizione\nRicette semplici per il benessere di ogni giorno\n👇 Scarica il ricettario",
      bio_link: "https://exemplo.com/fra-salvio",
      highlights,
      proof_links: proofLinks,
    },
    model_videos: videos,
    reference_profiles: references,
    notes: "Avatar de exemplo, com dados fictícios, para você ver como o painel funciona.",
    position: 0,
  });

  const gen1Created = addDays(today, -75);
  const gen1Fell = addDays(today, -6);
  const gen2Created = addDays(today, -4);

  const gen1 = await insertOne<Account>("accounts", {
    ...ex,
    avatar_id: avatar.id,
    generation: 1,
    handle: "fra.salvio",
    email: "frasalvio.conta1@exemplo.com",
    phone_id: phoneA.id,
    profile_id: profile1.id,
    proxy: "it-res-01.exemplo.net:8000",
    created_on: gen1Created,
    status: "caida",
    followers: 1840,
    followers_updated_at: new Date().toISOString(),
    fell_on: gen1Fell,
    fall_reason: "Seguiu gente demais em pouco tempo",
    notes: "Primeira conta do avatar (exemplo).",
  });

  const gen2 = await insertOne<Account>("accounts", {
    ...ex,
    avatar_id: avatar.id,
    generation: 2,
    handle: "fra.salvio",
    email: "frasalvio.conta2@exemplo.com",
    phone_id: phoneB.id,
    profile_id: profile2.id,
    proxy: "it-res-02.exemplo.net:8000",
    created_on: gen2Created,
    status: "aquecendo",
    followers: 37,
    followers_updated_at: new Date().toISOString(),
    notes: "Conta de reposição (exemplo), em aquecimento.",
  });

  const at = (isoDate: string, hour: number) => new Date(`${isoDate}T${String(hour).padStart(2, "0")}:00:00`).toISOString();

  await insertOne("warmups", exampleWarmup(gen2.id, gen2Created, today));

  const { error } = await getSupabase()
    .from("activity_log")
    .insert([
      {
        ...ex,
        avatar_id: avatar.id,
        account_id: gen1.id,
        kind: "conta_criada",
        message: "Conta criada (1ª geração)",
        occurred_at: at(gen1Created, 10),
      },
      {
        ...ex,
        avatar_id: avatar.id,
        account_id: gen1.id,
        kind: "status_alterado",
        message: "Status: Aquecendo → Ativa",
        occurred_at: at(addDays(gen1Created, 10), 18),
      },
      {
        ...ex,
        avatar_id: avatar.id,
        account_id: gen1.id,
        kind: "caiu",
        message: "Conta caiu — Seguiu gente demais em pouco tempo",
        occurred_at: at(gen1Fell, 9),
      },
      {
        ...ex,
        avatar_id: avatar.id,
        account_id: gen2.id,
        kind: "conta_criada",
        message: "Conta criada (2ª geração)",
        occurred_at: at(gen2Created, 11),
      },
    ]);
  if (error) throw toAppError(error);
}

/**
 * Aquecimento de exemplo: começou na data de criação da conta, com os dias de
 * uso anteriores a hoje já marcados como feitos — assim a tela Hoje mostra uma
 * tarefa de verdade para testar.
 */
function exampleWarmup(accountId: string, startDate: string, today: string): Record<string, unknown> {
  const days = buildDays(startDate, DEFAULT_WARMUP_PLAN).map((day) => {
    const done = day.use && day.date < today;
    return {
      ...day,
      task: day.date === today && day.use ? "Texto de exemplo: anote aqui o que fazer na conta neste dia." : "",
      done,
      done_at: done ? new Date(`${day.date}T18:00:00`).toISOString() : null,
    };
  });
  return {
    is_example: true,
    account_id: accountId,
    start_date: startDate,
    total_days: days.length,
    days,
  };
}

/**
 * Completa exemplos criados por uma versão anterior do painel (só mexe em
 * linhas marcadas como exemplo). Devolve true se criou alguma coisa.
 */
export async function upgradeExamples(db: Db, fromVersion: number): Promise<boolean> {
  let changed = false;
  if (fromVersion < 2) {
    const today = todayISO();
    const withWarmup = new Set(db.warmups.map((w) => w.account_id));
    for (const account of db.accounts) {
      if (!account.is_example || account.status !== "aquecendo" || withWarmup.has(account.id)) continue;
      // Começa no máximo 4 dias atrás: assim hoje cai num dia de uso e há uma tarefa para testar,
      // mesmo que o exemplo tenha sido criado há muito tempo.
      const recent = addDays(today, -4);
      const start = account.created_on > recent ? account.created_on : recent;
      await insertOne("warmups", exampleWarmup(account.id, start, today));
      changed = true;
    }
  }
  return changed;
}

export interface ExampleCounts {
  countries: number;
  avatars: number;
  accounts: number;
  phones: number;
  profiles: number;
  total: number;
}

export function countExamples(db: Db): ExampleCounts {
  const countries = db.countries.filter((r) => r.is_example).length;
  const avatars = db.avatars.filter((r) => r.is_example).length;
  const accounts = db.accounts.filter((r) => r.is_example).length;
  const phones = db.phones.filter((r) => r.is_example).length;
  const profiles = db.profiles.filter((r) => r.is_example).length;
  return {
    countries,
    avatars,
    accounts,
    phones,
    profiles,
    total: countries + avatars + accounts + phones + profiles,
  };
}

async function idsWhere(table: string, column: string, values: string[]): Promise<Set<string>> {
  if (values.length === 0) return new Set();
  const { data, error } = await getSupabase().from(table).select(column).in(column, values);
  if (error) throw toAppError(error);
  const rows = (data ?? []) as unknown as Array<Record<string, string | null>>;
  return new Set(rows.map((r) => r[column]).filter((v): v is string => Boolean(v)));
}

async function exampleIds(table: string): Promise<string[]> {
  const { data, error } = await getSupabase().from(table).select("id").eq("is_example", true);
  if (error) throw toAppError(error);
  return ((data ?? []) as Array<{ id: string }>).map((r) => r.id);
}

async function deleteIds(table: string, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await getSupabase().from(table).delete().in("id", ids);
  if (error) throw toAppError(error);
}

async function keepIds(table: string, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await getSupabase().from(table).update({ is_example: false }).in("id", ids);
  if (error) throw toAppError(error);
}

/**
 * Apaga os exemplos de baixo para cima (contas → avatares → país → aparelhos).
 * Regra de segurança: se você cadastrou algo SEU dentro de um exemplo (por
 * exemplo, um avatar real dentro do país de exemplo), esse exemplo NÃO é
 * apagado — ele apenas deixa de ser marcado como exemplo.
 */
export async function deleteExamples(): Promise<void> {
  // 1) registros "folha"
  await deleteIds("activity_log", await exampleIds("activity_log"));
  await deleteIds("weekly_sales", await exampleIds("weekly_sales"));
  await deleteIds("warmups", await exampleIds("warmups"));
  await deleteIds("accounts", await exampleIds("accounts"));

  // 2) avatares de exemplo: só apaga os que ficaram sem contas e sem vendas
  const avatarIds = await exampleIds("avatars");
  const avatarsWithAccounts = await idsWhere("accounts", "avatar_id", avatarIds);
  const avatarsWithSales = await idsWhere("weekly_sales", "avatar_id", avatarIds);
  const avatarsToKeep = avatarIds.filter((id) => avatarsWithAccounts.has(id) || avatarsWithSales.has(id));
  await keepIds("avatars", avatarsToKeep);
  await deleteIds("avatars", avatarIds.filter((id) => !avatarsToKeep.includes(id)));

  // 3) países de exemplo: só apaga os que ficaram sem avatares
  const countryIds = await exampleIds("countries");
  const countriesInUse = await idsWhere("avatars", "country_id", countryIds);
  await keepIds("countries", countryIds.filter((id) => countriesInUse.has(id)));
  await deleteIds("countries", countryIds.filter((id) => !countriesInUse.has(id)));

  // 4) celulares e perfis de exemplo: só apaga os que nenhuma conta usa
  const phoneIds = await exampleIds("phones");
  const phonesInUse = await idsWhere("accounts", "phone_id", phoneIds);
  await keepIds("phones", phoneIds.filter((id) => phonesInUse.has(id)));
  await deleteIds("phones", phoneIds.filter((id) => !phonesInUse.has(id)));

  const profileIds = await exampleIds("antidetect_profiles");
  const profilesInUse = await idsWhere("accounts", "profile_id", profileIds);
  await keepIds("antidetect_profiles", profileIds.filter((id) => profilesInUse.has(id)));
  await deleteIds("antidetect_profiles", profileIds.filter((id) => !profilesInUse.has(id)));
}

async function unmarkWhere(table: string, column: string, values: string[]): Promise<void> {
  if (values.length === 0) return;
  const { error } = await getSupabase().from(table).update({ is_example: false }).in(column, values);
  if (error) throw toAppError(error);
}

/**
 * "Ficar com este país": o país deixa de ser exemplo e não é mais apagado
 * junto com os exemplos. (Os avatares de exemplo dentro dele continuam exemplos.)
 */
export async function keepExampleCountry(countryId: string): Promise<void> {
  await unmarkWhere("countries", "id", [countryId]);
}

/**
 * "Ficar com este avatar": o avatar, as contas dele (com histórico, aquecimento
 * e vendas), o país e os celulares/perfis usados pelas contas deixam de ser
 * exemplo. Nada é apagado nem alterado além da marca de exemplo.
 */
export async function keepExampleAvatar(db: Db, avatarId: string): Promise<void> {
  const avatar = db.avatars.find((a) => a.id === avatarId);
  if (!avatar) return;
  const accounts = db.accounts.filter((a) => a.avatar_id === avatarId);
  const accountIds = accounts.map((a) => a.id);
  const phoneIds = [...new Set(accounts.map((a) => a.phone_id).filter((id): id is string => Boolean(id)))];
  const profileIds = [...new Set(accounts.map((a) => a.profile_id).filter((id): id is string => Boolean(id)))];

  await unmarkWhere("activity_log", "avatar_id", [avatarId]);
  await unmarkWhere("weekly_sales", "avatar_id", [avatarId]);
  await unmarkWhere("warmups", "account_id", accountIds);
  await unmarkWhere("accounts", "avatar_id", [avatarId]);
  await unmarkWhere("phones", "id", phoneIds);
  await unmarkWhere("antidetect_profiles", "id", profileIds);
  await unmarkWhere("countries", "id", [avatar.country_id]);
  await unmarkWhere("avatars", "id", [avatarId]);
}
