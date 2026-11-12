@AGENTS.md

# Central de Avatares — notas do projeto

Painel privado, de um único usuário, para organizar contas de Instagram de avatares de IA por país. O pedido original e completo está resumido no `README.md`. Tudo em **português do Brasil**.

## Como trabalhar com o dono do projeto

- Ele **não é programador**: explique em português simples, peça só o indispensável (chaves e logins) e guie com cliques.
- Entrega **em etapas**, nesta ordem: (a) base + login + países/avatares/contas ✅ · (b) aquecimento + tela Hoje ✅ · (c) cofre de senhas · (d) vendas · (e) "Conta caiu" + avisos · (f) PWA + backup. Fora da ordem, a pedido dele: **Planilha** ✅ (visão em tabela de tudo).
- Ele quer o painel "o mais completo possível": ao terminar uma etapa, deixe claro o que já existe e o que falta.
- Ao fim de cada etapa: publicar e dizer exatamente o que testar no celular.
- O painel **não acessa o Instagram**, não automatiza nada. Por decisão de segurança operacional, não criamos links para `instagram.com` (só copiar o @).
- Nunca colocar chaves secretas no repositório.

## Arquitetura (decisões já tomadas)

- **Next.js 16 (App Router) + React 19 + Tailwind v4**, `cacheComponents: true`. Todas as rotas são **estáticas**; não há código de servidor nosso.
- **Dados só no navegador**, via `@supabase/supabase-js` (sessão no localStorage). A segurança é o **RLS** do banco.
- `src/lib/store.ts`: carrega **todas** as tabelas do usuário de uma vez e mantém em memória (`useStore()`). Gravações: `insertRow`, `updateRow`, `deleteRow` (com cascata local), `saveSettings`, `logActivity`. `refresh()` recarrega em segundo plano; `refreshIfStale()` roda ao voltar para a aba.
- Regras do `updateRow` (não quebre):
  - Por padrão a tela **só muda quando o servidor confirma** — é o certo para formulários (`FormModal` já mostra "salvando" e mantém a janela aberta com o erro).
  - `{ optimistic: true }` só para toques rápidos (marcar vídeo, pausar avatar, trocar status no seletor). Se falhar, a tela volta ao último estado confirmado.
  - Gravações da mesma linha entram em **fila** e cada uma confere a versão (`updated_at`): se a linha mudou em outro aparelho, nada é gravado, a linha é recarregada e o erro "alterado em outro aparelho" sobe para a tela. Isso protege as listas JSONB (que são regravadas inteiras) contra abas desatualizadas.
  - Quando o valor novo **depende do antigo** (listas JSONB do avatar, dias do aquecimento, "limpar a queda se a conta estava caída"), passe uma **função**: `updateRow(tabela, id, (linha) => ({ … }))`. Ela recebe a linha como está de fato (nunca a cópia velha que a tela guardou) e é recalculada dentro da fila, depois das gravações anteriores — é o que impede dois toques quase juntos de um apagar o outro. A função pode rodar mais de uma vez (não coloque efeitos nela) e, se devolver `null`, nada é gravado.
  - Botão que **some da tela ao dar certo** (ex.: "Marcar como ativa", "Fiz no dia") não usa modo otimista: espera a confirmação, senão o item de baixo sobe para debaixo do dedo. Toques que só alternam um estado (círculo do dia, "Feito") ignoram o segundo toque enquanto o primeiro está sendo gravado.
