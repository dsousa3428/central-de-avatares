// Arquivos e prompts: tipos, nomes de arquivo, busca e filtros — e o lugar deles no backup.
import assert from "node:assert/strict";
import { test } from "node:test";
import { backupCounts, backupFiles, buildBackup, parseBackup } from "../../src/lib/backup.ts";
import { buildSheets } from "../../src/lib/backup-sheets.ts";
import {
  canMakeThumbnail,
  categoryLabel,
  categoryOfFile,
  downloadUrl,
  fileKind,
  fileProblem,
  filterLibrary,
  formatBytes,
  isFiltering,
  libraryUsage,
  MAX_FILE_BYTES,
  NO_FILTER,
  readCategory,
  safeFileName,
  storagePath,
  thumbnailPath,
  titleFromFileName,
} from "../../src/lib/library.ts";

const item = (id, extra = {}) => ({
  id, user_id: "u1", avatar_id: null, title: id, category: "outro", content: null, notes: null,
  file_path: null, thumb_path: null, file_name: null, file_size: null, file_type: null,
  is_example: false, created_at: "2026-11-20T10:00:00Z", updated_at: "2026-11-20T10:00:00Z", ...extra,
});

test("tipos: o que não é conhecido vira “outro”", () => {
  assert.equal(readCategory("video"), "video");
  for (const bad of [null, undefined, "", "Vídeo", "foto", 3]) assert.equal(readCategory(bad), "outro");
  assert.equal(categoryLabel("video"), "Vídeo");
  assert.equal(categoryLabel("qualquer"), "Outro");
});

test("arquivos: o tipo vem do aparelho ou, se ele não disser, da extensão", () => {
  assert.equal(fileKind("image/png", "a.png"), "image");
  assert.equal(fileKind("", "Foto.HEIC"), "image"); // o iPhone às vezes não informa o tipo
  assert.equal(fileKind("application/octet-stream", "video.MOV"), "video");
  assert.equal(fileKind("audio/mpeg", "voz.mp3"), "audio");
  assert.equal(fileKind("application/pdf", "ebook"), "pdf");
  assert.equal(fileKind("", "roteiro.docx"), "text");
  assert.equal(fileKind("", "pacote.zip"), "archive");
  assert.equal(fileKind("", "sem-extensao"), "other");
  // o tipo sugerido para o item
  assert.deepEqual(
    ["a.jpg", "b.mp4", "c.m4a", "d.pdf", "e.txt", "f.zip"].map((name) => categoryOfFile("", name)),
    ["imagem", "video", "voz", "texto", "texto", "outro"],
  );
  // miniatura: só de imagem que o navegador desenha (SVG fica de fora)
  assert.equal(canMakeThumbnail("image/jpeg", "a.jpg"), true);
  assert.equal(canMakeThumbnail("image/svg+xml", "logo.svg"), false);
  assert.equal(canMakeThumbnail("", "logo.svg"), false);
  assert.equal(canMakeThumbnail("application/pdf", "a.pdf"), false);
});

test("tamanhos, e o limite de 50 MB por arquivo", () => {
  assert.equal(formatBytes(17), "17 B");
  assert.equal(formatBytes(166992), "163 KB");
  assert.equal(formatBytes(2.4 * 1024 * 1024), "2,4 MB");
  assert.equal(formatBytes(1024 ** 3), "1 GB");
  assert.equal(formatBytes(null), "");
  assert.equal(fileProblem({ size: 0, name: "vazio.txt" }), "O arquivo está vazio.");
  assert.equal(fileProblem({ size: MAX_FILE_BYTES, name: "no-limite.mp4" }), null);
  assert.equal(fileProblem({ size: MAX_FILE_BYTES + 1, name: "grande.mp4" }), "O arquivo tem 50 MB: o limite é 50 MB por arquivo (plano gratuito do Supabase).");
  assert.match(fileProblem({ size: 80 * 1024 * 1024, name: "grande.mp4" }), /^O arquivo tem 80 MB/);
});

