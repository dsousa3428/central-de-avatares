import { handleSales } from "@/lib/stripe-server";
import { routeDeps } from "../deps";

/** As vendas pagas de um link de pagamento num período (ver src/lib/stripe-server.ts). */
export function POST(request: Request): Promise<Response> {
  return handleSales(request, routeDeps());
}
