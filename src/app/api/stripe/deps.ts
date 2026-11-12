import type { RouteDeps } from "@/lib/stripe-server";

/**
 * O que as rotas da Stripe precisam do ambiente. É lido a cada pedido e nunca
 * fica guardado: a chave (STRIPE_SECRET_KEY) só existe nas variáveis de ambiente
 * do servidor — nunca no repositório, nunca no código que o navegador baixa.
 */
export function routeDeps(): RouteDeps {
  return {
    env: process.env,
    supabase: {
      url: process.env.NEXT_PUBLIC_SUPABASE_URL,
      // (os mesmos nomes que src/lib/supabase.ts aceita)
      key:
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ??
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY,
    },
    fetch,
  };
}
