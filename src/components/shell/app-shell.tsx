"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Ellipsis, LockKeyhole, LogOut, Search } from "lucide-react";
import { signOut, useAuth } from "@/lib/auth";
import { cn } from "@/lib/format";
import { getStore, loadAll, refreshIfStale } from "@/lib/store";
import { isSupabaseConfigured } from "@/lib/supabase";
import { setSearchOpen } from "@/lib/ui-state";
import { lockVault } from "@/lib/vault";
import { Logo } from "@/components/logo";
import { SearchDialog } from "@/components/search/search-dialog";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { useVault } from "@/components/vault/vault-provider";
import { useWarnings } from "@/components/warnings/use-warnings";
import { isActive, NAV_ITEMS } from "./nav-items";
import { usePanelPhase } from "./panel-phase";

/**
 * Moldura das telas internas: confere o login, dispara o carregamento dos dados
 * e desenha a navegação (barra embaixo no celular, menu lateral no computador).
 *
 * O conteúdo da página é sempre renderizado aqui dentro; quem decide o que
 * aparece antes de tudo estar pronto é o <ScreenGate> de cada página.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const auth = useAuth();
  const router = useRouter();
  const { phase, userId, email } = usePanelPhase();
  const pathname = usePathname();
  // a planilha precisa de espaço: usa a largura toda, sem a coluna central estreita
  const wide = pathname === "/planilha";

  // Sem login -> tela de entrada.
  useEffect(() => {
    if (isSupabaseConfigured && auth.status === "signed_out") router.replace("/login");
  }, [auth.status, router]);

  // Com login -> carrega os dados (uma vez por usuário).
  useEffect(() => {
    if (!userId) return;
    const current = getStore();
    if (current.userId !== userId || current.status === "idle") void loadAll(userId);
  }, [userId]);

  // Ao voltar para o app (trocar de aba, desbloquear o celular), busca novidades.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") refreshIfStale();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, []);

  if (phase !== "ready") return <>{children}</>;

  return (
    <div className="min-h-dvh md:pl-64">
      <Navigation email={email} />
      <main
        className={cn(
          "mx-auto w-full px-4 pb-[calc(96px+env(safe-area-inset-bottom))] pt-5 md:px-8 md:pb-16 md:pt-8",
          wide ? "max-w-none" : "max-w-5xl",
        )}
      >
        {children}
      </main>
    </div>
  );
}

/**
 * Os dois menus (lateral no computador, barra embaixo no celular), com o número de
 * avisos em aberto ao lado de "Hoje". Fica num componente à parte porque os avisos
 * dependem da data de hoje — e ler a data só é permitido no que é desenhado com os
 * dados prontos (nunca na parte da moldura que o Next.js pré-renderiza).
 */
function Navigation({ email }: { email: string | null }) {
  const { attention } = useWarnings();
  return (
    <>
      <Sidebar email={email} attention={attention} />
      <BottomNav attention={attention} />
      <SearchDialog />
    </>
  );
}

/** "Trancar cofre": só aparece enquanto o cofre de senhas está aberto. */
function LockVaultButton({
  className,
  iconClass,
  onDone,
  listItem,
}: {
  className: string;
  iconClass: string;
  onDone?: () => void;
  /** Embrulha o botão num <li> (para listas de menu). */
  listItem?: boolean;
}) {
  const vault = useVault();
  const toast = useToast();
  if (!vault.unlocked) return null;
  const button = (
    <button
      type="button"
      onClick={() => {
        lockVault({ everywhere: true });
        toast.info("Cofre trancado");
        onDone?.();
      }}
      className={className}
    >
      <LockKeyhole className={iconClass} aria-hidden />
      Trancar cofre
    </button>
  );
  return listItem ? <li>{button}</li> : button;
}

/** O número de avisos em aberto, ao lado de "Hoje" (é lá que eles ficam). Só o desenho: quem lê é o NavBadgeText. */
function NavBadge({ count, className }: { count: number; className?: string }) {
  if (count <= 0) return null;
  return (
    <span
      aria-hidden
      className={cn(
        "flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1.5 text-[11px] font-semibold leading-none text-white",
        className,
      )}
    >
      {count > 9 ? "9+" : count}
    </span>
  );
}

/** O mesmo número, por extenso, para leitores de tela — sempre depois do nome do item ("Hoje (3 avisos)"). */
function NavBadgeText({ count }: { count: number }) {
  if (count <= 0) return null;
  return <span className="sr-only">{count === 1 ? " (1 aviso)" : ` (${count} avisos)`}</span>;
}

