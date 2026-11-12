import { cn } from "@/lib/format";
import type { AccountStatus, AvatarStatus } from "@/lib/types";

export type Tone = "gray" | "green" | "amber" | "orange" | "red" | "indigo" | "sky";

const TONES: Record<Tone, string> = {
  gray: "bg-slate-500/12 text-slate-700 dark:text-slate-300",
  green: "bg-emerald-500/14 text-emerald-800 dark:text-emerald-300",
  amber: "bg-amber-500/18 text-amber-800 dark:text-amber-300",
  orange: "bg-orange-500/16 text-orange-800 dark:text-orange-300",
  red: "bg-red-500/14 text-red-700 dark:text-red-300",
  indigo: "bg-indigo-500/14 text-indigo-700 dark:text-indigo-300",
  sky: "bg-sky-500/14 text-sky-800 dark:text-sky-300",
};

const DOTS: Record<Tone, string> = {
  gray: "bg-slate-400",
  green: "bg-emerald-500",
  amber: "bg-amber-500",
  orange: "bg-orange-500",
  red: "bg-red-500",
  indigo: "bg-indigo-500",
  sky: "bg-sky-500",
};

interface BadgeProps {
  tone?: Tone;
  dot?: boolean;
  className?: string;
  children: React.ReactNode;
}

export function Badge({ tone = "gray", dot = false, className, children }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold",
        TONES[tone],
        className,
      )}
    >
      {dot ? <span className={cn("size-1.5 rounded-full", DOTS[tone])} aria-hidden /> : null}
      {children}
    </span>
  );
}

export const ACCOUNT_STATUS: Record<AccountStatus, { label: string; tone: Tone }> = {
  aquecendo: { label: "Aquecendo", tone: "amber" },
  ativa: { label: "Ativa", tone: "green" },
  restrita: { label: "Restrita", tone: "orange" },
  caida: { label: "Caída", tone: "red" },
};

export const AVATAR_STATUS: Record<AvatarStatus, { label: string; tone: Tone }> = {
  ativo: { label: "Ativo", tone: "green" },
  pausado: { label: "Pausado", tone: "gray" },
};

export function AccountStatusBadge({ status }: { status: AccountStatus }) {
  const info = ACCOUNT_STATUS[status] ?? { label: status, tone: "gray" as Tone };
  return (
    <Badge tone={info.tone} dot>
      {info.label}
    </Badge>
  );
}

export function AvatarStatusBadge({ status }: { status: AvatarStatus }) {
  const info = AVATAR_STATUS[status] ?? { label: status, tone: "gray" as Tone };
  return <Badge tone={info.tone}>{info.label}</Badge>;
}

export function ExampleBadge() {
  return <Badge tone="indigo">Exemplo</Badge>;
}
