// Etapa (f): busca global, backup (exportar/restaurar) e o .zip das planilhas.
import assert from "node:assert/strict";
import { test } from "node:test";
import { BACKUP_APP, BACKUP_FORMAT, backupCounts, backupFileName, backupSecrets, buildBackup, parseBackup } from "../../src/lib/backup.ts";
import { foldText, searchAll } from "../../src/lib/search.ts";
import { crc32, zipStore } from "../../src/lib/zip.ts";

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const db = () => ({
  countries: [
    { id: id(1), user_id: "u", name: "Itália", flag: "🇮🇹", language: "Italiano", currency: "EUR", warmup_tags: ["#benessere", "cucina tradizionale"], position: 0 },
    { id: id(2), user_id: "u", name: "Espanha", flag: "🇪🇸", language: "Espanhol", currency: "EUR", warmup_tags: [], position: 1 },
  ],
  phones: [{ id: id(10), user_id: "u", nickname: "Celular A", model: "Samsung Galaxy A15", number: "+39 351 000 0001", notes: null }],
  profiles: [
    { id: id(20), user_id: "u", number: "101", name: "Fra' Salvio IT — 1ª conta", proxy: "it-res-01.exemplo.net:8000", notes: null },
    { id: id(21), user_id: "u", number: "1010", name: null, proxy: null, notes: null },
  ],
  avatars: [
    { id: id(30), user_id: "u", country_id: id(1), name: "Fra' Salvio", niche: "Remédios naturais", product_name: "Il Ricettario", notes: "Avatar de exemplo", status: "ativo" },
    { id: id(31), user_id: "u", country_id: id(2), name: "Abuela Carmen", niche: "Receitas caseiras", product_name: null, notes: null, status: "ativo" },
    { id: id(32), user_id: "u", country_id: id(2), name: "José Ação", niche: null, product_name: null, notes: null, status: "pausado" },
  ],
  accounts: [
    { id: id(40), user_id: "u", avatar_id: id(30), generation: 1, handle: "fra.salvio", email: "frasalvio.conta1@exemplo.com", proxy: "it-res-01.exemplo.net:8000", status: "caida", fall_reason: "Denúncias", notes: null, phone_id: id(10), profile_id: id(20), secrets_enc: "v1.abc.def" },
    { id: id(41), user_id: "u", avatar_id: id(30), generation: 2, handle: "fra.salvio", email: "frasalvio.conta2@exemplo.com", proxy: null, status: "aquecendo", fall_reason: null, notes: null, phone_id: null, profile_id: null, secrets_enc: null },
    { id: id(42), user_id: "u", avatar_id: id(31), generation: 1, handle: "abuela.carmen", email: null, proxy: null, status: "ativa", fall_reason: null, notes: null, phone_id: null, profile_id: null, secrets_enc: null },
  ],
  warmups: [{ id: id(50), user_id: "u", account_id: id(41), start_date: "2026-11-08", total_days: 10, days: [] }],
  sales: [{ id: id(60), user_id: "u", avatar_id: id(30), account_id: id(41), week_start: "2026-11-02", amount: 216, currency: "EUR" }],
  activity: [{ id: id(70), user_id: "u", avatar_id: id(30), account_id: id(40), kind: "caiu", message: "Conta caiu" }],
  settings: { user_id: "u", vault: { v: 1, salt: "s", check: "c" }, warmup_defaults: null, brl_rates: { EUR: 6.1 }, prefs: { examples_version: 4 } },
});

// --- busca -------------------------------------------------------------------

test("busca: ignora acentos e maiúsculas", () => {
  assert.equal(foldText("  José AÇÃO  "), "jose acao");
  assert.deepEqual(searchAll(db(), "jose acao").map((r) => r.title), ["José Ação"]);
  assert.deepEqual(searchAll(db(), "ITALIA").map((r) => r.title), ["🇮🇹 Itália"]);
  assert.deepEqual(searchAll(db(), "   "), []);
});

