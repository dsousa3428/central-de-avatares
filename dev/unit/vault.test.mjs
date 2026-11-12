// Cofre de senhas: a parte de criptografia (roda igual no navegador e no Node).
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createVault,
  decryptSecrets,
  decryptText,
  DecryptError,
  EMPTY_SECRETS,
  encryptSecrets,
  encryptText,
  fromBase64Url,
  isKnownPayload,
  MIN_MASTER_PASSWORD,
  openVault,
  parseVaultConfig,
  passwordStrength,
  reencryptSecrets,
  toBase64Url,
  VAULT_ITERATIONS,
  WrongPasswordError,
} from "../../src/lib/vault-crypto.ts";

// Menos rodadas nos testes, só para serem rápidos (o painel usa VAULT_ITERATIONS).
const FAST = 100_000;
const MASTER = "frase-mestra de teste 42";
const ACCOUNT = "3f0c2a1e-1111-4222-8333-444455556666";
const OTHER_ACCOUNT = "9b7d6c5a-aaaa-4bbb-8ccc-ddddeeeeffff";
const SECRETS = {
  instagram_password: "Insta#Senha!2026",
  email_password: "email-senha-çãé",
  recovery_email: "recupera@exemplo.com",
  backup_codes: "1111 2222\n3333 4444\n5555 6666",
};

test("criar o cofre: o banco recebe só o sal, as rodadas e o teste de conferência", async () => {
  const { config, key } = await createVault(MASTER, FAST);
  assert.deepEqual(parseVaultConfig(config), config);
  assert.deepEqual(Object.keys(config).sort(), ["check", "iterations", "kdf", "salt", "v"]);
  assert.equal(config.kdf, "PBKDF2-SHA256");
  assert.equal(fromBase64Url(config.salt).length, 16);
  assert.ok(isKnownPayload(config.check));
  assert.ok(!JSON.stringify(config).includes(MASTER));
  // a chave sai direto da senha-mestra e não pode ser exportada da memória
  assert.equal(key.type, "secret");
  assert.equal(key.extractable, false);
  await assert.rejects(crypto.subtle.exportKey("raw", key));
  assert.deepEqual([...key.usages].sort(), ["decrypt", "encrypt"]);
});

test("o padrão do painel são 600 mil rodadas de PBKDF2 e chave AES-256-GCM", async () => {
  assert.equal(VAULT_ITERATIONS, 600_000);
  const { config, key } = await createVault(MASTER);
  assert.equal(config.iterations, 600_000);
  assert.equal(key.algorithm.name, "AES-GCM");
  assert.equal(key.algorithm.length, 256);
  await openVault(config, MASTER);
});

test("a chave é derivada da senha-mestra: mesma senha e mesmo sal dão a mesma chave", async () => {
  const { config, key } = await createVault(MASTER, FAST);
  const cipher = await encryptText(key, "segredo", "contexto");
  // "outro aparelho": só tem a configuração do banco e a senha-mestra digitada
  const again = await openVault(JSON.parse(JSON.stringify(config)), MASTER);
  assert.equal(await decryptText(again, cipher, "contexto"), "segredo");
  // e o que o segundo cifra, o primeiro abre
  assert.equal(await decryptText(key, await encryptText(again, "volta", "contexto"), "contexto"), "volta");
});

test("abrir: só com a senha-mestra certa", async () => {
  const { config } = await createVault(MASTER, FAST);
  for (const wrong of ["", "frase-mestra de teste 43", MASTER + " ", MASTER.toUpperCase()]) {
    await assert.rejects(openVault(config, wrong), WrongPasswordError);
  }
  // teste de conferência adulterado no banco também não abre
  const tampered = { ...config, check: config.check.slice(0, -3) + (config.check.endsWith("AAA") ? "BBB" : "AAA") };
  await assert.rejects(openVault(tampered, MASTER), WrongPasswordError);
});

