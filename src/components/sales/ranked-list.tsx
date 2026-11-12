import Link from "next/link";

export interface RankedRow {
  key: string;
  name: React.ReactNode;
  /** Para onde o nome leva (opcional). */
  href?: string;
  /** O número usado para o tamanho da barra. */
  value: number;
  /** O valor por extenso, à direita. */
  primary: string;
  /** Linha menor, embaixo (ex.: o equivalente em reais). */
  secondary?: string | null;
}

/**
 * Lista do maior para o menor: nome, valor e uma barra por linha, todas
 * partindo do mesmo ponto para dar para comparar. Uma cor só (o tamanho já diz
 * quem é maior).
 */
export function RankedList({ rows, ariaLabel }: { rows: RankedRow[]; ariaLabel: string }) {
  const max = Math.max(0, ...rows.map((row) => row.value));
  return (
    <ol className="space-y-3.5" aria-label={ariaLabel}>
      {rows.map((row, index) => (
        <li key={row.key}>
          {/* valores compridos (várias moedas) descem para a linha de baixo em vez de espremer o nome */}
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
            <span className="min-w-0 max-w-full truncate text-[15px]">
              <span className="mr-1.5 tabular-nums text-muted">{index + 1}.</span>
              {row.href ? (
                <Link href={row.href} className="font-medium underline-offset-2 hover:underline">
                  {row.name}
                </Link>
              ) : (
                <span className="font-medium">{row.name}</span>
              )}
            </span>
            <span className="ml-auto min-w-0 text-right text-[15px] font-semibold tabular-nums">{row.primary}</span>
          </div>
          <div className="mt-1.5 h-2.5" aria-hidden>
            <div
              className="h-2.5 rounded-r-[4px] bg-primary"
              style={{ width: `${max > 0 ? (row.value / max) * 100 : 0}%`, minWidth: row.value > 0 ? 2 : 0 }}
            />
          </div>
          {row.secondary ? <p className="mt-1 text-xs text-muted">{row.secondary}</p> : null}
        </li>
      ))}
    </ol>
  );
}