- Rotas: `/` (Hoje), `/paises`, `/avatar?id=…&aba=…`, `/planilha`, `/vendas`, `/infraestrutura`, `/configuracoes`, `/login`. O avatar usa **query string** (não segmento dinâmico) para a rota continuar estática. A aba aberta do avatar **vem sempre do endereço** (`?aba=`), trocada com `history.replaceState`.
- `AppShell` (layout de `(painel)`) confere login, dispara o carregamento e desenha a navegação. Cada página embrulha a tela em `<ScreenGate>`, que só mostra o conteúdo quando login e dados estão prontos (senão: carregando / "Falta conectar o Supabase" / "Falta preparar o banco").
- Telas ficam em `src/components/screens/*`, formulários e seções em `src/components/{avatar,countries,infra,warmup,sheet,common}/*`, peças visuais em `src/components/ui/*`.
- Navegação (`shell/nav-items.ts`): no computador, menu lateral com tudo; no celular, barra com Hoje · Países · Planilha · Vendas e o botão **Mais** (Infraestrutura, Configurações, Sair). Item novo: escolha `mobile: "bar" | "more"` (a barra comporta no máximo 4 + Mais).
- **Aquecimento**: regras puras em `src/lib/warmup.ts` (montar calendário, situação do dia, atraso, empurrar, redimensionar — tudo testado em `dev/unit/warmup.test.mjs`); gravações em `src/lib/warmup-actions.ts`. Só "roda" enquanto a conta está `aquecendo` e `warmups.finished_at` é nulo; trocar o status da conta passa sempre por `src/lib/account-actions.ts` (`changeAccountStatus` / `afterStatusChange`), que registra na linha do tempo, encerra o calendário quando a conta sai de `aquecendo` e o **retoma de onde parou** se ela voltar (calendário já concluído continua encerrado: só "reiniciar" abre um novo), e limpa data/motivo da queda quando uma conta caída volta. O molde padrão fica em `settings.warmup_defaults` (`{ days: [{use, minutes, task}] }`). Não escrevemos sugestões de "o que fazer" no aquecimento: o texto de cada dia é do usuário.
- **Planilha** (`screens/sheet-screen.tsx` + `sheet/data-grid.tsx`): grade genérica descrita por colunas (`text` para busca/ordenar/exportar, `render`, `edit` para edição na célula, `dot` para bolinha de cor). Para uma tabela nova (ex.: Vendas na etapa d), crie as colunas e use `<DataGrid>`. Exportação em `src/lib/export.ts` (células iniciadas por `= + - @` ganham um espaço para não virarem fórmula).
- `cn()` usa `tailwind-merge`: quando duas classes disputam o mesmo estilo, vale a última (por isso `className="h-10"` em um `<Input>` funciona).
- Botões (`Button`, `Segmented`) **não quebram o texto** em duas linhas. No rodapé das janelas cabem, no celular, Cancelar + Salvar + no máximo um botão curto (ex.: "Apagar"); ação com texto maior vai no corpo da janela (ver "Voltar ao padrão original" em `default-plan-form.tsx`).
- Listas pequenas do avatar (links extras, vídeos, perfis de exemplo, kit) são **JSONB** na própria linha do avatar; edite com `ItemFormModal` + `upsertById`/`removeById`, sempre na forma de função do `updateRow` (`(linha) => ({ lista: upsertById(linha.lista, item) })`).
- **Janelas**: `Modal`/`FormModal` usam `<dialog>` nativo (`showModal`). Monte formulários condicionalmente (`{aberto && <FormModal … />}`). Janela dentro de janela deve ser renderizada **fora** do `<form>` da primeira (ver `account-form.tsx`).
- **Avisos (toasts)** ficam na "top layer" via atributo `popover`, para aparecerem acima das janelas. Confirmações: `useConfirm()`.
- Tema: atributo `data-theme` no `<html>`, tokens CSS em `globals.css` (`bg-surface`, `text-muted`, `border-line`, `bg-primary`…), variante `dark:` ligada ao atributo.

## Banco de dados

