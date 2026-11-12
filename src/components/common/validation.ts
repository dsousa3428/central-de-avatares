import { AppError } from "@/lib/errors";

/** Interrompe o salvamento com uma mensagem para o usuário corrigir o campo. */
export function invalid(message: string): never {
  throw new AppError("invalid", message);
}
