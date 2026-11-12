import { ExternalLink } from "lucide-react";
import { cn, prettyUrl, safeHref } from "@/lib/format";
import { CopyButton } from "@/components/ui/copy-button";

export function DetailList({ children, className }: { children: React.ReactNode; className?: string }) {
  return <dl className={cn("divide-y divide-line", className)}>{children}</dl>;
}

interface DetailRowProps {
  label: string;
  /** Texto simples (usado também pelo botão de copiar). */
  value?: string | null;
  /** Conteúdo personalizado no lugar do texto. */
  children?: React.ReactNode;
  copy?: boolean;
  copyMessage?: string;
  mono?: boolean;
}

/** Linha "rótulo: valor", com botão de copiar opcional. */
export function DetailRow({ label, value, children, copy, copyMessage, mono }: DetailRowProps) {
  const empty = children === undefined && !value;
  return (
    <div className="flex min-h-12 items-center gap-3 py-2">
      <div className="min-w-0 flex-1 md:flex md:items-center md:gap-3">
        <dt className="text-sm text-muted md:w-36 md:shrink-0">{label}</dt>
        <dd className={cn("mt-0.5 min-w-0 text-[15px] md:mt-0 md:flex-1", mono && "font-mono text-sm")}>
          {empty ? <span className="text-muted">—</span> : (children ?? value)}
        </dd>
      </div>
      {copy && value ? <CopyButton text={value} message={copyMessage} /> : null}
    </div>
  );
}

/** Link que abre em outra aba, sem revelar ao site de destino de onde você veio. */
export function ExternalLinkText({ url, className }: { url: string | null | undefined; className?: string }) {
  const href = safeHref(url);
  if (!href) return <span className="text-muted">{url || "—"}</span>;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 font-medium text-primary underline-offset-2 hover:underline",
        className,
      )}
    >
      <span className="truncate">{prettyUrl(url)}</span>
      <ExternalLink className="size-3.5 shrink-0" aria-hidden />
    </a>
  );
}

/** Linha de link: rótulo + endereço clicável + copiar. */
export function LinkRow({ label, url }: { label: string; url: string | null | undefined }) {
  return (
    <div className="flex min-h-12 items-center gap-3 py-1.5">
      <div className="min-w-0 flex-1">
        <p className="text-sm text-muted">{label}</p>
        {url ? <ExternalLinkText url={url} className="text-[15px]" /> : <p className="text-[15px] text-muted">—</p>}
      </div>
      <CopyButton text={url} message="Link copiado" />
    </div>
  );
}
