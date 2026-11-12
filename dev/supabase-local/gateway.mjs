// Porteiro mínimo que imita o endereço único do Supabase:
//   http://localhost:54321/auth/v1/*  -> Auth (GoTrue)
//   http://localhost:54321/rest/v1/*  -> API (PostgREST)
import http from "node:http";

const routes = [
  { prefix: "/auth/v1", port: 54399 },
  { prefix: "/rest/v1", port: 54398 },
];

const cors = (req) => ({
  "access-control-allow-origin": req.headers.origin || "*",
  "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS,HEAD",
  "access-control-allow-headers": req.headers["access-control-request-headers"] || "*",
  "access-control-expose-headers": "content-range,content-profile,x-total-count",
  "access-control-max-age": "3600",
});

http
  .createServer((req, res) => {
    if (req.method === "OPTIONS") {
      res.writeHead(204, cors(req));
      return res.end();
    }
    const route = routes.find((r) => req.url.startsWith(r.prefix));
    if (!route) {
      res.writeHead(404, cors(req));
      return res.end("rota desconhecida");
    }
    const upstream = http.request(
      {
        host: "127.0.0.1",
        port: route.port,
        method: req.method,
        path: req.url.slice(route.prefix.length) || "/",
        headers: { ...req.headers, host: `localhost:${route.port}` },
      },
      (upRes) => {
        const headers = { ...upRes.headers };
        for (const key of Object.keys(headers)) if (key.startsWith("access-control-")) delete headers[key];
        res.writeHead(upRes.statusCode, { ...headers, ...cors(req) });
        upRes.pipe(res);
      },
    );
    upstream.on("error", (err) => {
      res.writeHead(502, cors(req));
      res.end(String(err));
    });
    req.pipe(upstream);
  })
  .listen(54321, () => console.log("gateway local em http://localhost:54321"));
