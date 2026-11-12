// Vendas: semanas (segunda a domingo), somas por moeda e conversão para reais.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  accountForWeek,
  addWeeks,
  amountIn,
  cleanRates,
  currenciesOf,
  currencySymbol,
  defaultCurrency,
  describeTotals,
  currentMonth,
  formatAmount,
  formatRate,
  firstWeek,
  inBRL,
  monthName,
  monthOfWeek,
  niceScale,
  NO_SALES,
  rank,
  rateOf,
  salesOfMonth,
  salesOfWeek,
  salesSince,
  sumSales,
  unitFor,
  weekEnd,
  weekLabel,
  weeklySeries,
  weeksBetween,
  weekStart,
  weekAgo,
  weekTick,
  weekTitle,
} from "../../src/lib/sales.ts";

const sale = (week_start, amount, currency = "EUR", extra = {}) => ({
  id: `${week_start}-${amount}-${currency}`,
  avatar_id: "a1",
  account_id: null,
  week_start,
  amount,
  currency,
  sales_count: null,
  brl_rate: null,
  notes: null,
  ...extra,
});

test("a semana começa na segunda e vai até domingo", () => {
  assert.equal(weekStart("2026-11-09"), "2026-11-09"); // segunda
  assert.equal(weekStart("2026-11-12"), "2026-11-09"); // quinta
  assert.equal(weekStart("2026-11-15"), "2026-11-09"); // domingo ainda é da mesma semana
  assert.equal(weekStart("2026-11-16"), "2026-11-16"); // a segunda seguinte abre outra
  assert.equal(weekStart("2027-01-01"), "2026-12-28"); // virada de ano
  assert.equal(weekStart("2026-03-01"), "2026-02-23"); // virada de mês (domingo)
  assert.equal(weekEnd("2026-11-09"), "2026-11-15");
  assert.equal(addWeeks("2026-11-09", 1), "2026-11-16");
  assert.equal(addWeeks("2026-11-09", -2), "2026-10-26");
  assert.equal(weeksBetween("2026-10-26", "2026-11-09"), 2);
  assert.equal(weeksBetween("2026-11-09", "2026-10-26"), -2);
  // atravessando o fim do horário de verão / mudanças de relógio a conta continua em semanas inteiras
  assert.equal(weeksBetween("2026-03-02", "2026-11-02"), 35);
});

test("nomes das semanas e dos meses", () => {
  assert.equal(weekLabel("2026-11-09"), "9 a 15 de nov");
  assert.equal(weekLabel("2026-10-26"), "26 de out a 1 de nov");
  assert.equal(weekLabel("2025-12-29", "2026-11-12"), "29 de dez a 4 de jan");
  assert.equal(weekLabel("2025-11-10", "2026-11-12"), "10 a 16 de nov de 2025");
  assert.equal(weekTitle("2026-11-09", "2026-11-12"), "Esta semana");
  assert.equal(weekTitle("2026-11-02", "2026-11-12"), "Semana passada");
  assert.equal(weekTitle("2026-10-26", "2026-11-12"), "Semana de 26 de out a 1 de nov");
  assert.equal(weekTitle("2026-11-16", "2026-11-12"), "Semana de 16 a 22 de nov");
  assert.equal(weekTick("2026-11-09"), "9/11");
  assert.equal(monthName("2026-11"), "novembro");
  assert.equal(monthName("2026-03", "2026-11-12"), "março");
  assert.equal(monthName("2025-12", "2026-11-12"), "dezembro de 2025");
});

test("o mês de uma semana é o da maior parte dos dias dela (a quinta-feira)", () => {
  assert.equal(monthOfWeek("2026-11-09"), "2026-11"); // 9 a 15 de nov
  assert.equal(monthOfWeek("2026-10-26"), "2026-10"); // 26 de out a 1 de nov: seis dias em outubro
  assert.equal(monthOfWeek("2026-11-30"), "2026-12"); // 30 de nov a 6 de dez: seis dias em dezembro
  assert.equal(monthOfWeek("2026-06-29"), "2026-07"); // 29 de jun a 5 de jul: quinta-feira, 2 de julho
  assert.equal(monthOfWeek("2026-12-28"), "2026-12"); // 28 de dez a 3 de jan: quinta-feira, 31 de dezembro
  assert.equal(monthOfWeek("2025-12-29"), "2026-01"); // 29 de dez a 4 de jan: quinta-feira, 1º de janeiro
  // o "mês em andamento" é o da semana atual: o lançamento desta semana sempre entra nele
  assert.equal(currentMonth("2026-11-12"), "2026-11");
  assert.equal(currentMonth("2026-12-01"), "2026-12"); // terça, na semana de 30 de nov a 6 de dez
  assert.equal(currentMonth("2026-11-30"), "2026-12"); // a segunda-feira dessa mesma semana já conta para dezembro
  assert.equal(currentMonth("2026-11-01"), "2026-10"); // domingo, ainda na semana de 26 de out a 1 de nov
  assert.equal(currentMonth("2027-01-02"), "2026-12"); // sábado, na semana de 28 de dez a 3 de jan
});