test("busca: por @, por avatar, por e-mail e por número de perfil", () => {
  const handles = searchAll(db(), "@fra.salvio");
  assert.deepEqual(handles.map((r) => `${r.kind}:${r.subtitle}`), [
    "conta:Fra' Salvio · 2ª geração",
    "conta:Fra' Salvio · 1ª geração · caída",
  ]);
  // a conta atual abre na aba dela; a que caiu, no histórico
  assert.match(handles[0].href, /aba=conta$/);
  assert.match(handles[1].href, /aba=historico$/);

  const avatar = searchAll(db(), "salvio");
  assert.equal(avatar[0].kind, "avatar"); // o avatar vem antes das contas dele
  assert.equal(avatar[0].title, "Fra' Salvio");
  assert.equal(avatar[0].href, `/avatar?id=${id(30)}`);

  const email = searchAll(db(), "conta1@exemplo");
  assert.equal(email.length, 1);
  assert.equal(email[0].title, "@fra.salvio");
  assert.equal(email[0].match, "e-mail: frasalvio.conta1@exemplo.com");

  const profile = searchAll(db(), "101");
  assert.deepEqual(profile.slice(0, 2).map((r) => r.title), ["Perfil 101 — Fra' Salvio IT — 1ª conta", "Perfil 1010"]); // o número exato vem antes
  assert.equal(profile[0].kind, "perfil");
});

test("busca: várias palavras precisam todas aparecer; proxy, celular e tags também são achados", () => {
  assert.deepEqual(searchAll(db(), "abuela receitas").map((r) => r.title), ["Abuela Carmen"]);
  assert.deepEqual(searchAll(db(), "abuela remédios"), []);
  assert.ok(searchAll(db(), "it-res-01").some((r) => r.kind === "perfil"));
  assert.ok(searchAll(db(), "it-res-01").some((r) => r.kind === "conta" && r.match === "proxy: it-res-01.exemplo.net:8000"));
  assert.deepEqual(searchAll(db(), "galaxy").map((r) => r.title), ["Celular A (Samsung Galaxy A15)"]);
  assert.deepEqual(searchAll(db(), "benessere").map((r) => `${r.title}|${r.match}`), ["🇮🇹 Itália|tag: #benessere cucina tradizionale"]);
  // o cofre nunca entra na busca
  assert.deepEqual(searchAll(db(), "v1.abc"), []);
  assert.equal(searchAll(db(), "a", 2).length, 2); // respeita o limite
});

// --- backup ------------------------------------------------------------------

test("backup: leva todas as tabelas, sem o dono, e as configurações (com o cofre cifrado)", () => {
  const file = buildBackup(db(), new Date("2026-11-12T14:32:00Z"));
  assert.equal(file.app, BACKUP_APP);
  assert.equal(file.format, BACKUP_FORMAT);
  assert.equal(file.exported_at, "2026-11-12T14:32:00.000Z");
  assert.deepEqual(backupCounts(file), { countries: 2, phones: 1, antidetect_profiles: 2, avatars: 3, accounts: 3, warmups: 1, weekly_sales: 1, activity_log: 1 });
  assert.ok(Object.values(file.tables).every((rows) => rows.every((row) => !("user_id" in row))));
  assert.equal(file.tables.accounts[0].id, id(40)); // os ids são mantidos: o bloco cifrado só abre com o id da conta
  assert.equal(file.tables.accounts[0].secrets_enc, "v1.abc.def");
  assert.deepEqual(file.settings, { vault: { v: 1, salt: "s", check: "c" }, warmup_defaults: null, brl_rates: { EUR: 6.1 }, prefs: { examples_version: 4 } });
  assert.equal(backupSecrets(file), 1);
  assert.equal(backupFileName(new Date(2026, 10, 12, 9, 5), "json"), "central-de-avatares-2026-11-12-0905.json");
});

test("backup: o que foi exportado é lido de volta igual", () => {
  const file = buildBackup(db(), new Date("2026-11-12T14:32:00Z"));
  assert.deepEqual(parseBackup(JSON.stringify(file)), file);
  assert.deepEqual(parseBackup("﻿" + JSON.stringify(file, null, 2)), file); // com a marca de UTF-8 na frente e indentado
});

