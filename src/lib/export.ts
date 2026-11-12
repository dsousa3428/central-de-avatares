// Exportação das tabelas da Planilha: copiar (para colar no Excel / Google
// Planilhas) e baixar em CSV.

/**
 * Excel e Google Planilhas tratam como fórmula qualquer célula que comece com
 * = + - ou @ (um telefone "+39…" ou um "@conta" virariam erro — ou pior, uma
 * fórmula de verdade). Um espaço na frente faz a célula ser lida como texto.
 */
function safeCell(value: string): string {
  const text = value.replace(/[\r\n\t]+/g, " ");
  return /^[=+\-@]/.test(text) ? ` ${text}` : text;
}

/**
 * Texto separado por TAB: é o formato que as planilhas entendem ao colar.
 * Célula com aspas vai entre aspas (com as de dentro dobradas); sem isso, uma
 * anotação começando com " faria a planilha juntar o resto da tabela numa célula só.
 */
export function toTSV(table: string[][]): string {
  const cell = (value: string) => {
    const text = safeCell(value);
    return text.includes('"') ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return table.map((row) => row.map(cell).join("\t")).join("\n");
}

/** CSV com ponto e vírgula (padrão do Excel em português). */
export function toCSV(table: string[][]): string {
  const quote = (value: string) => {
    const text = safeCell(value);
    return /[";]/.test(text) || text !== text.trim() ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return table.map((row) => row.map(quote).join(";")).join("\r\n");
}

/** Faz o navegador baixar um arquivo de texto. */
export function downloadText(filename: string, content: string, mime = "text/csv;charset=utf-8"): void {
  // ﻿ avisa o Excel de que o arquivo está em UTF-8 (acentos corretos)
  const blob = new Blob(["﻿", content], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // dá tempo de sobra para o navegador (iPhone pergunta antes de baixar) pegar o arquivo
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
