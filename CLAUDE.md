@AGENTS.md

# Central de Avatares — notas do projeto

Painel privado, de um único usuário, para organizar contas de Instagram de avatares de IA por país. O pedido original e completo está resumido no `README.md`. Tudo em **português do Brasil**.

## Como trabalhar com o dono do projeto

- Ele **não é programador**: explique em português simples, peça só o indispensável (chaves e logins) e guie com cliques.
- Entrega **em etapas**, nesta ordem: (a) base + login + países/avatares/contas ✅ · (b) aquecimento + tela Hoje · (c) cofre de senhas · (d) vendas · (e) "Conta caiu" + avisos · (f) PWA + backup.
- Ao fim de cada etapa: publicar e dizer exatamente o que testar no celular.
- O painel **não acessa o Instagram**, não automatiza nada. Por decisão de segurança operacional, não criamos links para `instagram.com` (só copiar o @).
- Nunca colocar chaves secretas no repositório.

## Arquitetura (decisões já tomadas)

- **Next.js 16 (App Router) + React 19 + Tailwind v4**, `cacheComponents: true`. Todas as rotas são **estáticas**; não há código de servidor nosso.
- **Dados só no navegador**, via `@supabase/supabase-js` (sessão no localStorage). A segurança é o **RLS** do banco.
- `src/lib/store.ts`: carrega **todas** as tabelas do usuário de uma vez e mantém em memória (`useStore()`). Gravações: `insertRow`, `updateRow` (otimista, com rollback), `deleteRow` (com cascata local), `saveSettings`, `logActivity`. `refresh()` recarrega em segundo plano; `refreshIfStale()` roda ao voltar para a aba.
- Rotas: `/` (Hoje), `/paises`, `/avatar?id=…&aba=…`, `/vendas`, `/infraestrutura`, `/configuracoes`, `/login`. O avatar usa **query string** (não segmento dinâmico) para a rota continuar estática.
- `AppShell` (layout de `(painel)`) confere login, dispara o carregamento e desenha a navegação. Cada página embrulha a tela em `<ScreenGate>`, que só mostra o conteúdo quando login e dados estão prontos (senão: carregando / "Falta conectar o Supabase" / "Falta preparar o banco").
- Telas ficam em `src/components/screens/*`, formulários e seções em `src/components/{avatar,countries,infra,common}/*`, peças visuais em `src/components/ui/*`.
- Listas pequenas do avatar (links extras, vídeos, perfis de exemplo, kit) são **JSONB** na própria linha do avatar; edite com `ItemFormModal` + `upsertById`/`removeById`.
- **Janelas**: `Modal`/`FormModal` usam `<dialog>` nativo (`showModal`). Monte formulários condicionalmente (`{aberto && <FormModal … />}`). Janela dentro de janela deve ser renderizada **fora** do `<form>` da primeira (ver `account-form.tsx`).
- **Avisos (toasts)** ficam na "top layer" via atributo `popover`, para aparecerem acima das janelas. Confirmações: `useConfirm()`.
- Tema: atributo `data-theme` no `<html>`, tokens CSS em `globals.css` (`bg-surface`, `text-muted`, `border-line`, `bg-primary`…), variante `dark:` ligada ao atributo.

## Banco de dados

- `supabase/schema.sql` é a única fonte: **idempotente**, sem `drop`, nunca apaga dados. Para mudar a estrutura, acrescente no fim do arquivo (`alter table … add column if not exists …`) — o usuário roda o arquivo inteiro de novo (a tela "Falta preparar o banco" tem o botão **Copiar script SQL**, servido de `/schema.sql`).
- Toda tabela tem `user_id default auth.uid()`, RLS ligado e a política `dono_acessa`. Ao criar tabela nova, inclua o nome na lista do bloco `do $$ … $$` no fim do script.
- As tabelas das etapas futuras **já existem**: `warmups` (dias em JSONB: `{n, date, use, minutes, task, done, done_at}`), `weekly_sales` (única por avatar + semana; `brl_rate` opcional), `activity_log`, `settings` (`vault`, `warmup_defaults`, `brl_rates`, `prefs`). `accounts.secrets_enc` guardará um único bloco cifrado por conta (etapa c); `accounts.checklist` é o checklist de reposição (etapa e).
- Exemplos: linhas com `is_example = true` (`src/lib/examples.ts`). Ao acrescentar dados de exemplo numa etapa, aumente `EXAMPLES_VERSION`. `deleteExamples()` nunca apaga dados do usuário: exemplo com conteúdo real dentro só perde a marca de exemplo.

## Pegadinhas do Next.js 16 que já encontramos

- Leia `node_modules/next/dist/docs/` antes de usar uma API (ver `AGENTS.md`).
- Rotas visitadas ficam **montadas e escondidas** (Activity). Efeitos são desmontados quando a rota some. Estado local persiste ao voltar.
- O layout precisa **sempre renderizar `children`**; esconder a página inteira no layout dispara o erro de "instant navigation" no modo dev. Por isso existe o `ScreenGate` por página.
- `useSearchParams` precisa de `<Suspense>` em volta (ver `app/(painel)/avatar/page.tsx`).
- Logout usa `window.location.href` de propósito (limpa toda a memória).

## Testes

Veja `dev/README.md`. Resumo: `node dev/local.mjs up` → `npm run build && npm start` → `node dev/e2e/etapa-a.cjs` e `node dev/e2e/extras.cjs`. Antes de entregar uma etapa: `npm run typecheck`, `npm run lint`, build e os testes, mais uma conferida visual (celular 390px e computador, claro e escuro).

## Publicação

- Vercel importa este repositório; produção = branch padrão do GitHub. Variáveis: `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (o código também aceita `NEXT_PUBLIC_SUPABASE_ANON_KEY`).
- O build copia `supabase/schema.sql` para `public/schema.sql` (`scripts/copy-schema.mjs`).

## Ideias anotadas para as próximas etapas

- (b) Hoje: tarefas do dia a partir de `warmups.days`; se um dia de uso ficou sem "feito", perguntar se empurra o calendário (somar dias em todos os seguintes) e recalcular a data de fim. Padrão editável em Configurações (`settings.warmup_defaults`).
- (c) Cofre: PBKDF2 → AES-GCM no navegador; `settings.vault` guarda só sal + teste de conferência; trava sozinho por inatividade; limpar a chave ao sair. Adicionar Content-Security-Policy nesta etapa.
- (d) Vendas: semana começa na segunda; cotação manual por moeda em `settings.brl_rates`.
- (e) "Conta caiu": assistente que cria a nova geração puxando o kit e exige confirmação para reutilizar celular/perfil/proxy da conta caída; lista central de avisos na tela Hoje. Os avisos de reuso dentro do formulário de conta já existem.
- (f) PWA (manifest + service worker + ícones), exportar/importar JSON e CSV, busca global, trocar senha de login dentro do painel.
