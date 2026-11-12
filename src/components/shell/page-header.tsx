import Link from "next/link";
import { ChevronLeft } from "lucide-react";

interface PageHeaderProps {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  /** Botões no canto direito. */
  actions?: React.ReactNode;
  /** Link de "voltar" acima do título. */
  back?: { href: string; label: string };
}

export function PageHeader({ title, subtitle, actions, back }: PageHeaderProps) {
  return (
    <header className="mb-5">
      {back ? (
        <Link
          href={back.href}
          className="-ml-1.5 mb-2 inline-flex h-9 items-center gap-0.5 rounded-lg pl-0.5 pr-2 text-sm font-medium text-muted transition-colors hover:text-fg focus-visible:outline-2 focus-visible:outline-ring"
        >
          <ChevronLeft className="size-4" aria-hidden />
          {back.label}
        </Link>
      ) : null}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          {subtitle ? <p className="mt-1 text-sm text-muted">{subtitle}</p> : null}
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
      </div>
    </header>
  );
}
