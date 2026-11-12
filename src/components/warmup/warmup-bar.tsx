import { cn } from "@/lib/format";
import type { WarmupInfo } from "@/lib/warmup";

const TONES: Record<WarmupInfo["phase"], string> = {
  agendado: "bg-slate-400",
  em_andamento: "bg-amber-500",
  atrasado: "bg-red-500",
  concluido: "bg-emerald-500",
};

/** Barra de progresso do aquecimento (pelos dias de uso já feitos). */
export function WarmupBar({ info, className }: { info: WarmupInfo; className?: string }) {
  return (
    <div
      role="progressbar"
      aria-label="Progresso do aquecimento"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={info.percent}
      className={cn("h-2 w-full overflow-hidden rounded-full bg-surface-2", className)}
    >
      <div
        className={cn("h-full rounded-full transition-[width] duration-300", TONES[info.phase])}
        style={{ width: `${info.percent}%` }}
      />
    </div>
  );
}
