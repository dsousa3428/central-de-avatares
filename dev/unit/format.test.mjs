// Testes rápidos das funções que interpretam o que é digitado (números, links, @, datas).
//   node --test dev/unit/
import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeHandle, normalizeUrl, parseCount, parseDecimal, safeHref } from "../../src/lib/format.ts";
import { addDays, daysBetween, formatDuration, isValidISODate } from "../../src/lib/dates.ts";

test("parseDecimal entende valores em dinheiro", () => {
  const cases = {
    "27": 27,
    "27,90": 27.9,
    "27.90": 27.9,
    "1.234,50": 1234.5,
    "1,234.50": 1234.5,
    "1.234": 1234,
    "12.500.000": 12500000,
    "1.234.567,89": 1234567.89,
    "0.5": 0.5,
    "0.500": 0.5,
    "0,5": 0.5,
    " 19,90 ": 19.9,
  };
  for (const [input, expected] of Object.entries(cases)) assert.equal(parseDecimal(input), expected, input);
  for (const bad of ["", "abc", "1,2,3", "1.2.3", "12a", ",5", "R$ 10"]) assert.equal(parseDecimal(bad), null, bad);
});

test("parseCount entende contagens (seguidores)", () => {
  const cases = {
    "0": 0,
    "1840": 1840,
    "1.840": 1840,
    "1,840": 1840,
    "1 840": 1840,
    "12.345.678": 12345678,
    "12,3k": 12300,
    "12.3K": 12300,
    "1,5 mil": 1500,
    "2 mi": 2000000,
    "1,2M": 1200000,
  };
  for (const [input, expected] of Object.entries(cases)) assert.equal(parseCount(input), expected, input);
  for (const bad of ["", "abc", "1840.5", "12,3", "-5", "1.84", "10 mil pessoas"]) assert.equal(parseCount(bad), null, bad);
});

test("normalizeHandle deixa só o nome da conta", () => {
  const cases = {
    "@Fra.Salvio ": "fra.salvio",
    "fra.salvio": "fra.salvio",
    "instagram.com/fra.salvio": "fra.salvio",
    "https://www.instagram.com/fra.salvio/": "fra.salvio",
    "https://m.instagram.com/Fra.Salvio?igsh=abc": "fra.salvio",
    "@@conta": "conta",
    "": "",
  };
  for (const [input, expected] of Object.entries(cases)) assert.equal(normalizeHandle(input), expected, input);
});

test("normalizeUrl completa o https:// e safeHref só libera http(s)", () => {
  assert.equal(normalizeUrl("exemplo.com/pagina"), "https://exemplo.com/pagina");
  assert.equal(normalizeUrl("site.com:8080/x"), "https://site.com:8080/x");
  assert.equal(normalizeUrl("http://exemplo.com"), "http://exemplo.com");
  assert.equal(normalizeUrl("  "), null);
  assert.equal(normalizeUrl("mailto:a@b.com"), "mailto:a@b.com");
  assert.equal(safeHref("exemplo.com"), "https://exemplo.com");
  assert.equal(safeHref("mailto:a@b.com"), undefined);
  // nada de executar código por link: vira um endereço https inofensivo (e quebrado)
  assert.equal(safeHref("javascript:alert(1)"), "https://javascript:alert(1)");
  assert.equal(safeHref("data:text/html,x"), "https://data:text/html,x");
});

test("isValidISODate só aceita datas que existem", () => {
  for (const good of ["2026-11-12", "2024-02-29", "2010-01-01"]) assert.equal(isValidISODate(good), true, good);
  for (const bad of ["", null, undefined, "2026-02-31", "2025-02-29", "0026-11-12", "2026-13-01", "12/11/2026", "2026-1-5"]) {
    assert.equal(isValidISODate(bad), false, String(bad));
  }
});

test("contas com datas", () => {
  assert.equal(daysBetween("2026-11-01", "2026-11-12"), 11);
  assert.equal(daysBetween("2026-03-28", "2026-03-30"), 2); // atravessa a mudança de horário na Europa
  assert.equal(addDays("2026-12-30", 3), "2027-01-02");
  assert.equal(addDays("2024-02-28", 1), "2024-02-29");
  assert.equal(formatDuration(1), "1 dia");
  assert.equal(formatDuration(45), "45 dias");
  assert.equal(formatDuration(75), "2 meses e 15 dias");
});