test("dois cofres com a mesma senha-mestra têm sal e chave diferentes", async () => {
  const a = await createVault(MASTER, FAST);
  const b = await createVault(MASTER, FAST);
  assert.notEqual(a.config.salt, b.config.salt);
  assert.notEqual(a.config.check, b.config.check);
  const cipher = await encryptText(a.key, "segredo", "c");
  await assert.rejects(decryptText(b.key, cipher, "c"), DecryptError);
});

test("acentos: a mesma senha digitada de formas diferentes abre o cofre", async () => {
  const composed = "senha-mestra-coração"; // "ç" e "ã" como um caractere só
  const decomposed = composed.normalize("NFD"); // letra + acento separados
  assert.notEqual(composed, decomposed);
  const { config } = await createVault(composed, FAST);
  await openVault(config, decomposed);
});

test("trocar a senha-mestra: a chave muda e cada bloco é cifrado de novo", async () => {
  const before = await createVault(MASTER, FAST);
  const stored = await encryptSecrets(before.key, ACCOUNT, SECRETS);

  const after = await createVault("nova senha mestra 2026", FAST);
  const moved = await reencryptSecrets(before.key, after.key, ACCOUNT, stored);
  assert.notEqual(moved, stored);
  assert.equal(moved.length, stored.length, "o tamanho do bloco não muda");
  assert.deepEqual(await decryptSecrets(after.key, ACCOUNT, moved), SECRETS);

  // a senha antiga não abre o cofre novo, nem a chave antiga abre o bloco recifrado
  await assert.rejects(openVault(after.config, MASTER), WrongPasswordError);
  await assert.rejects(decryptSecrets(before.key, ACCOUNT, moved), DecryptError);
  // o bloco continua amarrado à conta dele
  await assert.rejects(decryptSecrets(after.key, OTHER_ACCOUNT, moved), DecryptError);
  // um bloco que não abre com a chave antiga não é "recifrado" às cegas
  const stranger = await createVault("senha de outro cofre aqui", FAST);
  await assert.rejects(reencryptSecrets(stranger.key, after.key, ACCOUNT, stored), DecryptError);
});

test("cifrar texto: ida e volta, IV novo a cada vez, e nada abre fora do lugar", async () => {
  const { key } = await createVault(MASTER, FAST);
  const one = await encryptText(key, "texto com acentuação e emoji 🌿", "ctx");
  const two = await encryptText(key, "texto com acentuação e emoji 🌿", "ctx");
  assert.match(one, /^v1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]+$/);
  assert.ok(isKnownPayload(one));
  assert.notEqual(one, two, "o mesmo texto cifrado duas vezes dá resultados diferentes");
  assert.equal(await decryptText(key, one, "ctx"), "texto com acentuação e emoji 🌿");
  assert.equal(await decryptText(key, two, "ctx"), "texto com acentuação e emoji 🌿");

  // contexto diferente
  await assert.rejects(decryptText(key, one, "outro"), DecryptError);
  // um caractere alterado no conteúdo
  const [v, iv, body] = one.split(".");
  const flipped = body.slice(0, -2) + (body.at(-2) === "A" ? "B" : "A") + body.at(-1);
  await assert.rejects(decryptText(key, `${v}.${iv}.${flipped}`, "ctx"), DecryptError);
  // formatos inválidos
  for (const bad of ["", "v1", "v2." + iv + "." + body, "v1..", "v1.@@@." + body, `v1.${iv}.AAAA`, 42, null]) {
    await assert.rejects(decryptText(key, bad, "ctx"), DecryptError);
  }
  // bloco de uma versão que este painel não conhece
  assert.equal(isKnownPayload("v2." + iv + "." + body), false);
  assert.equal(isKnownPayload("qualquer coisa"), false);
});

