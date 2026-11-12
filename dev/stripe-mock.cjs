// Uma Stripe "de mentira" para os testes: responde só as duas listas que o painel usa
// (links de pagamento e sessões de checkout), no formato da Stripe de verdade.
//
// O servidor do painel fala com ela quando STRIPE_API_BASE aponta para cá — é o que o
// .env.local gerado por dev/local.mjs faz. Fora dos testes da Stripe ela fica desligada (e
// nada no painel chama a Stripe sem um toque no botão).
const http = require("node:http");

const PORT = 54390;
/** A "chave" que o .env.local de testes guarda. Não é uma chave de verdade. */
const KEY = "rk_test_painel_local";

function stripeError(res, status, message, extra = {}) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify({ error: { type: "invalid_request_error", message, ...extra } }));
}

function page(items, query) {
  const limit = Math.min(100, Math.max(1, Number(query.get("limit") ?? 10)));
  const after = query.get("starting_after");
  let start = 0;
  if (after) {
    const index = items.findIndex((item) => item.id === after);
    if (index < 0) return null;
    start = index + 1;
  }
  const data = items.slice(start, start + limit);
  return { object: "list", data, has_more: start + limit < items.length };
}

/**
 * Liga o simulador. Devolve `state` (o que ele responde — mude à vontade durante o teste),
 * `requests` (o que o painel pediu) e `close()`.
 */
function startStripeMock({ port = PORT } = {}) {
  const state = {
    /** Links de pagamento: { id, url, active } */
    links: [],
    /** Sessões de checkout: { id, payment_link, created, amount_total, currency, status, payment_status, mode, … } */
    sessions: [],
    /** true = a chave "não tem permissão" para ler as sessões (403). */
    denySessions: false,
    /** true = recusa os filtros de situação e de data (400), como uma versão antiga da API faria. */
    rejectFilters: false,
    /** Tamanho máximo de página, para testar a paginação com poucos dados (null = o que o painel pedir). */
    pageSize: null,
  };
  const requests = [];

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    const query = url.searchParams;
    requests.push({ path: url.pathname, query: Object.fromEntries(query), authorization: req.headers.authorization ?? null });
    if (req.method !== "GET") return stripeError(res, 405, "Somente leitura.");
    if (req.headers.authorization !== `Bearer ${KEY}`) {
      return stripeError(res, 401, "Invalid API Key provided: rk_test_*********ocal");
    }
    if (state.pageSize) query.set("limit", String(Math.min(Number(query.get("limit") ?? 10), state.pageSize)));

    if (url.pathname === "/v1/payment_links") {
      const body = page(state.links.map((link) => ({ object: "payment_link", livemode: false, ...link })), query);
      if (!body) return stripeError(res, 400, `No such payment_link: '${query.get("starting_after")}'`);
      res.writeHead(200, { "content-type": "application/json" });
      return res.end(JSON.stringify({ ...body, url: "/v1/payment_links" }));
    }

    if (url.pathname === "/v1/checkout/sessions") {
      if (state.denySessions) {
        return stripeError(
          res,
          403,
          "The provided key 'rk_test_*********ocal' does not have the required permissions for this endpoint on account 'acct_teste'. Having the 'rak_checkout_session_read' permission would allow this request to continue.",
        );
      }
      const filtered = query.has("status") || query.has("created[gte]") || query.has("created[lt]");
      if (state.rejectFilters && filtered) return stripeError(res, 400, "Received unknown parameter: status", { param: "status" });
      const link = query.get("payment_link");
      if (link && !state.links.some((item) => item.id === link)) {
        return stripeError(res, 400, `No such payment_link: '${link}'`, { param: "payment_link" });
      }
      const gte = query.has("created[gte]") ? Number(query.get("created[gte]")) : -Infinity;
      const lt = query.has("created[lt]") ? Number(query.get("created[lt]")) : Infinity;
      const status = query.get("status");
      const items = state.sessions
        .filter((session) => !link || session.payment_link === link)
        .filter((session) => !status || session.status === status)
        .filter((session) => session.created >= gte && session.created < lt)
        .sort((a, b) => b.created - a.created || String(b.id).localeCompare(String(a.id)))
        .map((session) => ({ object: "checkout.session", livemode: false, mode: "payment", ...session }));
      const body = page(items, query);
      if (!body) return stripeError(res, 400, `No such checkout.session: '${query.get("starting_after")}'`);
      res.writeHead(200, { "content-type": "application/json" });
      return res.end(JSON.stringify({ ...body, url: "/v1/checkout/sessions" }));
    }

    return stripeError(res, 404, `Unrecognized request URL (GET: ${url.pathname}).`);
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      resolve({
        state,
        requests,
        port,
        close: () =>
          new Promise((done) => {
            server.closeAllConnections?.();
            server.close(() => done());
          }),
      });
    });
  });
}

let counter = 0;
/** Uma venda paga (ou não, com `extra`), no formato de uma sessão de checkout da Stripe. */
function paidSession(link, created, amount, currency = "eur", extra = {}) {
  counter += 1;
  return {
    id: `cs_test_${String(counter).padStart(6, "0")}`,
    payment_link: link,
    created,
    amount_total: amount,
    currency,
    status: "complete",
    payment_status: "paid",
    ...extra,
  };
}

module.exports = { startStripeMock, paidSession, PORT, KEY };
