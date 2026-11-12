"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AtSign, Fingerprint, Globe, Search, Smartphone, UserRound, type LucideIcon } from "lucide-react";
import { searchAll, type SearchKind, type SearchResult } from "@/lib/search";
import { useStore } from "@/lib/store";
import { setInfraTab, setSearchOpen, setSelectedCountry, useSearchOpen } from "@/lib/ui-state";
import { Input } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";

const ICONS: Record<SearchKind, LucideIcon> = {
  avatar: UserRound,
  conta: AtSign,
  celular: Smartphone,
  perfil: Fingerprint,
  pais: Globe,
};

const KINDS: Record<SearchKind, string> = {
  avatar: "Avatar",
  conta: "Conta",
  celular: "Celular",
  perfil: "Perfil anti-detect",
  pais: "País",
};

/**
 * A busca global: uma janela só, na moldura do painel. Abre pelo botão "Buscar"
 * (menu lateral, menu "Mais", tela Hoje) ou por Ctrl+K / ⌘K.
 */
export function SearchDialog() {
  const open = useSearchOpen();

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // montada só quando abre: cada busca começa com o campo vazio
  return open ? <SearchPanel onClose={() => setSearchOpen(false)} /> : null;
}

function SearchPanel({ onClose }: { onClose: () => void }) {
  const db = useStore();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const results = useMemo(() => searchAll(db, query), [db, query]);
  const typed = query.trim() !== "";

  /** Antes de ir: abre o lugar certo da tela de destino (qual país, qual aba da Infraestrutura). */
  function prepare(result: SearchResult) {
    if (result.kind === "pais") setSelectedCountry(result.id);
    if (result.kind === "celular") setInfraTab("celulares");
    if (result.kind === "perfil") setInfraTab("perfis");
    onClose();
  }

  return (
    <Modal open onClose={onClose} title="Buscar" description="Avatares, contas (pelo @ ou e-mail), celulares, perfis e países.">
      <form
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          // Enter abre o primeiro resultado
          const first = results[0];
          if (!first) return;
          prepare(first);
          router.push(first.href);
        }}
      >
        <span className="relative block">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="@conta, nome, e-mail, nº do perfil…"
            aria-label="O que você procura?"
            autoFocus
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            enterKeyHint="search"
            className="pl-10"
          />
        </span>
      </form>

      <div className="mt-3 min-h-40" aria-live="polite">
        {!typed ? (
          <p className="px-1 py-6 text-center text-sm leading-relaxed text-muted">
            Digite um @, o nome de um avatar, um e-mail, o número de um perfil, o apelido de um celular…
          </p>
        ) : results.length === 0 ? (
          <p className="px-1 py-6 text-center text-sm leading-relaxed text-muted">
            Nada encontrado para “{query.trim()}”.
          </p>
        ) : (
          <ul className="divide-y divide-line" aria-label="Resultados da busca">
            {results.map((result) => {
              const Icon = ICONS[result.kind];
              return (
                <li key={`${result.kind}:${result.id}`}>
                  <Link
                    href={result.href}
                    onClick={() => prepare(result)}
                    className="flex items-start gap-3 rounded-lg px-1 py-2.5 transition-colors hover:bg-surface-2/60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
                  >
                    <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-muted">
                      <Icon className="size-4" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium leading-snug">{result.title}</span>
                      <span className="block text-sm text-muted">
                        {KINDS[result.kind]}
                        {result.subtitle ? ` · ${result.subtitle}` : ""}
                      </span>
                      {result.match ? <span className="block text-sm text-muted">{result.match}</span> : null}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Modal>
  );
}