test("cotações: só moedas válidas com número positivo", () => {
  assert.deepEqual(cleanRates({ EUR: 6.1, usd: "5.4", GBP: 0, XYZW: 3, BRL: 1, CHF: -2, JPY: "abc" }), { EUR: 6.1, USD: 5.4 });
  assert.deepEqual(cleanRates(null), {});
  assert.deepEqual(cleanRates("texto"), {});
});

test("conversão para reais: cotação guardada no lançamento, senão a atual", () => {
  const rates = { EUR: 6 };
  assert.equal(rateOf(sale("2026-11-09", 10, "BRL"), rates), 1);
  assert.equal(rateOf(sale("2026-11-09", 10, "EUR"), rates), 6);
  assert.equal(rateOf(sale("2026-11-09", 10, "eur"), rates), 6);
  // a cotação da época fica valendo para aquele lançamento, mesmo depois de a atual mudar
  assert.equal(rateOf(sale("2026-11-09", 10, "EUR", { brl_rate: 5.5 }), rates), 5.5);
  assert.equal(rateOf(sale("2026-11-09", 10, "USD"), rates), null);
  assert.equal(rateOf(sale("2026-11-09", 10, "USD", { brl_rate: 0 }), rates), null);
  assert.equal(inBRL(sale("2026-11-09", 19.9, "EUR"), rates), 119.4);
  assert.equal(inBRL(sale("2026-11-09", 19.9, "USD"), rates), null);
  assert.equal(inBRL(sale("2026-11-09", 0.1 + 0.2, "BRL"), rates), 0.3);
});

test("somas: por moeda, em reais, e o que ficou sem cotação", () => {
  const list = [
    sale("2026-11-09", 100, "EUR", { sales_count: 5 }),
    sale("2026-11-02", 50.5, "EUR", { brl_rate: 5, sales_count: 2 }),
    sale("2026-11-09", 200, "BRL"),
    sale("2026-11-09", 30, "USD"),
    sale("2026-11-09", 0, "GBP"), // zero não conta como "faltando cotação"
  ];
  const totals = sumSales(list, { EUR: 6 });
  assert.deepEqual(totals.byCurrency, { EUR: 150.5, BRL: 200, USD: 30, GBP: 0 });
  assert.equal(totals.brl, 100 * 6 + 50.5 * 5 + 200);
  assert.deepEqual(totals.missing, ["USD"]);
  assert.deepEqual(totals.unconverted, { USD: 30 });
  // uma moeda com parte convertida (cotação guardada no lançamento) e parte sem cotação nenhuma
  const partly = sumSales([sale("2026-11-02", 40, "USD", { brl_rate: 5 }), sale("2026-11-09", 60, "USD")], {});
  assert.deepEqual(partly.byCurrency, { USD: 100 });
  assert.equal(partly.brl, 200);
  assert.deepEqual(partly.unconverted, { USD: 60 });
  assert.deepEqual(partly.missing, ["USD"]);
  assert.equal(totals.entries, 5);
  assert.equal(totals.units, 7);
  assert.deepEqual(currenciesOf(totals), ["BRL", "EUR", "USD"]);
  assert.deepEqual(sumSales([], {}), NO_SALES);
  // centavos não acumulam erro de arredondamento
  const cents = sumSales(Array.from({ length: 10 }, () => sale("2026-11-09", 0.1, "BRL")), {});
  assert.equal(cents.brl, 1);
  assert.equal(cents.byCurrency.BRL, 1);
});

test("moeda de comparação: a própria moeda quando só há uma, reais quando mistura", () => {
  const eur = [sale("2026-11-09", 100, "EUR")];
  const mixed = [...eur, sale("2026-11-09", 30, "USD")];
  // uma moeda só → fica nela mesma, com ou sem cotação
  let totals = sumSales(eur, {});
  assert.deepEqual(unitFor(totals), { currency: "EUR", partial: false });
  assert.equal(amountIn(totals, unitFor(totals)), 100);
  totals = sumSales(eur, { EUR: 6 });
  assert.deepEqual(unitFor(totals), { currency: "EUR", partial: false });
  assert.equal(amountIn(totals, unitFor(totals)), 100);
  // várias moedas, todas com cotação → reais
  totals = sumSales(mixed, { EUR: 6, USD: 5 });
  assert.deepEqual(unitFor(totals), { currency: "BRL", partial: false });
  assert.equal(amountIn(totals, unitFor(totals)), 750);
  // várias moedas e falta cotação de alguma → reais, avisando que é parcial
  totals = sumSales(mixed, { EUR: 6 });
  assert.deepEqual(unitFor(totals), { currency: "BRL", partial: true });
  assert.equal(amountIn(totals, unitFor(totals)), 600);
  // só reais, ou nada lançado
  totals = sumSales([sale("2026-11-09", 50, "BRL")], {});
  assert.deepEqual(unitFor(totals), { currency: "BRL", partial: false });
  assert.deepEqual(unitFor(NO_SALES), { currency: "BRL", partial: false });
  assert.equal(amountIn(NO_SALES, unitFor(NO_SALES)), 0);
});

