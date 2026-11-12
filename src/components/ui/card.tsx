import { cn } from "@/lib/format";

export function Card({ className, children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("rounded-2xl border border-line bg-surface shadow-card", className)} {...rest}>
      {children}
    </div>
  );
}

interface SectionProps {
  title: string;
  subtitle?: React.ReactNode;
  /** Botões no canto direito do título. */
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  /** Sem espaçamento interno (para listas que vão de borda a borda). */
  flush?: boolean;
}

/** Cartão com título — o bloco padrão das telas. */
export function Section({ title, subtitle, actions, children, className, flush }: SectionProps) {
  return (
    <Card className={className}>
      <div className="flex items-start justify-between gap-3 px-4 pt-4 md:px-5">
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold leading-snug">{title}</h2>
          {subtitle ? <p className="mt-0.5 text-sm text-muted">{subtitle}</p> : null}
        </div>
        {actions ? <div className="-my-1 flex shrink-0 items-center gap-1.5">{actions}</div> : null}
      </div>
      <div className={cn(flush ? "pt-3" : "px-4 pb-4 pt-3 md:px-5")}>{children}</div>
    </Card>
  );
}

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, children, action, className }: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center px-4 py-8 text-center", className)}>
      {icon ? (
        <div className="mb-3 flex size-12 items-center justify-center rounded-2xl bg-surface-2 text-muted [&_svg]:size-6">
          {icon}
        </div>
      ) : null}
      <p className="font-medium">{title}</p>
      {children ? <div className="mt-1 max-w-sm text-sm leading-relaxed text-muted">{children}</div> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

/** Aviso em destaque dentro de uma tela ou formulário. */
export function Callout({
  tone = "info",
  icon,
  children,
  className,
}: {
  tone?: "info" | "warn" | "danger";
  icon?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  const tones = {
    info: "border-indigo-500/25 bg-indigo-500/8 text-indigo-900 dark:text-indigo-200",
    warn: "border-amber-500/35 bg-amber-500/10 text-amber-900 dark:text-amber-200",
    danger: "border-red-500/30 bg-red-500/10 text-red-800 dark:text-red-200",
  };
  return (
    <div className={cn("flex gap-2.5 rounded-xl border px-3.5 py-3 text-sm leading-relaxed", tones[tone], className)}>
      {icon ? <span className="mt-0.5 shrink-0 [&_svg]:size-4">{icon}</span> : null}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
