/** Copia um texto. Devolve true se deu certo. */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // tenta o método antigo logo abaixo
  }
  try {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    // dentro de uma janela aberta, o campo precisa estar nela para poder receber o foco
    const host = document.querySelector("dialog[open]") ?? document.body;
    host.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    return ok;
  } catch {
    return false;
  }
}
