import { CalendarCheck, Globe, Settings, Smartphone, Table2, TrendingUp, type LucideIcon } from "lucide-react";

export interface NavItem {
  href: string;
  /** Rótulo curto (barra de baixo no celular). */
  label: string;
  /** Rótulo completo (menu lateral no computador e menu "Mais" no celular). */
  longLabel: string;
  icon: LucideIcon;
  /** Outros caminhos que também acendem este item. */
  also?: string[];
  /** No celular: fica na barra de baixo ("bar") ou dentro do menu "Mais" ("more"). */
  mobile: "bar" | "more";
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Hoje", longLabel: "Hoje", icon: CalendarCheck, mobile: "bar" },
  { href: "/paises", label: "Países", longLabel: "Países e avatares", icon: Globe, also: ["/avatar"], mobile: "bar" },
  { href: "/planilha", label: "Planilha", longLabel: "Planilha", icon: Table2, mobile: "bar" },
  { href: "/vendas", label: "Vendas", longLabel: "Vendas", icon: TrendingUp, mobile: "bar" },
  { href: "/infraestrutura", label: "Infra", longLabel: "Infraestrutura", icon: Smartphone, mobile: "more" },
  { href: "/configuracoes", label: "Config", longLabel: "Configurações", icon: Settings, mobile: "more" },
];

export function isActive(item: NavItem, pathname: string): boolean {
  const matches = (base: string) => (base === "/" ? pathname === "/" : pathname === base || pathname.startsWith(`${base}/`));
  return matches(item.href) || (item.also ?? []).some(matches);
}
