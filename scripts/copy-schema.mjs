// Copia o script do banco para a pasta pública, para o painel poder oferecer
// o botão "Copiar script SQL" na tela de preparação do banco.
// Roda sozinho antes de "npm run dev" e "npm run build".
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
mkdirSync(join(root, "public"), { recursive: true });
copyFileSync(join(root, "supabase", "schema.sql"), join(root, "public", "schema.sql"));
