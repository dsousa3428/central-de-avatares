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

// A última coisa copiada pelo painel foi uma senha do cofre?
let secretOnClipboard = false;
let clearTimer: ReturnType<typeof setTimeout> | null = null;

/** Por quanto tempo uma senha copiada fica na área de transferência antes de o painel tentar limpá-la. */
export const SECRET_CLIPBOARD_SECONDS = 60;

/** Copia um texto. Devolve true se deu certo. */
export async function copyText(text: string): Promise<boolean> {
  const ok = await write(text);
  if (ok) {
    // esta cópia substituiu o que havia: não há mais senha para limpar
    secretOnClipboard = false;
    if (clearTimer) clearTimeout(clearTimer);
    clearTimer = null;
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
    secretOnClipboard = true;
    if (clearTimer) clearTimeout(clearTimer);
    clearTimer = setTimeout(forgetCopiedSecret, SECRET_CLIPBOARD_SECONDS * 1000);
  }
  return ok;
}

/** Se a última coisa copiada pelo painel foi uma senha, tenta limpá-la da área de transferência. */
export function forgetCopiedSecret(): void {
  if (clearTimer) clearTimeout(clearTimer);
  clearTimer = null;
  if (!secretOnClipboard) return;
  secretOnClipboard = false;
  try {
    void navigator.clipboard?.writeText("").catch(() => {});
  } catch {
    // sem permissão (painel em segundo plano): fica como está
  }
}
