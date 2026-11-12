"use client";

import { useEffect, useRef } from "react";
import { lockMinutesOf } from "@/lib/vault";
import { useStore } from "@/lib/store";
import { useToast } from "@/components/ui/toast";

/**
 * Fecha uma janela onde a senha-mestra foi digitada se ela ficar esquecida
 * aberta: depois do mesmo tempo sem uso que tranca o cofre, o que foi digitado
 * é jogado fora. (Sem isso, uma senha-mestra digitada e não enviada continuaria
 * na tela, a um toque do botão de mostrar, mesmo com o cofre já trancado.)
 */
export function useCloseWhenIdle(onClose: () => void): void {
  const db = useStore();
  const toast = useToast();
  const minutes = lockMinutesOf(db.settings);
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  }, [onClose]);

  useEffect(() => {
    let last = Date.now();
    let done = false;
    const expired = () => {
      const elapsed = Date.now() - last;
      return elapsed < 0 || elapsed >= minutes * 60_000;
    };
    const finish = () => {
      if (done) return;
      done = true;
      toast.info("Janela fechada por falta de uso");
      close.current();
    };
    const check = () => {
      if (expired()) finish();
    };
    // o primeiro toque depois do prazo fecha, em vez de renovar o prazo
    const onActivity = () => {
      if (expired()) finish();
      else last = Date.now();
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") check();
    };
    const options = { capture: true, passive: true } as const;
    window.addEventListener("pointerdown", onActivity, options);
    window.addEventListener("keydown", onActivity, options);
    window.addEventListener("pageshow", check);
    document.addEventListener("visibilitychange", onVisibility);
    const timer = window.setInterval(check, 5000);
    return () => {
      window.removeEventListener("pointerdown", onActivity, options);
      window.removeEventListener("keydown", onActivity, options);
      window.removeEventListener("pageshow", check);
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearInterval(timer);
    };
  }, [minutes, toast]);
}