test("nomes no armazenamento: sem acento nem espaço; o nome original fica no item", () => {
  assert.equal(safeFileName("referência do rosto.png"), "referencia-do-rosto.png");
  assert.equal(safeFileName("  Ebook 7 receitas (versão final).PDF "), "Ebook-7-receitas-versao-final.pdf");
  assert.equal(safeFileName("../../etc/passwd"), "etc-passwd");
  assert.equal(safeFileName("😀😀.jpg"), "arquivo.jpg");
  assert.equal(safeFileName(""), "arquivo");
  assert.equal(safeFileName(`${"a".repeat(200)}.mp4`), `${"a".repeat(80)}.mp4`);
  // a pasta de cada um começa pelo id do usuário (é o que a regra do banco confere)
  assert.equal(storagePath("u1", "i1", "abc", "Foto 1.png"), "u1/i1/abc-Foto-1.png");
  assert.equal(thumbnailPath("u1", "i1", "abc"), "u1/i1/abc-miniatura.jpg");
  assert.equal(titleFromFileName("Rosto do frade.png"), "Rosto do frade");
  assert.equal(titleFromFileName("sem-extensao"), "sem-extensao");
  assert.equal(titleFromFileName(".png"), ".png");
  assert.equal(titleFromFileName(""), "Arquivo");
});

test("o link de download leva o nome original", () => {
  assert.equal(downloadUrl("https://x.supabase.co/storage/v1/object/sign/arquivos/u/i/a.pdf?token=abc", "Ebook 7 receitas.pdf"), "https://x.supabase.co/storage/v1/object/sign/arquivos/u/i/a.pdf?token=abc&download=Ebook%207%20receitas.pdf");
  assert.equal(downloadUrl("https://x/a?token=t", null), "https://x/a?token=t&download=");
});

test("busca e filtros", () => {
  const items = [
    item("p1", { title: "Rosto do Fra' Salvio", category: "imagem", content: "Retrato de um frade, barba branca", avatar_id: "a1" }),
    item("f1", { title: "Ebook", category: "texto", file_path: "u/f1/x.pdf", file_name: "Ebook 7 receitas.pdf", file_size: 2048 }),
    item("pf", { title: "Cena na horta", category: "video", content: "frade colhendo ervas", file_path: "u/pf/v.mp4", file_name: "horta.mp4", file_size: 4096, avatar_id: "a2", notes: "Kling 2.1" }),
  ];
  const names = { a1: "Fra' Salvio", a2: "Nonna Maria" };
  const run = (filter) => filterLibrary(items, { ...NO_FILTER, ...filter }, (id) => names[id]).map((entry) => entry.id);
  assert.deepEqual(run({}), ["p1", "f1", "pf"]);
  assert.deepEqual(run({ show: "prompts" }), ["p1", "pf"]); // prompt com arquivo entra nos dois
  assert.deepEqual(run({ show: "arquivos" }), ["f1", "pf"]);
  assert.deepEqual(run({ avatar: "geral" }), ["f1"]);
  assert.deepEqual(run({ avatar: "a2" }), ["pf"]);
  assert.deepEqual(run({ category: "imagem" }), ["p1"]);
  assert.deepEqual(run({ query: "FRADE" }), ["p1", "pf"]); // sem diferença de maiúsculas
  assert.deepEqual(run({ query: "receitas" }), ["f1"]); // nome do arquivo
  assert.deepEqual(run({ query: "kling" }), ["pf"]); // anotações
  assert.deepEqual(run({ query: "nonna" }), ["pf"]); // nome do avatar
  assert.deepEqual(run({ query: "salvio rosto" }), ["p1"]); // todas as palavras, em qualquer ordem
  assert.deepEqual(run({ query: "fra salvio" }), ["p1"]); // (o apóstrofo não atrapalha: "fra'" contém "fra")
  assert.deepEqual(run({ query: "video" }), ["pf"]); // o tipo, sem acento
  assert.deepEqual(run({ query: "geral" }), ["f1"]);
  assert.deepEqual(run({ query: "nada disso" }), []);
  assert.deepEqual(run({ show: "prompts", avatar: "a1", query: "barba" }), ["p1"]);
  assert.equal(isFiltering(NO_FILTER), false);
  assert.equal(isFiltering({ ...NO_FILTER, query: "  " }), false);
  assert.equal(isFiltering({ ...NO_FILTER, category: "voz" }), true);
  assert.deepEqual(libraryUsage(items), { prompts: 2, files: 2, bytes: 6144 });
});

