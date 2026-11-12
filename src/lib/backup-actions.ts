"use client";

// Backup: baixar e restaurar (as regras ficam em ./backup e ./backup-sheets).

import { backupFileName, buildBackup, type BackupFile } from "./backup";
import { buildSheets, sheetsReadme } from "./backup-sheets";
import { downloadBlob, toCSV } from "./export";
import { getStore, restoreBackup as restoreInDatabase } from "./store";
import { lockVault } from "./vault";
import { zipStore } from "./zip";

function saveJson(name: string, file: BackupFile): void {
  downloadBlob(name, new Blob([JSON.stringify(file, null, 2)], { type: "application/json" }));
}

/** Baixa o backup completo (o arquivo .json que serve para restaurar). */
export function downloadBackup(now = new Date()): string {
  const name = backupFileName(now, "json");
  saveJson(name, buildBackup(getStore(), now));
  return name;
}

/** Baixa as planilhas (um .zip com um CSV por tabela), para abrir no Excel. */
export function downloadSheets(now = new Date()): string {
  const two = (n: number) => String(n).padStart(2, "0");
  const when = `${two(now.getDate())}/${two(now.getMonth() + 1)}/${now.getFullYear()} às ${two(now.getHours())}:${two(now.getMinutes())}`;
  const bytes = zipStore(
    [
      { name: "LEIA-ME.txt", data: sheetsReadme(when) },
      // ﻿ na frente avisa o Excel de que o arquivo está em UTF-8 (acentos corretos)
      ...buildSheets(getStore()).map((sheet) => ({ name: `${sheet.name}.csv`, data: `﻿${toCSV(sheet.table)}` })),
    ],
    now,
  );
  const name = backupFileName(now, "zip", "central-de-avatares-planilhas");
  downloadBlob(name, new Blob([bytes as BlobPart], { type: "application/zip" }));
  return name;
}

/**
 * Restaura um backup: troca tudo que está no painel pelo conteúdo do arquivo.
 * Antes de mexer em qualquer coisa, baixa um backup do que está no painel agora
 * (se a restauração foi um engano, é só restaurar esse arquivo).
 */
export async function restoreBackup(file: BackupFile, now = new Date()): Promise<void> {
  saveJson(backupFileName(now, "json", "central-de-avatares-antes-de-restaurar"), buildBackup(getStore(), now));
  // o cofre do arquivo pode ser outro: nada decifrado fica na memória
  lockVault({ everywhere: true });
  await restoreInDatabase({ app: file.app, format: file.format, tables: file.tables, settings: file.settings });
}
