import { handleSales } from "@/lib/stripe-server";
import { routeDeps } from "../deps";

// (cada pedido leva poucos segundos; o limite folgado é para uma Stripe lenta não virar erro da hospedagem)
export const maxDuration = 30;

/** As vendas pagas de um link de pagamento num período (ver src/lib/stripe-server.ts). */
export function POST(request: Request): Promise<Response> {
  return handleSales(request, routeDeps());
}
