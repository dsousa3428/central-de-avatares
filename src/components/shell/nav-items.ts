import { CalendarCheck, Globe, Settings, Smartphone, TrendingUp, type LucideIcon } from "lucide-react";

export interface NavItem {
  href: string;
  /** Rótulo curto (barra de baixo no celular). */
  label: string;
  /** Rótulo completo (menu lateral no computador). */
  longLabel: string;
  icon: LucideIcon;
  /** Outros caminhos que também acendem este item. */
  also?: string[];
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Hoje", longLabel: "Hoje", icon: CalendarCheck },
  { href: "/paises", label: "Países", longLabel: "Países e avatares", icon: Globe, also: ["/avatar"] },
  { href: "/vendas", label: "Vendas", longLabel: "Vendas", icon: TrendingUp },
  { href: "/infraestrutura", label: "Infra", longLabel: "Infraestrutura", icon: Smartphone },
  { href: "/configuracoes", label: "Config", longLabel: "Configurações", icon: Settings },
];

export function isActive(item: NavItem, pathname: string): boolean {
  const matches = (base: string) => (base === "/" ? pathname === "/" : pathname === base || pathname.startsWith(`${base}/`));
  return matches(item.href) || (item.also ?? []).some(matches);
}
