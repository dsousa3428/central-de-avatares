#!/usr/bin/env node
// Ambiente local de testes (só para desenvolvimento — nada disto vai para a Vercel).
//
//   node dev/local.mjs up      sobe o Supabase local, aplica supabase/schema.sql,
//                              cria o usuário de teste e escreve o .env.local
//   node dev/local.mjs schema  aplica de novo supabase/schema.sql (depois de mudar o script)
//   node dev/local.mjs reset   apaga os dados do painel (mantém o usuário de teste)
//   node dev/local.mjs down    desliga tudo e apaga o banco local
//   node dev/local.mjs psql "select 1"   roda um SQL no banco local
//
// Requer Docker. As chaves são geradas na hora e ficam em arquivos ignorados pelo git.

import { execFileSync, spawn, spawnSync } from "node:child_process";
import { createHmac, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, openSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const stackDir = join(here, "supabase-local");
const envFile = join(stackDir, ".env");
const stateDir = join(here, ".state");

export const TEST_USER = { email: "teste@exemplo.com", password: "senha-de-teste-123" };
const API = "http://localhost:54321";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const compose = (args, opts = {}) =>
  execFileSync("docker", ["compose", ...args], { cwd: stackDir, stdio: "inherit", ...opts });

function readEnv() {
  if (!existsSync(envFile)) return null;
  return Object.fromEntries(
    readFileSync(envFile, "utf8")
      .split("\n")
      .filter((line) => line.includes("="))
      .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)]),
  );
}

function signJwt(role, secret) {
  const b64 = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ role, iss: "supabase-local", iat: now, exp: now + 10 * 365 * 24 * 3600 })}`;
  return `${unsigned}.${createHmac("sha256", secret).update(unsigned).digest("base64url")}`;
}

function ensureEnv() {
  let env = readEnv();
  if (!env) {
    const secret = randomBytes(32).toString("hex");
    env = {
      POSTGRES_PASSWORD: randomBytes(18).toString("hex"),
      JWT_SECRET: secret,
      ANON_KEY: signJwt("anon", secret),
      SERVICE_ROLE_KEY: signJwt("service_role", secret),
    };
  }
  env.JWT_EXP = process.env.JWT_EXP || "3600";
  writeFileSync(envFile, Object.entries(env).map(([k, v]) => `${k}=${v}`).join("\n") + "\n");
  return env;
}

async function ensureDocker() {
  if (spawnSync("docker", ["info"], { stdio: "ignore" }).status === 0) return;
  console.log("Docker não está rodando; iniciando o dockerd…");
  mkdirSync(stateDir, { recursive: true });
  const log = openSync(join(stateDir, "dockerd.log"), "a");
  spawn("dockerd", [], { detached: true, stdio: ["ignore", log, log] }).unref();
  for (let i = 0; i < 30; i++) {
    await sleep(1000);
    if (spawnSync("docker", ["info"], { stdio: "ignore" }).status === 0) return;
  }
  throw new Error("Não consegui iniciar o Docker.");
}

/** Roda SQL dentro do contêiner do banco e devolve a saída. */
export function psql(sql) {
  return execFileSync(
    "docker",
    ["compose", "exec", "-T", "db", "psql", "-U", "postgres", "-d", "postgres", "-At", "-v", "ON_ERROR_STOP=1", "-c", sql],
    { cwd: stackDir, encoding: "utf8" },
  ).trim();
}

async function waitFor(url, label) {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(url);
      if (res.status < 500) return;
    } catch {
      // ainda subindo
    }
    await sleep(1000);
  }
  throw new Error(`${label} não respondeu em ${url}`);
}

/** Roda supabase/schema.sql no banco local (pode repetir à vontade: o script não apaga nada). */
export function applySchema() {
  console.log("Aplicando supabase/schema.sql…");
  execFileSync(
    "docker",
    ["compose", "exec", "-T", "db", "psql", "-U", "postgres", "-d", "postgres", "-q", "-v", "ON_ERROR_STOP=1"],
    { cwd: stackDir, input: readFileSync(join(root, "supabase", "schema.sql")), stdio: ["pipe", "ignore", "inherit"] },
  );
}

async function up() {
  await ensureDocker();
  const env = ensureEnv();
  compose(["up", "-d"]);
  await waitFor("http://localhost:54399/health", "Auth");
  await waitFor("http://localhost:54398/", "API");

  applySchema();

  // gateway (porta 54321)
  let gatewayUp = false;
  try {
    gatewayUp = (await fetch(`${API}/auth/v1/health`)).ok;
  } catch {
    gatewayUp = false;
  }
  if (!gatewayUp) {
    mkdirSync(stateDir, { recursive: true });
    const log = openSync(join(stateDir, "gateway.log"), "a");
    spawn(process.execPath, [join(stackDir, "gateway.mjs")], { detached: true, stdio: ["ignore", log, log] }).unref();
    await waitFor(`${API}/auth/v1/health`, "Gateway");
  }

  // usuário de teste (criado pelo "admin", já que o cadastro público é desligado)
  const res = await fetch(`${API}/auth/v1/admin/users`, {
    method: "POST",
    headers: { authorization: `Bearer ${env.SERVICE_ROLE_KEY}`, apikey: env.SERVICE_ROLE_KEY, "content-type": "application/json" },
    body: JSON.stringify({ ...TEST_USER, email_confirm: true }),
  });
  if (!res.ok && res.status !== 422) throw new Error(`Não consegui criar o usuário de teste: ${res.status} ${await res.text()}`);

  writeFileSync(
    join(root, ".env.local"),
    [
      "# Gerado por dev/local.mjs — aponta o app para o Supabase LOCAL de testes.",
      `NEXT_PUBLIC_SUPABASE_URL=${API}`,
      `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=${env.ANON_KEY}`,
      "# Stripe de mentira dos testes (dev/stripe-mock.cjs). A \"chave\" abaixo não é uma chave de verdade.",
      "STRIPE_SECRET_KEY=rk_test_painel_local",
      "STRIPE_API_BASE=http://127.0.0.1:54390",
      "",
    ].join("\n"),
  );
  console.log(`\nPronto. Supabase local em ${API}`);
  console.log(`Login de teste: ${TEST_USER.email} / ${TEST_USER.password}`);
  console.log("Agora: npm run dev  (ou  npm run build && npm start)  e depois  node dev/e2e/etapa-a.cjs");
}

function reset() {
  psql(
    "truncate public.activity_log, public.weekly_sales, public.warmups, public.accounts, public.avatars, public.countries, public.phones, public.antidetect_profiles, public.settings cascade",
  );
  console.log("Dados do painel apagados (usuário de teste mantido).");
}

function down() {
  compose(["down", "-v"]);
  spawnSync("pkill", ["-f", "supabase-local/gateway.mjs"]);
  console.log("Ambiente local desligado.");
}

const command = process.argv[2];
if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    if (command === "up") await up();
    else if (command === "reset") reset();
    else if (command === "schema") applySchema();
    else if (command === "down") down();
    else if (command === "psql") console.log(psql(process.argv[3] ?? "select 1"));
    else console.log("Uso: node dev/local.mjs up | schema | reset | down | psql \"<sql>\"");
  } catch (err) {
    console.error(String(err?.message ?? err));
    process.exit(1);
  }
}