// --- backup ---

const baseDb = (extra = {}) => ({
  countries: [{ id: "11111111-1111-4111-8111-111111111111", user_id: "u1", name: "Itália", position: 0 }],
  avatars: [{ id: "22222222-2222-4222-8222-222222222222", user_id: "u1", country_id: "11111111-1111-4111-8111-111111111111", name: "Fra' Salvio", extra_links: [], model_videos: [], reference_profiles: [], kit: {} }],
  accounts: [], phones: [], profiles: [], warmups: [], sales: [], activity: [], settings: null,
  library: [
    item("33333333-3333-4333-8333-333333333333", { title: "Rosto", content: "frade", avatar_id: "22222222-2222-4222-8222-222222222222" }),
    item("44444444-4444-4444-8444-444444444444", { title: "Ebook", file_path: "u1/x/e.pdf", file_name: "Ebook.pdf", file_size: 10 }),
  ],
  libraryReady: true,
  ...extra,
});

test("backup: leva os arquivos e prompts (sem o dono da linha), e só se o banco já os tem", () => {
  const file = buildBackup(baseDb(), new Date("2026-11-24T12:00:00Z"));
  assert.equal(file.tables.library_items.length, 2);
  assert.equal("user_id" in file.tables.library_items[0], false);
  assert.equal(backupCounts(file).library_items, 2);
  assert.equal(backupFiles(file), 1);
  // banco sem a tabela nova: o backup não leva a lista (e restaurá-lo não mexe em nada lá)
  const old = buildBackup(baseDb({ library: [], libraryReady: false }), new Date());
  assert.equal("library_items" in old.tables, false);
  assert.equal(backupCounts(old).library_items, 0);
  assert.equal(backupFiles(old), 0);
});

test("backup: arquivo antigo, sem a lista, continua valendo; item que cita avatar que não veio é recusado", () => {
  const file = buildBackup(baseDb(), new Date());
  const text = (tables) => JSON.stringify({ ...file, tables });
  const { library_items: _drop, ...withoutLibrary } = file.tables;
  const parsed = parseBackup(text(withoutLibrary));
  assert.equal(parsed.tables.library_items, undefined); // a restauração deixa os itens de agora como estão
  assert.equal(parseBackup(text(file.tables)).tables.library_items.length, 2);
  assert.throws(() => parseBackup(text({ ...file.tables, library_items: "não é lista" })), /falta a tabela “library_items”/);
  const orphan = { ...file.tables, library_items: [{ ...file.tables.library_items[0], avatar_id: "55555555-5555-4555-8555-555555555555" }] };
  assert.throws(() => parseBackup(text(orphan)), /a tabela “library_items” cita um item de “avatars” que não veio no arquivo/);
});

test("planilhas do backup: arquivos e prompts, só quando o banco já os tem", () => {
  const sheet = buildSheets(baseDb()).find((entry) => entry.name === "arquivos-e-prompts");
  assert.deepEqual(sheet.table, [
    ["Título", "Avatar", "Tipo", "Prompt", "Arquivo", "Tamanho", "Anotações", "Criado em"],
    ["Rosto", "Fra' Salvio", "Outro", "frade", "", "", "", "20/11/2026"],
    ["Ebook", "Geral", "Outro", "", "Ebook.pdf", "10 B", "", "20/11/2026"],
  ]);
  assert.equal(buildSheets(baseDb({ library: [], libraryReady: false })).some((entry) => entry.name === "arquivos-e-prompts"), false);
});
