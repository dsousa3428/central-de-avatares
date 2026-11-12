"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/format";

export interface TabItem<T extends string> {
  value: T;
  label: React.ReactNode;
  /** Número pequeno ao lado do rótulo. */
  count?: number;
}

interface TabsProps<T extends string> {
  items: TabItem<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
  className?: string;
}

/** Abas em formato de "pílulas", com rolagem lateral no celular. */
export function Tabs<T extends string>({ items, value, onChange, ariaLabel, className }: TabsProps<T>) {
  const listRef = useRef<HTMLDivElement>(null);
  const firstRender = useRef(true);

  // Mantém a aba escolhida visível quando a lista rola para os lados.
  useEffect(() => {
    const list = listRef.current;
    const active = list?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (!list || !active) return;
    const target = active.offsetLeft - (list.clientWidth - active.offsetWidth) / 2;
    list.scrollTo({ left: Math.max(0, target), behavior: firstRender.current ? "auto" : "smooth" });
    firstRender.current = false;
  }, [value]);

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label={ariaLabel}
      className={cn("no-scrollbar relative -mx-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:flex-wrap md:px-0", className)}
    >
      {items.map((item) => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(item.value)}
            className={cn(
              "inline-flex h-10 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-medium transition-colors",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
              active
                ? "border-primary bg-primary text-primary-fg shadow-card"
                : "border-line bg-surface text-fg hover:bg-surface-2",
            )}
          >
            {item.label}
            {item.count !== undefined ? (
              <span
                className={cn(
                  "rounded-full px-1.5 text-xs font-semibold tabular-nums",
                  active ? "bg-white/20" : "bg-surface-2 text-muted",
                )}
              >
                {item.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

interface SegmentedProps<T extends string> {
  items: Array<{ value: T; label: React.ReactNode }>;
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
  className?: string;
}

/** Escolha entre poucas opções lado a lado. */
export function Segmented<T extends string>({ items, value, onChange, ariaLabel, className }: SegmentedProps<T>) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className={cn("flex rounded-xl bg-surface-2 p-1", className)}>
      {items.map((item) => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(item.value)}
            className={cn(
              "inline-flex h-9 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-2 text-sm font-medium transition-colors",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
              active ? "bg-surface text-fg shadow-card" : "text-muted hover:text-fg",
            )}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
