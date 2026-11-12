import { cn } from "@/lib/format";

/** Marca do app: um avatar dentro de um quadrado arredondado. */
export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={cn("size-9", className)} aria-hidden>
      <defs>
        <linearGradient id="cda-logo-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#6366f1" />
          <stop offset="1" stopColor="#4338ca" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill="url(#cda-logo-bg)" />
      <circle cx="32" cy="25" r="10" fill="#fff" />
      <path d="M13 54c1.6-11 9.4-17 19-17s17.4 6 19 17z" fill="#fff" fillOpacity="0.92" />
      <circle cx="49" cy="15" r="5" fill="#a5b4fc" />
    </svg>
  );
}