test("filtros por semana, mês e período", () => {
  const list = [sale("2026-10-26", 1), sale("2026-11-02", 2), sale("2026-11-09", 3), sale("2025-11-10", 4)];
  assert.deepEqual(salesOfWeek(list, "2026-11-02").map((s) => s.amount), [2]);
  // a semana de 26/10 a 1/11 pertence a outubro (seis dos sete dias)
  assert.deepEqual(salesOfMonth(list, "2026-10").map((s) => s.amount), [1]);
  assert.deepEqual(salesOfMonth(list, "2026-11").map((s) => s.amount), [2, 3]);
  // a semana de 30/11 a 6/12 pertence a dezembro, embora comece em novembro
  const turn = [sale("2026-11-23", 7), sale("2026-11-30", 8)];
  assert.deepEqual(salesOfMonth(turn, "2026-11").map((s) => s.amount), [7]);
  assert.deepEqual(salesOfMonth(turn, "2026-12").map((s) => s.amount), [8]);
  assert.deepEqual(salesSince(list, "2026-11-02").map((s) => s.amount), [2, 3]);
  assert.equal(salesSince(list, null).length, 4);
  assert.equal(firstWeek(list), "2025-11-10");
  assert.equal(firstWeek([]), null);
});

test("série semanal: uma coluna por semana, sem pular as vazias", () => {
  const list = [sale("2026-10-26", 10), sale("2026-11-09", 30), sale("2026-11-09", 5, "EUR", { avatar_id: "a2" }), sale("2026-09-07", 99)];
  const unit = { currency: "EUR", partial: false };
  const points = weeklySeries(list, {}, "2026-11-09", 4, unit);
  assert.deepEqual(points.map((p) => p.week), ["2026-10-19", "2026-10-26", "2026-11-02", "2026-11-09"]);
  assert.deepEqual(points.map((p) => p.value), [0, 10, 0, 35]);
  assert.equal(points[3].totals.entries, 2);
});

test("ranking: do maior para o menor, somando todos os lançamentos de cada item", () => {
  const list = [
    sale("2026-11-09", 100, "EUR", { avatar_id: "a1" }),
    sale("2026-11-02", 50, "EUR", { avatar_id: "a1" }),
    sale("2026-11-09", 400, "EUR", { avatar_id: "a2" }),
    sale("2026-11-09", 150, "EUR", { avatar_id: "a4" }),
  ];
  const unit = { currency: "EUR", partial: false };
  const ranked = rank(["a1", "a2", "a3", "a4"], (id) => list.filter((s) => s.avatar_id === id), {}, unit);
  assert.deepEqual(ranked.map((r) => [r.item, r.value]), [["a2", 400], ["a1", 150], ["a4", 150], ["a3", 0]]);
});

test("qual conta estava no ar na semana", () => {
  const account = (generation, created_on, fell_on = null) => ({ id: `g${generation}`, generation, created_on, fell_on });
  const accounts = [account(1, "2026-08-01", "2026-11-04"), account(2, "2026-11-06"), account(3, "2026-12-01")];
  // antes da queda: a 1ª geração
  assert.equal(accountForWeek(accounts, "2026-10-19").id, "g1");
  // na semana da troca (a 1ª caiu na quarta, a 2ª nasceu na sexta): vale a mais nova que já existia
  assert.equal(accountForWeek(accounts, "2026-11-02").id, "g2");
  assert.equal(accountForWeek(accounts, "2026-11-09").id, "g2");
  assert.equal(accountForWeek(accounts, "2026-12-07").id, "g3");
  // antes de existir qualquer conta
  assert.equal(accountForWeek(accounts, "2026-07-06"), undefined);
  // todas já tinham caído naquela semana: fica a mais nova que existia
  const fallen = [account(1, "2026-08-01", "2026-09-01"), account(2, "2026-09-05", "2026-10-01")];
  assert.equal(accountForWeek(fallen, "2026-11-09").id, "g2");
  assert.equal(accountForWeek([], "2026-11-09"), undefined);
});