test("backup: arquivo errado, de outra versão ou danificado é recusado com uma explicação", () => {
  const good = () => buildBackup(db(), new Date("2026-11-12T14:32:00Z"));
  const refused = (change, pattern) => {
    const file = good();
    change(file);
    assert.throws(() => parseBackup(JSON.stringify(file)), pattern);
  };
  assert.throws(() => parseBackup("isto não é json"), /não é um backup do painel/);
  assert.throws(() => parseBackup(JSON.stringify({ app: "outro" })), /não é um backup da Central de Avatares/);
  assert.throws(() => parseBackup(JSON.stringify([1, 2])), /não é um backup da Central de Avatares/);
  refused((f) => (f.format = BACKUP_FORMAT + 1), /versão mais nova do painel/);
  refused((f) => delete f.tables.warmups, /falta a tabela “warmups”/);
  refused((f) => (f.tables.accounts[0].id = "123"), /linha sem identificação na tabela “accounts”/);
  refused((f) => f.tables.avatars.push({ ...f.tables.avatars[0] }), /linha repetida na tabela “avatars”/);
  refused((f) => f.tables.avatars.shift(), /a tabela “accounts” cita um item de “avatars” que não veio/);
  refused((f) => (f.tables.accounts[1].phone_id = id(999)), /a tabela “accounts” cita um item de “phones” que não veio/);
  refused((f) => (f.tables.warmups[0].account_id = null), /linha da tabela “warmups” sem “account_id”/);
  refused((f) => (f.settings.vault = null), /tem senhas cifradas, mas não tem o cofre/);
  // referência opcional vazia é normal
  const file = good();
  file.tables.weekly_sales[0].account_id = null;
  file.settings = null;
  file.tables.accounts[0].secrets_enc = null;
  assert.equal(parseBackup(JSON.stringify(file)).settings, null);
});

test("backup: o dono do arquivo nunca é restaurado (quem restaura é quem está com o login aberto)", () => {
  const file = buildBackup(db(), new Date("2026-11-12T14:32:00Z"));
  file.tables.countries[0].user_id = "outra-pessoa";
  assert.ok(!("user_id" in parseBackup(JSON.stringify(file)).tables.countries[0]));
});

// --- zip ---------------------------------------------------------------------

test("zip: CRC-32 padrão", () => {
  assert.equal(crc32(new TextEncoder().encode("123456789")), 0xcbf43926);
  assert.equal(crc32(new Uint8Array()), 0);
});

test("zip: arquivos sem compressão, com nomes em UTF-8, no formato que qualquer programa abre", () => {
  const first = "Avatar;Conta\r\nFra' Salvio;@fra.salvio\r\n";
  const bytes = zipStore(
    [
      { name: "contas.csv", data: first },
      { name: "países.csv", data: new TextEncoder().encode("País;Moeda\r\nItália;EUR\r\n") },
    ],
    new Date(2026, 10, 12, 14, 32, 10),
  );
  const view = new DataView(bytes.buffer);
  const text = (from, length) => new TextDecoder().decode(bytes.subarray(from, from + length));
  // primeiro arquivo: cabeçalho local, nome e conteúdo logo em seguida
  assert.equal(view.getUint32(0, true), 0x04034b50);
  assert.equal(view.getUint16(6, true) & 0x0800, 0x0800); // nomes em UTF-8
  assert.equal(view.getUint16(8, true), 0); // sem compressão
  const size = view.getUint32(18, true);
  assert.equal(size, first.length);
  assert.equal(text(30, 10), "contas.csv");
  assert.equal(text(40, size), first);
  assert.equal(view.getUint32(14, true), crc32(bytes.subarray(40, 40 + size)));
  // fim do arquivo: o índice aponta para os dois arquivos
  const end = bytes.length - 22;
  assert.equal(view.getUint32(end, true), 0x06054b50);
  assert.equal(view.getUint16(end + 10, true), 2);
  const central = view.getUint32(end + 16, true);
  assert.equal(view.getUint32(central, true), 0x02014b50);
  assert.equal(view.getUint32(central + 42, true), 0); // o primeiro arquivo começa no byte 0
  const nameLength = view.getUint16(central + 28, true);
  const second = central + 46 + nameLength;
  assert.equal(view.getUint32(second, true), 0x02014b50);
  const secondOffset = view.getUint32(second + 42, true);
  assert.equal(view.getUint32(secondOffset, true), 0x04034b50);
  assert.equal(text(secondOffset + 30, view.getUint16(secondOffset + 26, true)), "países.csv");
  // data e hora (formato do zip)
  assert.equal(view.getUint16(12, true), ((2026 - 1980) << 9) | (11 << 5) | 12);
  assert.equal(view.getUint16(10, true), (14 << 11) | (32 << 5) | 5);
});
