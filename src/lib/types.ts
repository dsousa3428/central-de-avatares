// Tipos que espelham as tabelas do banco (supabase/schema.sql).

export type AvatarStatus = "ativo" | "pausado";
export type AccountStatus = "aquecendo" | "ativa" | "restrita" | "caida";
export type VideoStatus = "a_modelar" | "modelado";

interface BaseRow {
  id: string;
  user_id: string;
  is_example: boolean;
  created_at: string;
}

export interface Country extends BaseRow {
  name: string;
  flag: string | null;
  language: string | null;
  currency: string;
  timezone: string | null;
  warmup_tags: string[];
  notes: string | null;
  position: number;
  updated_at: string;
}

export interface Phone extends BaseRow {
  nickname: string;
  model: string | null;
  number: string | null;
  notes: string | null;
  updated_at: string;
}

export interface AntidetectProfile extends BaseRow {
  number: string;
  name: string | null;
  proxy: string | null;
  notes: string | null;
  updated_at: string;
}

export interface LabeledLink {
  id: string;
  label: string;
  url: string;
}

export interface ModelVideo {
  id: string;
  label: string;
  url: string;
  status: VideoStatus;
  note: string;
}

export interface ReferenceProfile {
  id: string;
  handle: string;
  note: string;
}

export interface KitHighlight {
  id: string;
  title: string;
  text: string;
}

/** Tudo que é preciso para subir uma conta nova rápido. */
export interface ReplacementKit {
  display_name?: string;
  bio?: string;
  bio_link?: string;
  highlights?: KitHighlight[];
  proof_links?: LabeledLink[];
}

export interface Avatar extends BaseRow {
  country_id: string;
  name: string;
  niche: string | null;
  photo_url: string | null;
  status: AvatarStatus;
  product_name: string | null;
  product_price: number | null;
  product_currency: string | null;
  sales_site_url: string | null;
  checkout_url: string | null;
  delivery_page_url: string | null;
  deliverables_folder_url: string | null;
  extra_links: LabeledLink[];
  kit: ReplacementKit;
  model_videos: ModelVideo[];
  reference_profiles: ReferenceProfile[];
  notes: string | null;
  position: number;
  updated_at: string;
}

export interface ChecklistItem {
  key: string;
  label: string;
  done: boolean;
}

export interface Account extends BaseRow {
  avatar_id: string;
  generation: number;
  handle: string;
  email: string | null;
  secrets_enc: string | null;
  phone_id: string | null;
  profile_id: string | null;
  proxy: string | null;
  created_on: string;
  status: AccountStatus;
  followers: number | null;
  followers_updated_at: string | null;
  notes: string | null;
  fell_on: string | null;
  fall_reason: string | null;
  checklist: ChecklistItem[] | null;
  updated_at: string;
}

export interface WarmupDay {
  n: number;
  date: string;
  use: boolean;
  minutes: number;
  task: string;
  done: boolean;
  done_at: string | null;
}

export interface Warmup extends BaseRow {
  account_id: string;
  start_date: string;
  total_days: number;
  days: WarmupDay[];
  finished_at: string | null;
  notes: string | null;
  updated_at: string;
}

export interface WeeklySale extends BaseRow {
  avatar_id: string;
  account_id: string | null;
  week_start: string;
  amount: number;
  currency: string;
  sales_count: number | null;
  brl_rate: number | null;
  notes: string | null;
  updated_at: string;
}

export type ActivityKind =
  | "conta_criada"
  | "status_alterado"
  | "caiu"
  | "aquecimento_iniciado"
  | "aquecimento_concluido"
  | "nota";

export interface ActivityEntry extends BaseRow {
  avatar_id: string | null;
  account_id: string | null;
  kind: ActivityKind | (string & {});
  message: string | null;
  data: Record<string, unknown> | null;
  occurred_at: string;
}

export interface AppPrefs {
  /** Versão dos dados de exemplo já criados (0/ausente = nunca). */
  examples_version?: number;
}

export interface Settings {
  user_id: string;
  vault: Record<string, unknown> | null;
  warmup_defaults: Record<string, unknown> | null;
  brl_rates: Record<string, number>;
  prefs: AppPrefs;
  created_at: string;
  updated_at: string;
}

/** Nome da tabela no banco -> tipo da linha. */
export interface Tables {
  countries: Country;
  phones: Phone;
  antidetect_profiles: AntidetectProfile;
  avatars: Avatar;
  accounts: Account;
  warmups: Warmup;
  weekly_sales: WeeklySale;
  activity_log: ActivityEntry;
}

export type TableName = keyof Tables;

/** Campos que o banco preenche sozinho e nunca enviamos ao criar. */
type AutoFields = "id" | "user_id" | "created_at" | "updated_at";

export type NewRow<T extends TableName> = Partial<Omit<Tables[T], AutoFields>> & {
  id?: string;
};
export type RowPatch<T extends TableName> = Partial<Omit<Tables[T], AutoFields>>;
