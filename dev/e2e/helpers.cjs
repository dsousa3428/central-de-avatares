// Utilidades dos testes de ponta a ponta (Playwright).
const { execFileSync } = require("node:child_process");
const { mkdirSync } = require("node:fs");
const { join } = require("node:path");

const stackDir = join(__dirname, "..", "supabase-local");
const SHOTS = join(__dirname, "shots");
mkdirSync(SHOTS, { recursive: true });

const BASE = process.env.BASE || "http://localhost:3000";
const USER = { email: "teste@exemplo.com", password: "senha-de-teste-123" };

/** Roda SQL no banco local e devolve o texto da resposta. */
function psql(sql) {
  return execFileSync(
    "docker",
    ["compose", "exec", "-T", "db", "psql", "-U", "postgres", "-d", "postgres", "-At", "-v", "ON_ERROR_STOP=1", "-c", sql],
    { cwd: stackDir, encoding: "utf8" },
  ).trim();
}

/** Apaga os dados do painel (o usuário de teste continua existindo). */
function resetData() {
  psql(
    "truncate public.activity_log, public.weekly_sales, public.warmups, public.accounts, public.avatars, public.countries, public.phones, public.antidetect_profiles, public.settings cascade",
  );
}

let step = 0;
const ok = (msg) => console.log(`  ✓ ${msg}`);
const section = (msg) => console.log(`\n[${++step}] ${msg}`);
function assert(cond, msg) {
  if (!cond) throw new Error("FALHOU: " + msg);
  ok(msg);
}

/** Abre um navegador do tamanho de um celular e devolve atalhos úteis. */
async function openPhone(chromium, options = {}) {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
    permissions: ["clipboard-read", "clipboard-write"],
    ...options,
  });
  const page = await context.newPage();
  const problems = [];
  page.on("console", (m) => {
    if (["error", "warning"].includes(m.type())) problems.push(`[${m.type()}] ${m.text()}`);
  });
  page.on("pageerror", (e) => problems.push(`[pageerror] ${e.message}`));

  const dialog = () => page.locator("dialog[open]").last();
  return {
    browser,
    page,
    problems,
    dialog,
    shot: (name) => page.screenshot({ path: join(SHOTS, `${name}.png`) }),
    toast: async (text) => {
      await page.locator(".cda-toast", { hasText: text }).first().waitFor({ timeout: 8000 });
      ok(`aviso: “${text}”`);
    },
    save: (label = "Salvar") => dialog().getByRole("button", { name: label, exact: true }).click(),
    noDialog: () => page.waitForFunction(() => !document.querySelector("dialog[open]"), null, { timeout: 8000 }),
    overflow: async (where) => {
      const extra = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      assert(extra <= 0, `sem rolagem lateral em ${where}`);
    },
    clipboard: () => page.evaluate(() => navigator.clipboard.readText()),
    login: async () => {
      await page.goto(BASE + "/login");
      await page.getByLabel("E-mail").fill(USER.email);
      await page.getByLabel("Senha", { exact: true }).fill(USER.password);
      await page.getByRole("button", { name: "Entrar" }).click();
      await page.getByRole("heading", { name: "Hoje" }).waitFor({ timeout: 30000 });
    },
  };
}

/** Encerra o teste: lista problemas do console e define o código de saída. */
async function finish(session, ignore = []) {
  const real = session.problems.filter((p) => !ignore.some((re) => re.test(p)));
  console.log("\nProblemas no console do navegador:");
  console.log(real.length ? real.join("\n") : "  (nenhum)");
  await session.browser.close();
  if (real.length) process.exit(2);
  console.log("\nTUDO CERTO ✅");
}

function fail(err) {
  console.error("\n" + String(err && err.message ? err.message : err));
  process.exit(1);
}

module.exports = { BASE, USER, SHOTS, psql, resetData, ok, section, assert, openPhone, finish, fail };
