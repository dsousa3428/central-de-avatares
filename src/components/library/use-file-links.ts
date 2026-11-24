"use client";

import { useEffect, useMemo, useState } from "react";
import { signLinks } from "@/lib/library-actions";
import type { LibraryItem } from "@/lib/types";

/** Os links valem uma hora; são renovados antes disso, enquanto a tela está aberta. */
const LINK_SECONDS = 60 * 60;
const RENEW_MS = 45 * 60 * 1000;

/**
 * Links temporários para abrir, baixar e mostrar as miniaturas dos arquivos. O
 * bucket é privado: cada link é assinado pelo Supabase e para de funcionar em uma
 * hora. Ficam prontos antes do toque (no iPhone, abrir ou baixar precisa acontecer
 * no próprio toque, sem esperar a internet).
 */
export interface FileLinks {
  links: ReadonlyMap<string, string>;
  /** Arquivos que não estão mais no armazenamento. */
  missing: ReadonlySet<string>;
}

export function useFileLinks(items: readonly LibraryItem[]): FileLinks {
  const paths = useMemo(() => {
    const all = new Set<string>();
    for (const item of items) {
      if (item.file_path) all.add(item.file_path);
      if (item.thumb_path) all.add(item.thumb_path);
    }
    return [...all].sort();
  }, [items]);
  const key = paths.join("\n");
  const [links, setLinks] = useState<{ map: Map<string, string>; at: Map<string, number>; missing: Set<string> }>(() => ({
    map: new Map(),
    at: new Map(),
    missing: new Set(),
  }));
  const [tick, setTick] = useState(0);

  // renova de tempos em tempos, e ao voltar para o app depois de um tempo fora
  useEffect(() => {
    const timer = window.setInterval(() => setTick((n) => n + 1), 5 * 60 * 1000);
    const onVisible = () => {
      if (document.visibilityState === "visible") setTick((n) => n + 1);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  useEffect(() => {
    const wanted = key ? key.split("\n") : [];
    const now = Date.now();
    const missing = wanted.filter((path) => {
      const at = links.at.get(path);
      return at === undefined || now - at > RENEW_MS;
    });
    if (missing.length === 0) return;
    let active = true;
    signLinks(missing, LINK_SECONDS)
      .then((fresh) => {
        if (!active) return;
        setLinks((current) => {
          const map = new Map(current.map);
          const at = new Map(current.at);
          const missing = new Set(current.missing);
          for (const [path, url] of fresh.links) {
            map.set(path, url);
            at.set(path, now);
            missing.delete(path);
          }
          for (const path of fresh.missing) {
            map.delete(path);
            at.set(path, now); // (pergunta de novo só na próxima renovação)
            missing.add(path);
          }
          return { map, at, missing };
        });
      })
      .catch(() => {
        // sem internet agora: os botões de abrir ficam indisponíveis até a próxima tentativa
      });
    return () => {
      active = false;
    };
    // (links fica de fora de propósito: a lista nova chega por aqui mesmo)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, tick]);

  return { links: links.map, missing: links.missing };
}
