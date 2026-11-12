import { LoaderCircle } from "lucide-react";
import { cn } from "@/lib/format";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "danger-ghost" | "danger-soft" | "soft";
type Size = "sm" | "md" | "lg";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-primary text-primary-fg shadow-card hover:bg-primary-hover",
  secondary: "border border-line bg-surface text-fg shadow-card hover:bg-surface-2",
  soft: "bg-primary-soft text-primary-soft-fg hover:brightness-95 dark:hover:brightness-125",
  ghost: "text-fg hover:bg-surface-2",
  danger: "bg-danger text-white shadow-card hover:bg-danger-hover",
  "danger-ghost": "text-danger hover:bg-red-500/10",
  // fundo avermelhado suave: para uma ação séria que não é "apagar" (ex.: "Conta caiu")
  "danger-soft": "bg-red-500/10 text-red-700 hover:bg-red-500/15 dark:text-red-300",
};

const SIZES: Record<Size, string> = {
  sm: "h-9 gap-1.5 rounded-lg px-3 text-sm",
  md: "h-11 gap-2 rounded-xl px-4 text-[15px]",
  lg: "h-12 gap-2 rounded-xl px-5 text-base",
};

const ICON_SIZES: Record<Size, string> = {
  sm: "size-9 rounded-lg",
  md: "size-11 rounded-xl",
  lg: "size-12 rounded-xl",
};

const BASE =
  "inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap font-medium transition-colors " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring " +
  "disabled:pointer-events-none disabled:opacity-50 [&_svg]:shrink-0";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  /** Botão quadrado só com ícone (use aria-label). */
  iconOnly?: boolean;
  block?: boolean;
}

export function Button({
  variant = "secondary",
  size = "md",
  loading = false,
  iconOnly = false,
  block = false,
  className,
  children,
  disabled,
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={cn(
        BASE,
        VARIANTS[variant],
        iconOnly ? ICON_SIZES[size] : SIZES[size],
        block && "w-full",
        className,
      )}
      {...rest}
    >
      {loading ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : null}
      {loading && iconOnly ? null : children}
    </button>
  );
}

export function buttonClass(variant: Variant = "secondary", size: Size = "md", extra?: string): string {
  return cn(BASE, VARIANTS[variant], SIZES[size], extra);
}
