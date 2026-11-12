import { LoaderCircle } from "lucide-react";
import { cn } from "@/lib/format";

export function Spinner({ className }: { className?: string }) {
  return <LoaderCircle className={cn("size-5 animate-spin text-muted", className)} aria-hidden />;
}

/** Tela inteira de "carregando". */
export function FullScreenLoading({ message }: { message?: string | null }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 px-6 text-center" role="status">
      <Spinner className="size-7 text-primary" />
      <p className="text-sm text-muted">{message ?? "Carregando…"}</p>
    </div>
  );
}
