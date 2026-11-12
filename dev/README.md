# Ambiente local de testes

Nada desta pasta vai para a Vercel. Ela existe para testar o painel de verdade (banco, login e regras de segurança) sem encostar no Supabase real.

## O que tem aqui

| Caminho | Para que serve |
|---|---|
| `local.mjs` | Sobe/desliga um Supabase "de bolso" (Postgres + Auth + API) com Docker, aplica `supabase/schema.sql`, cria o usuário de teste e escreve o `.env.local`. |
| `supabase-local/` | `docker-compose.yml`, scripts de inicialização do banco e o gateway que imita o endereço único do Supabase (`http://localhost:54321`). |
| `e2e/etapa-a.cjs` | Teste de ponta a ponta da etapa (a), no tamanho de um celular. |
| `e2e/extras.cjs` | Situações de exceção: banco sem tabelas e queda de internet ao salvar. |

As chaves do ambiente local são geradas na hora e ficam em `supabase-local/.env` (ignorado pelo git).

## Como rodar

Requisitos: Docker, Node 20.9+ e Playwright com Chromium (`require("playwright")`).

```bash
node dev/local.mjs up
```

```bash
npm run build
```

```bash
npm start
```

Em outro terminal:

```bash
node dev/e2e/etapa-a.cjs
```

```bash
node dev/e2e/extras.cjs
```

Login de teste: `teste@exemplo.com` / `senha-de-teste-123`.

Outros comandos:

```bash
node dev/local.mjs reset
```

```bash
node dev/local.mjs psql "select count(*) from public.accounts"
```

```bash
node dev/local.mjs down
```

## Dicas

- `npm run dev` também funciona com o Supabase local (e é mais rigoroso com avisos do React). Use `BASE=http://localhost:3001 node dev/e2e/etapa-a.cjs` para apontar o teste para outra porta.
- As chaves `NEXT_PUBLIC_*` são embutidas no build: depois de um `local.mjs up` que gerou chaves novas, refaça o `npm run build`.
- Para testar a renovação de sessão, suba com o token curto: `JWT_EXP=100 node dev/local.mjs up`, espere mais de 100 segundos com o painel aberto e continue usando.
- **Playwright e telas "guardadas"**: o Next.js mantém a tela anterior montada, só escondida. Depois de clicar num link de navegação, espere o título da tela nova aparecer antes de clicar em algo que também exista na tela anterior — senão o Playwright fica preso ao elemento escondido.
- As capturas de tela dos testes vão para `dev/e2e/shots/` (ignorado pelo git).
