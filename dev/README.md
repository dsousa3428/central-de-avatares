# Ambiente local de testes

Nada desta pasta vai para a Vercel. Ela existe para testar o painel de verdade (banco, login e regras de segurança) sem encostar no Supabase real.

## O que tem aqui

| Caminho | Para que serve |
|---|---|
| `local.mjs` | Sobe/desliga um Supabase "de bolso" (Postgres + Auth + API) com Docker, aplica `supabase/schema.sql`, cria o usuário de teste e escreve o `.env.local`. |
| `stripe-mock.cjs` | Uma Stripe "de mentira" (só as duas listas que o painel lê). O `.env.local` de testes aponta o servidor para ela (`STRIPE_API_BASE`, que só aceita endereços do próprio computador) com uma chave inventada. Quem liga e desliga é o próprio `etapa-h.cjs`; os outros testes não precisam dela (nada chama a Stripe sem um toque no botão). |
| `supabase-local/` | `docker-compose.yml`, scripts de inicialização do banco e o gateway que imita o endereço único do Supabase (`http://localhost:54321`). |
| `e2e/etapa-a.cjs` | Teste de ponta a ponta da etapa (a), no tamanho de um celular. |
| `e2e/etapa-b.cjs` | Etapa (b): aquecimento, tarefas da tela Hoje, dia pulado e empurrar o calendário, padrão em Configurações. |
| `e2e/etapa-c.cjs` | Etapa (c): cofre de senhas — criar a senha-mestra, guardar, mostrar/copiar, trancar (à mão, sozinho, ao sair), trocar a senha (inclusive com o banco sem a função nova), dois aparelhos, apagar o cofre. Confere também o banco (só texto cifrado) e a rede (nenhuma senha em texto claro sai do aparelho). Leva uns 4 minutos: espera de verdade o trancamento automático. |
| `e2e/etapa-d.cjs` | Etapa (d): vendas — lançamento rápido por semana (inclusive digitando rápido, com as gravações atrasadas de propósito), detalhes, cotações e conversão para reais (cotação guardada em cada venda, recalcular vendas antigas), gráfico (toque e arrastar) e tabela, ranking, aba Vendas do avatar, vendas do mês em Países, tabela de vendas na Planilha, dois aparelhos, exemplos. |
| `e2e/etapa-e.cjs` | Etapa (e): avisos automáticos na tela Hoje (reuso de celular/perfil/proxy, avatar sem conta, vendas sem lançamento, reposição pela metade; dispensar e trazer de volta; número no menu), "Conta caiu" em dois passos com a confirmação de reuso, checklist de reposição com o kit, deixar a conta nova para depois, e a tela de quedas. |
| `e2e/etapa-f.cjs` | Etapa (f): busca global, backup (baixar o .json e o .zip de planilhas; restaurar — arquivo errado, banco desatualizado, confirmação, backup de segurança, ids mantidos, senhas do cofre abrindo depois), troca da senha de login e aplicativo instalável (manifesto, ícones, service worker e página "Sem internet"). É o único teste com o service worker ligado. |
| `e2e/etapa-g.cjs` | Estrutura do avatar: marcar e desmarcar site, entregável, checkout e automação, a seção "Montar a estrutura" da tela Hoje (com a marca de descanso), o aviso quando o aquecimento termina com a estrutura pela metade e a coluna da Planilha. |
| `e2e/etapa-h.cjs` | Vendas pela Stripe, contra a Stripe de mentira: as rotas (sem login, pedido malfeito, a chave que nunca volta), de quem é cada link, buscar → conferir → lançar, venda nova, período maior, zero da semana passada, moedas misturadas, o mesmo link em dois avatares, lançamento que mudou depois da conferência, erros explicados, o passo a passo de ligação e servidores de teste sem a chave, com a chave errada e com a Stripe reservada a um e-mail (`STRIPE_OWNER_EMAIL`). Leva uns 2 minutos. |
| `e2e/etapa-i.cjs` | Funis para modelar: cadastrar o avatar modelo, registrar as etapas (o que falta, validações, posição no funil), marcar como modelado, texto comprido (ver tudo, copiar), vários modelos, copiar o funil para outro avatar, apagar, e o caso do modelo apagado em outro aparelho. Confere também que o kit de reposição e a estrutura — que moram no mesmo JSON — não são afetados. |
| `e2e/planilha.cjs` | Planilha: grade, edição nas células, ordenar, filtrar, buscar, copiar e baixar. |
| `e2e/extras.cjs` | Situações de exceção: banco sem tabelas, queda de internet ao salvar e regras dos dados de exemplo. |
| `e2e/robustez.cjs` | Dois aparelhos ao mesmo tempo, toques rápidos, falhas no meio de um salvamento, validações de digitação, sair em outra aba. |
| `e2e/textos-longos.cjs` | Layout: com nomes, links e anotações enormes, nenhuma tela pode rolar para o lado num celular de 360 px. |
| `e2e/botoes.cjs` | Layout: em 320, 360 e 390 px, nenhum botão (das telas e das janelas) pode ficar com o texto quebrado, cortado ou fora da tela. |
| `unit/*.test.mjs` | Testes rápidos das regras puras: números, links, @ e datas; calendário de aquecimento; exportação; criptografia do cofre; vendas (semanas, somas, cotações); avisos, checklist de reposição e quedas; busca, backup e o .zip das planilhas; estrutura do avatar; funis para modelar (modelos, etapas, ordem, cópia, planilha); Stripe (de quem é cada link, semanas, moedas, o que muda no painel — e o código do servidor: quem pode pedir, a chave, as listas). |

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
node dev/e2e/etapa-b.cjs
```

```bash
node dev/e2e/etapa-c.cjs
```

```bash
node dev/e2e/etapa-d.cjs
```

```bash
node dev/e2e/etapa-e.cjs
```

```bash
node dev/e2e/etapa-f.cjs
```

```bash
node dev/e2e/etapa-g.cjs
```

```bash
node dev/e2e/etapa-h.cjs
```

```bash
node dev/e2e/etapa-i.cjs
```

```bash
node dev/e2e/planilha.cjs
```

```bash
node dev/e2e/extras.cjs
```

```bash
node dev/e2e/robustez.cjs
```

```bash
node dev/e2e/textos-longos.cjs
```

```bash
node dev/e2e/botoes.cjs
```

```bash
npm run test:unit
```

Login de teste: `teste@exemplo.com` / `senha-de-teste-123`.

Outros comandos:

```bash
node dev/local.mjs schema
```

(aplica de novo o `supabase/schema.sql` no banco local, depois de mudar o script)

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
- As variáveis da Stripe (`STRIPE_SECRET_KEY`, `STRIPE_API_BASE`) são lidas pelo servidor a cada pedido: basta reiniciar o `npm start` depois de mudar o `.env.local`. **Nunca** coloque uma chave de verdade da Stripe no `.env.local` para "testar de verdade": os testes gravam e apagam vendas.
- Para testar a renovação de sessão, suba com o token curto: `JWT_EXP=100 node dev/local.mjs up`, espere mais de 100 segundos com o painel aberto e continue usando.
- **Playwright e telas "guardadas"**: o Next.js mantém a tela anterior montada, só escondida. Depois de clicar num link de navegação, espere o título da tela nova aparecer antes de clicar em algo que também exista na tela anterior — senão o Playwright fica preso ao elemento escondido.
- As capturas de tela dos testes vão para `dev/e2e/shots/` (ignorado pelo git).
