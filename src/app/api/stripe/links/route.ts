import { handleLinks } from "@/lib/stripe-server";
import { routeDeps } from "../deps";

/** Os links de pagamento da conta Stripe do dono do painel (ver src/lib/stripe-server.ts). */
export function POST(request: Request): Promise<Response> {
  return handleLinks(request, routeDeps());
}
