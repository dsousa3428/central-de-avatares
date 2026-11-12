// Gera public/sw.js (o service worker do aplicativo instalável) a partir de
// scripts/sw.template.js, carimbando a hora do build. Cada publicação ganha um
// carimbo novo: é assim que o navegador percebe a versão nova e esvazia os
// arquivos guardados da versão anterior. Roda sozinho antes de "npm run build".
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const template = readFileSync(join(root, "scripts", "sw.template.js"), "utf8");
const stamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
mkdirSync(join(root, "public"), { recursive: true });
writeFileSync(join(root, "public", "sw.js"), template.replace("__BUILD__", stamp));
