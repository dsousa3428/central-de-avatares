import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// As duas informações abaixo vêm das variáveis de ambiente (Vercel → Settings →
// Environment Variables). Elas são públicas por natureza: quem protege os dados
// é o login + as regras de Row Level Security do banco.
const rawUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
const rawKey = (
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY ??
  ""
).trim();

function validUrl(value: string): string | null {
  try {
    const u = new URL(value);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    return u.origin;
  } catch {
    return null;
  }
}

const supabaseUrl = validUrl(rawUrl);

export type SupabaseConfigProblem = "missing" | "bad_url" | null;

/** Diz se (e por que) a configuração do Supabase está faltando. */
export const supabaseConfigProblem: SupabaseConfigProblem =
  !rawUrl || !rawKey ? "missing" : !supabaseUrl ? "bad_url" : null;

export const isSupabaseConfigured = supabaseConfigProblem === null;

let client: SupabaseClient | null = null;

/** Cliente único do Supabase (somente no navegador). */
export function getSupabase(): SupabaseClient {
  if (!supabaseUrl || !rawKey) {
    throw new Error("Supabase não configurado.");
  }
  if (!client) {
    client = createClient(supabaseUrl, rawKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
        storageKey: "cda-auth",
      },
    });
  }
  return client;
}
