import { handleLinks } from "@/lib/stripe-server";
import { routeDeps } from "../deps";

// (cada pedido leva poucos segundos; o limite folgado é para uma Stripe lenta não virar erro da hospedagem)
export const maxDuration = 30;

/** Os links de pagamento da conta Stripe do dono do painel (ver src/lib/stripe-server.ts). */
export function POST(request: Request): Promise<Response> {
  return handleLinks(request, routeDeps());
}