function Sidebar({ email, attention }: { email: string | null; attention: number }) {
  const pathname = usePathname();
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-line bg-surface md:flex">
      <div className="flex items-center gap-3 px-5 pb-4 pt-6">
        <Logo />
        <div className="leading-tight">
          <p className="font-semibold">Central de Avatares</p>
          <p className="text-xs text-muted">Painel privado</p>
        </div>
      </div>
      <div className="px-3 pb-1">
        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          className="flex h-10 w-full items-center gap-2.5 rounded-xl border border-line bg-surface-2/60 px-3 text-sm text-muted transition-colors hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <Search className="size-4" aria-hidden />
          <span className="flex-1 text-left">Buscar</span>
          <kbd className="rounded border border-line bg-surface px-1.5 py-0.5 font-sans text-[11px] leading-none" aria-hidden>
            Ctrl K
          </kbd>
        </button>
      </div>
      <nav className="flex-1 space-y-1 px-3 py-2" aria-label="Menu principal">
        {NAV_ITEMS.map((item) => {
          const active = isActive(item, pathname);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex h-11 items-center gap-3 rounded-xl px-3 text-[15px] font-medium transition-colors",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                active ? "bg-primary-soft text-primary-soft-fg" : "text-muted hover:bg-surface-2 hover:text-fg",
              )}
            >
              <Icon className="size-5" aria-hidden />
              {item.longLabel}
              {item.href === "/" ? (
                <>
                  <NavBadgeText count={attention} />
                  <NavBadge count={attention} className="ml-auto" />
                </>
              ) : null}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-line p-3">
        {email ? <p className="truncate px-3 pb-2 text-xs text-muted">{email}</p> : null}
        <LockVaultButton
          iconClass="size-4"
          className="flex h-10 w-full items-center gap-3 rounded-xl px-3 text-sm font-medium text-muted transition-colors hover:bg-surface-2 hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        />
        <button
          type="button"
          onClick={() => void signOut()}
          className="flex h-10 w-full items-center gap-3 rounded-xl px-3 text-sm font-medium text-muted transition-colors hover:bg-surface-2 hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <LogOut className="size-4" aria-hidden />
          Sair
        </button>
      </div>
    </aside>
  );
}

function BottomNav({ attention }: { attention: number }) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const barItems = NAV_ITEMS.filter((item) => item.mobile === "bar");
  const moreItems = NAV_ITEMS.filter((item) => item.mobile === "more");
  const moreActive = moreItems.some((item) => isActive(item, pathname));

  const itemClass = (active: boolean) =>
    cn(
      "flex h-16 w-full flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors",
      "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
      active ? "text-primary" : "text-muted",
    );
  const pillClass = (active: boolean) =>
    cn(
      "relative flex h-7 w-12 items-center justify-center rounded-full transition-colors",
      active && "bg-primary-soft text-primary-soft-fg",
    );

  return (
    <>
      <nav
        aria-label="Menu principal"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
      >
        <ul className="mx-auto flex max-w-lg">
          {barItems.map((item) => {
            const active = isActive(item, pathname);
            const Icon = item.icon;
            return (
              <li key={item.href} className="flex-1">
                <Link href={item.href} aria-current={active ? "page" : undefined} className={itemClass(active)}>
                  <span className={pillClass(active)}>
                    <Icon className="size-5" aria-hidden />
                    {item.href === "/" ? <NavBadge count={attention} className="absolute -right-1.5 -top-1.5" /> : null}
                  </span>
                  {item.label}
                  {item.href === "/" ? <NavBadgeText count={attention} /> : null}
                </Link>
              </li>
            );
          })}
          <li className="flex-1">
            <button
              type="button"
              onClick={() => setMoreOpen(true)}
              aria-haspopup="dialog"
              aria-current={moreActive ? "page" : undefined}
              className={itemClass(moreActive)}
            >
              <span className={pillClass(moreActive)}>
                <Ellipsis className="size-5" aria-hidden />
              </span>
              Mais
            </button>
          </li>
        </ul>
      </nav>

      <Modal open={moreOpen} onClose={() => setMoreOpen(false)} title="Mais" size="sm">
        <ul className="-mx-2 space-y-1">
          <li>
            <button
              type="button"
              onClick={() => {
                setMoreOpen(false);
                setSearchOpen(true);
              }}
              className="flex h-12 w-full items-center gap-3 rounded-xl px-3 text-[15px] font-medium transition-colors hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <Search className="size-5" aria-hidden />
              Buscar
            </button>
          </li>
          {moreItems.map((item) => {
            const active = isActive(item, pathname);
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={() => setMoreOpen(false)}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex h-12 items-center gap-3 rounded-xl px-3 text-[15px] font-medium transition-colors",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                    active ? "bg-primary-soft text-primary-soft-fg" : "hover:bg-surface-2",
                  )}
                >
                  <Icon className="size-5" aria-hidden />
                  {item.longLabel}
                </Link>
              </li>
            );
          })}
          <LockVaultButton
            listItem
            iconClass="size-5"
            onDone={() => setMoreOpen(false)}
            className="flex h-12 w-full items-center gap-3 rounded-xl px-3 text-[15px] font-medium transition-colors hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          />
          <li>
            <button
              type="button"
              onClick={() => void signOut()}
              className="flex h-12 w-full items-center gap-3 rounded-xl px-3 text-[15px] font-medium text-muted transition-colors hover:bg-surface-2 hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <LogOut className="size-5" aria-hidden />
              Sair
            </button>
          </li>
        </ul>
      </Modal>
    </>
  );
}
