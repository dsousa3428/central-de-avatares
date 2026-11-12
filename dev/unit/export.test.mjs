// Exportação da Planilha: texto para colar (TAB) e arquivo CSV.
import assert from "node:assert/strict";
import { test } from "node:test";
import { toCSV, toTSV } from "../../src/lib/export.ts";

const table = [
  ["Avatar", "Conta (@)", "Número", "Obs"],
  ["Fra' Salvio", "fra.salvio", "+39 351 000 0001", "linha 1\nlinha 2"],
  ["Outro; com ponto e vírgula", "@conta", "=1+1", 'com "aspas"'],
  ["Simples", "-10", "ok\tcom tab", ""],
];

test("copiar: colunas separadas por TAB, uma linha por registro", () => {
  const lines = toTSV(table).split("\n");
  assert.equal(lines.length, 4);
  assert.deepEqual(lines[0].split("\t"), ["Avatar", "Conta (@)", "Número", "Obs"]);
  // quebras de linha e TABs dentro de uma célula viram espaço (senão quebrariam a grade)
  assert.deepEqual(lines[1].split("\t"), ["Fra' Salvio", "fra.salvio", " +39 351 000 0001", "linha 1 linha 2"]);
  assert.equal(lines[3].split("\t").length, 4);
});

test("células que começam com = + - @ ganham um espaço na frente (não viram fórmula)", () => {
  const cells = toTSV(table).split("\n").flatMap((line) => line.split("\t"));
  for (const risky of ["+39 351 000 0001", "@conta", "=1+1", "-10"]) {
    assert.ok(cells.includes(` ${risky}`), risky);
    assert.ok(!cells.includes(risky), risky);
  }
});

test("CSV: ponto e vírgula, aspas quando precisa", () => {
  const lines = toCSV(table).split("\r\n");
  assert.equal(lines[0], "Avatar;Conta (@);Número;Obs");
  assert.equal(lines[1], `Fra' Salvio;fra.salvio;" +39 351 000 0001";linha 1 linha 2`);
  assert.equal(lines[2], `"Outro; com ponto e vírgula";" @conta";" =1+1";"com ""aspas"""`);
});

test("copiar: célula com aspas vai entre aspas, para não juntar o resto da tabela numa célula só", () => {
  const lines = toTSV([
    ["Obs", "Depois"],
    ['"começa com aspas', "ok"],
    ['tem "aspas" no meio', "ok"],
    ["sem aspas", "ok"],
  ]).split("\n");
  assert.equal(lines[1], '"""começa com aspas"\tok');
  assert.equal(lines[2], '"tem ""aspas"" no meio"\tok');
  assert.equal(lines[3], "sem aspas\tok");
});

test("quebras de linha de qualquer tipo (inclusive \\r sozinho) viram espaço", () => {
  assert.equal(toTSV([["a\rb", "c\r\nd", "e\n\nf"]]), "a b\tc d\te f");
  assert.equal(toCSV([["a\rb", "c\r\nd"]]), "a b;c d");
});