test("senhas de uma conta: ida e volta, e só abrem para a mesma conta", async () => {
  const { key } = await createVault(MASTER, FAST);
  const stored = await encryptSecrets(key, ACCOUNT, SECRETS);
  assert.equal(typeof stored, "string");
  for (const value of Object.values(SECRETS)) {
    assert.ok(!stored.includes(value), "o texto cifrado não contém o valor original");
    assert.ok(!stored.includes(toBase64Url(new TextEncoder().encode(value))), "nem o valor em base64");
  }
  assert.deepEqual(await decryptSecrets(key, ACCOUNT, stored), SECRETS);
  // o bloco de uma conta não abre se for colado em outra
  await assert.rejects(decryptSecrets(key, OTHER_ACCOUNT, stored), DecryptError);
  // nada para guardar → nada é gravado
  assert.equal(await encryptSecrets(key, ACCOUNT, EMPTY_SECRETS), null);
  // só um campo preenchido
  const partial = await encryptSecrets(key, ACCOUNT, { ...EMPTY_SECRETS, backup_codes: "abc" });
  assert.deepEqual(await decryptSecrets(key, ACCOUNT, partial), { ...EMPTY_SECRETS, backup_codes: "abc" });
});

test("o tamanho do texto cifrado não revela o tamanho das senhas", async () => {
  const { key } = await createVault(MASTER, FAST);
  const short = await encryptSecrets(key, ACCOUNT, { ...EMPTY_SECRETS, instagram_password: "a" });
  const medium = await encryptSecrets(key, ACCOUNT, { ...EMPTY_SECRETS, instagram_password: "a".repeat(40), email_password: "çã".repeat(20) });
  assert.equal(short.length, medium.length);
  const long = await encryptSecrets(key, ACCOUNT, { ...EMPTY_SECRETS, backup_codes: "0123456789 ".repeat(40) });
  assert.ok(long.length > short.length);
  assert.deepEqual(await decryptSecrets(key, ACCOUNT, long), { ...EMPTY_SECRETS, backup_codes: "0123456789 ".repeat(40) });
});

test("configuração do cofre: só aceita o formato que o painel conhece", async () => {
  const { config } = await createVault(MASTER, FAST);
  assert.deepEqual(parseVaultConfig(JSON.parse(JSON.stringify(config))), config);
  const bad = [
    null,
    undefined,
    "texto",
    {},
    { ...config, v: 2 },
    { ...config, kdf: "MD5" },
    { ...config, iterations: 1000 },
    { ...config, iterations: "600000" },
    { ...config, salt: "AAAA" },
    { ...config, salt: undefined },
    { ...config, salt: "não é base64!" },
    { ...config, check: undefined },
    { ...config, check: "v2" + config.check.slice(2) },
    { ...config, check: "v1.curto.demais" },
  ];
  for (const value of bad) assert.equal(parseVaultConfig(value), null);
  // campos a mais (de uma versão futura) não entram na configuração usada
  assert.deepEqual(parseVaultConfig({ ...config, extra: 1 }), config);
});

test("senha-mestra: tamanho mínimo e nada óbvio", () => {
  assert.equal(MIN_MASTER_PASSWORD, 12);
  const expected = {
    "": "curta",
    "abc1234": "curta",
    "12345678": "curta",
    "onze letras": "curta",
    // do tamanho certo, mas previsíveis
    "123456789012": "fraca",
    "aaaaaaaaaaaa": "fraca",
    "senhasenhasenha": "fraca",
    "121212121212": "fraca",
    "password12345678": "fraca",
    "minhasenha123": "fraca",
    "qwertyuiop123": "fraca",
    "abcdefghijkl": "fraca",
    "Abc-123456xy": "fraca",
    "senha mestra cofre": "fraca",
    "zyxwvutsrqpo": "fraca",
    // aceitas
    "Tr0ub4dor&3xyz": "boa",
    "minha casa azul": "boa",
    "cavalo bateria grampo": "forte",
    "quatro palavras soltas aqui": "forte",
    "frase mestra de teste 2026": "forte",
  };
  for (const [password, level] of Object.entries(expected)) {
    assert.equal(passwordStrength(password), level, `“${password}”`);
  }
});