- `supabase/schema.sql` é a única fonte: **idempotente**, sem `drop`, nunca apaga dados. Para mudar a estrutura, acrescente no fim do arquivo (`alter table … add column if not exists …`) — o usuário roda o arquivo inteiro de novo (a tela "Falta preparar o banco" tem o botão **Copiar script SQL**, servido de `/schema.sql`).
- Toda tabela tem `user_id default auth.uid()`, RLS ligado e a política `dono_acessa`. Ao criar tabela nova, inclua o nome na lista do bloco `do $$ … $$` no fim do script.
- As tabelas das etapas futuras **já existem**: `warmups` (dias em JSONB: `{n, date, use, minutes, task, done, done_at}`), `weekly_sales` (única por avatar + semana; `brl_rate` opcional), `activity_log`, `settings` (`vault`, `warmup_defaults`, `brl_rates`, `prefs`). `accounts.secrets_enc` guardará um único bloco cifrado por conta (etapa c); `accounts.checklist` é o checklist de reposição (etapa e).
- Exemplos: linhas com `is_example = true` (`src/lib/examples.ts`). Ao acrescentar dados de exemplo numa etapa, aumente `EXAMPLES_VERSION`. `deleteExamples()` nunca apaga dados do usuário: exemplo com conteúdo real dentro só perde a marca de exemplo. `keepExampleAvatar()` / `keepExampleCountry()` (botão "Ficar com este avatar / país") transformam um exemplo em dado do usuário — importante porque o Fra' Salvio é um avatar real dele.

## Pegadinhas do Next.js 16 que já encontramos

- Leia `node_modules/next/dist/docs/` antes de usar uma API (ver `AGENTS.md`).
- Rotas visitadas ficam **montadas e escondidas** (Activity). Efeitos são desmontados quando a rota some. Estado local persiste ao voltar.
- O layout precisa **sempre renderizar `children`**; esconder a página inteira no layout dispara o erro de "instant navigation" no modo dev. Por isso existe o `ScreenGate` por página.
- `useSearchParams` precisa de `<Suspense>` em volta (ver `app/(painel)/avatar/page.tsx`).
- Logout usa `window.location.href` de propósito (limpa toda a memória).
- A tela de login também fica guardada depois de entrar: por isso o formulário limpa a senha e o estado de "entrando" assim que o login dá certo.
- Texto longo: `body` usa `overflow-wrap: anywhere`. Não use a classe `break-words` (ela anula essa regra dentro de flex/grid).

## Testes

Veja `dev/README.md`. Resumo: `node dev/local.mjs up` → `npm run build && npm start` → `node dev/e2e/etapa-a.cjs`, `etapa-b.cjs`, `planilha.cjs`, `extras.cjs` e `robustez.cjs`, as duas conferências de layout (`textos-longos.cjs` e `botoes.cjs`), mais `npm run test:unit`. Nos testes que dependem de "hoje", abra o navegador com `timezoneId: "UTC"` (o banco local está em UTC). Antes de entregar uma etapa: `npm run typecheck`, `npm run lint`, build e os testes (em produção **e** com `npm run dev`, que é mais rigoroso), mais uma conferida visual (celular 360–390px e computador, claro e escuro, e com textos bem longos).

## Publicação

- Vercel importa este repositório; produção = branch padrão do GitHub. Variáveis: `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (o código também aceita `NEXT_PUBLIC_SUPABASE_ANON_KEY`).
- O build copia `supabase/schema.sql` para `public/schema.sql` (`scripts/copy-schema.mjs`).

## Ideias anotadas para as próximas etapas

- (c) Cofre: PBKDF2 → AES-GCM no navegador; `settings.vault` guarda só sal + teste de conferência; trava sozinho por inatividade; limpar a chave ao sair. Adicionar Content-Security-Policy nesta etapa.
- (d) Vendas: semana começa na segunda; cotação manual por moeda em `settings.brl_rates`. Acrescentar a aba "Vendas" na Planilha e as vendas do mês nos cartões de Países.
- (e) "Conta caiu": assistente que cria a nova geração puxando o kit e exige confirmação para reutilizar celular/perfil/proxy da conta caída; lista central de avisos na tela Hoje. Os avisos de reuso dentro do formulário de conta já existem.
- (f) PWA (manifest + service worker + ícones), exportar/importar JSON e CSV, busca global, trocar senha de login dentro do painel.