test("eixo do gráfico: teto e marcas em números redondos", () => {
  assert.deepEqual(niceScale(0), { max: 4, ticks: [0, 1, 2, 3, 4] });
  assert.deepEqual(niceScale(37), { max: 40, ticks: [0, 10, 20, 30, 40] });
  assert.deepEqual(niceScale(950), { max: 1000, ticks: [0, 250, 500, 750, 1000] });
  assert.deepEqual(niceScale(1234.5), { max: 1500, ticks: [0, 500, 1000, 1500] });
  assert.deepEqual(niceScale(12000), { max: 15000, ticks: [0, 5000, 10000, 15000] });
  assert.deepEqual(niceScale(0.8), { max: 0.8, ticks: [0, 0.2, 0.4, 0.6, 0.8] });
  for (const value of [1, 7, 99, 101, 2500, 8700, 43210, 999999]) {
    const { max, ticks } = niceScale(value);
    assert.ok(max >= value, `teto cobre ${value}`);
    assert.ok(ticks.length >= 3 && ticks.length <= 6, `${ticks.length} marcas para ${value}`);
    assert.equal(ticks.at(-1), max);
  }
});

test("como uma soma aparece na tela", () => {
  // o espaço entre o símbolo e o número é um "espaço duro": compara sem ele
  const text = (totals) => {
    const { primary, secondary } = describeTotals(totals);
    return [primary, secondary].map((value) => (value === null ? null : value.replace(/\s/g, " ")));
  };
  const eur = [sale("2026-11-09", 1234.5, "EUR")];
  assert.deepEqual(text(sumSales([], {})), ["—", null]);
  assert.deepEqual(text(sumSales([sale("2026-11-09", 0, "EUR")], {})), ["€ 0,00", null]);
  assert.deepEqual(text(sumSales([sale("2026-11-09", 200, "BRL")], {})), ["R$ 200,00", null]);
  assert.deepEqual(text(sumSales(eur, {})), ["€ 1.234,50", null]);
  assert.deepEqual(text(sumSales(eur, { EUR: 6 })), ["€ 1.234,50", "≈ R$ 7.407,00"]);
  const mixed = [...eur, sale("2026-11-09", 100, "USD")];
  assert.deepEqual(text(sumSales(mixed, { EUR: 6, USD: 5 })), ["R$ 7.907,00", "€ 1.234,50 + US$ 100,00"]);
  assert.deepEqual(text(sumSales(mixed, { EUR: 6 })), ["R$ 7.407,00 + US$ 100,00", "falta a cotação de USD"]);
  assert.deepEqual(text(sumSales(mixed, {})), ["€ 1.234,50 + US$ 100,00", "falta a cotação de EUR, USD"]);
  // O que já entrou no total em reais não é contado de novo ao lado: dos US$ 100, 40 têm
  // cotação guardada (R$ 200) e só os outros 60 aparecem como "sem cotação".
  const partly = [sale("2026-11-02", 40, "USD", { brl_rate: 5 }), sale("2026-11-09", 60, "USD")];
  assert.deepEqual(text(sumSales(partly, {})), ["US$ 100,00", "≈ R$ 200,00 + US$ 60,00 sem cotação"]);
  assert.deepEqual(text(sumSales([...eur, ...partly], { EUR: 6 })), ["R$ 7.607,00 + US$ 60,00", "falta a cotação de USD"]);
});

test("moeda sugerida, símbolo e valor para o campo", () => {
  const list = [sale("2026-10-26", 1, "USD"), sale("2026-11-09", 1, "gbp"), sale("2026-11-02", 1, "EUR")];
  assert.equal(defaultCurrency(list, "EUR", "BRL"), "GBP"); // a do lançamento mais recente
  assert.equal(defaultCurrency([], "eur", "USD"), "EUR"); // a do produto
  assert.equal(defaultCurrency([], null, "usd"), "USD"); // a do país
  assert.equal(defaultCurrency([], null, null), "BRL");
  assert.equal(currencySymbol("BRL"), "R$");
  assert.equal(currencySymbol("EUR"), "€");
  assert.equal(currencySymbol("USD"), "US$");
  assert.equal(currencySymbol("???"), "???");
  assert.equal(formatAmount(1234.5), "1.234,50");
  assert.equal(formatAmount(0), "0,00");
  // cotação para o campo: pelo menos duas casas, sem separador de milhar
  assert.equal(formatRate(6.1), "6,10");
  assert.equal(formatRate(5), "5,00");
  assert.equal(formatRate(5.4321), "5,4321");
  assert.equal(formatRate(1234.5), "1234,50");
  assert.equal(weekAgo("2026-11-09", "2026-11-12"), "Esta semana");
  assert.equal(weekAgo("2026-11-02", "2026-11-12"), "Semana passada");
  assert.equal(weekAgo("2026-10-19", "2026-11-12"), "Há 3 semanas");
  assert.equal(weekAgo("2026-11-16", "2026-11-12"), "Semana que vem");
});
