async function write(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // tenta o método antigo logo abaixo
  }
  const area = document.createElement("textarea");
  try {
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    // dentro de uma janela aberta, o campo precisa estar nela para poder receber o foco
    const host = document.querySelector("dialog[open]") ?? document.body;
    host.appendChild(area);
    area.select();
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    // o campo auxiliar (com o texto copiado dentro) nunca fica na página, nem se a cópia falhar
    area.value = "";
    area.remove();
  }
}

// A última coisa copiada pelo painel foi uma senha do cofre? (guarda só a hora da cópia, nunca o texto)
let secretCopiedAt: number | null = null;
let clearTimer: ReturnType<typeof setTimeout> | null = null;

/** Por quanto tempo uma senha copiada fica na área de transferência antes de o painel tentar limpá-la. */
export const SECRET_CLIPBOARD_SECONDS = 60;
/**
 * O navegador só deixa limpar com o painel aberto na frente. Se na hora ele estava em segundo
 * plano, o painel tenta de novo ao voltar — mas só até este prazo depois da cópia: mais tarde
 * que isso você provavelmente já copiou outra coisa, e não cabe ao painel apagá-la.
 */
const RETRY_UNTIL_SECONDS = 5 * 60;

function stopWatching() {
  if (clearTimer) clearTimeout(clearTimer);
  clearTimer = null;
  window.removeEventListener("focus", retryOnReturn);
  document.removeEventListener("visibilitychange", retryOnReturn);
}

function retryOnReturn() {
  if (document.visibilityState === "visible") forgetCopiedSecret();
}

/** Copia um texto. Devolve true se deu certo. */
export async function copyText(text: string): Promise<boolean> {
  const ok = await write(text);
  if (ok) {
    // esta cópia substituiu o que havia: não há mais senha para limpar
    secretCopiedAt = null;
    stopWatching();
  }
  return ok;
}

/**
 * Copia uma senha do cofre. Depois de um minuto — ou quando o cofre trancar — o
 * painel tenta tirar a senha da área de transferência. É "tenta" mesmo: o
 * navegador só deixa quando o painel está aberto na frente.
 */
export async function copySecret(text: string): Promise<boolean> {
  const ok = await write(text);
  if (ok) {
    stopWatching();
    secretCopiedAt = Date.now();
    clearTimer = setTimeout(forgetCopiedSecret, SECRET_CLIPBOARD_SECONDS * 1000);
  }
  return ok;
}

/** Se a última coisa copiada pelo painel foi uma senha, tenta limpá-la da área de transferência. */
export function forgetCopiedSecret(): void {
  if (typeof window === "undefined") return;
  stopWatching();
  if (secretCopiedAt === null) return;
  const age = Date.now() - secretCopiedAt;
  if (age < 0 || age > RETRY_UNTIL_SECONDS * 1000) {
    secretCopiedAt = null; // passou do prazo: não mexe mais na área de transferência
    return;
  }
  const done = () => {
    secretCopiedAt = null;
  };
  const later = () => {
    // sem permissão agora (painel em segundo plano): tenta de novo quando ele voltar para a frente
    if (secretCopiedAt === null) return;
    window.addEventListener("focus", retryOnReturn);
    document.addEventListener("visibilitychange", retryOnReturn);
  };
  try {
    if (!navigator.clipboard) return done();
    navigator.clipboard.writeText("").then(done, later);
  } catch {
    later();
  }
}
