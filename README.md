# Central de Avatares

Painel **privado**, de um único usuário, para organizar contas de Instagram de avatares de IA em vários países: países, avatares, contas (gerações), aquecimento com tarefas do dia, cofre de senhas, celulares, perfis do navegador anti-detect, links, kit de reposição, uma visão em planilha de tudo e, nas próximas etapas, vendas.

> O painel é só de organização. Ele **não acessa o Instagram**, não automatiza nada e não faz login em conta nenhuma.

## Em que etapa estamos

| Etapa | O que entra | Situação |
|---|---|---|
| **a** | Base do app, login, países, avatares, contas, infraestrutura, exemplos | ✅ pronta |
| **b** | Aquecimento (calendário por conta) + tela Hoje com as tarefas do dia | ✅ pronta |
| **+** | Planilha: tudo em tabela, com edição nas células, filtros e exportação | ✅ pronta |
| **c** | Cofre de senhas (criptografia no aparelho, com senha-mestra) | ✅ pronta |
| **d** | Vendas semanais, totais, gráfico, ranking, conversão para BRL | a fazer |
| **e** | Botão "Conta caiu" + assistente de reposição + avisos automáticos | a fazer |
| **f** | App instalável (PWA), backup (exportar/importar), busca global | a fazer |

---

## Como colocar no ar (uma vez só)

São duas partes, as duas gratuitas: o **Supabase** guarda os dados e cuida do login; a **Vercel** publica o painel na internet. Leva uns 15 minutos. É mais fácil fazer no computador.

> Os nomes dos botões podem mudar um pouco com o tempo. Se alguma tela estiver diferente do descrito, mande um print que eu te guio.

### Parte 1 — Supabase (banco de dados e login)

**1. Criar a conta e o projeto**

1. Acesse <https://supabase.com> e clique em **Start your project**.
2. Entre com **Continue with GitHub** (a mesma conta do GitHub onde está este projeto).
3. Clique em **New project** e preencha:
   - **Name**: `central-de-avatares`
   - **Database Password**: clique em **Generate a password** e guarde essa senha em um lugar seguro (você quase nunca vai precisar dela).
   - **Region**: escolha a mais próxima de você (por exemplo, *South America (São Paulo)*).
   - Plano **Free**.
4. Clique em **Create new project** e espere uns 2 minutos até ele ficar pronto.

**2. Preparar o banco de dados**

1. Abra o arquivo [`supabase/schema.sql`](supabase/schema.sql) aqui no GitHub e clique no ícone de **copiar** (*Copy raw file*), no canto superior direito do arquivo.
2. No Supabase, no menu da esquerda, clique em **SQL Editor**.
3. Cole o texto copiado na área grande e clique em **Run**.
4. Deve aparecer o resultado **"Tudo certo! O banco da Central de Avatares está pronto."**
   - Se o Supabase mostrar um aviso pedindo confirmação antes de rodar, pode confirmar: este script só cria coisas, **nunca apaga dados**.

**3. Criar o seu usuário (o único que vai existir)**

1. No menu da esquerda, clique em **Authentication** e depois em **Users**.
2. Clique em **Add user** → **Create new user**.
3. Digite o **e-mail** e uma **senha forte** — é com eles que você vai entrar no painel.
4. Deixe marcada a opção **Auto Confirm User** e clique em **Create user**.

**4. Desligar o cadastro público**

1. Ainda em **Authentication**, clique em **Sign In / Providers**.
2. Desligue a opção **Allow new users to sign up** e clique em **Save**.

Assim ninguém consegue criar conta no seu painel. (Mesmo que conseguisse, não veria nada: cada dado pertence ao seu usuário.)

**5. Copiar as duas informações que a Vercel vai pedir**

1. Clique no botão **Connect**, no topo da tela do projeto.
2. Você vai precisar de dois valores:
   - **Project URL** — parecido com `https://abcdefghijkl.supabase.co`
   - **Publishable key** — começa com `sb_publishable_…` (se aparecer só a chave **anon public**, que começa com `eyJ…`, ela também serve)
3. Deixe essa tela aberta, ou cole os dois valores num bloco de notas.

> Se não achar o botão Connect: a URL fica em **Project Settings → Data API** e a chave em **Project Settings → API Keys**.
>
> Essas duas informações **não são secretas** (elas ficam visíveis no navegador de qualquer forma). O que protege seus dados é o login e as regras de segurança do banco. A chave que **nunca** deve ser usada aqui é a **secret / service_role**.

### Parte 2 — Vercel (publicar o painel)

**1. Criar a conta**

1. Acesse <https://vercel.com> e clique em **Sign Up**.
2. Escolha o plano **Hobby** (gratuito) e entre com **Continue with GitHub**.

**2. Importar o projeto**

1. Clique em **Add New…** → **Project**.
2. Na lista **Import Git Repository**, encontre `central-de-avatares` e clique em **Import**.
   - Se o projeto não aparecer na lista, clique em **Adjust GitHub App Permissions** e libere o acesso a ele.

**3. Informar os dois valores do Supabase**

Antes de clicar em Deploy, abra a seção **Environment Variables** e crie duas variáveis:

| Key (nome) | Value (valor) |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | a **Project URL** do Supabase |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | a **Publishable key** (ou a anon public) |

Copie os nomes exatamente como estão acima.

**4. Publicar**

1. Clique em **Deploy** e espere 1 a 2 minutos.
2. Quando aparecer a tela de parabéns, clique em **Continue to Dashboard**.
3. O endereço do seu painel aparece em **Domains** (algo como `central-de-avatares.vercel.app`).

**5. Entrar**

Abra o endereço no celular e entre com o e-mail e a senha que você criou no Supabase. Na primeira vez, o painel cria sozinho os dados de exemplo (Itália e Fra' Salvio).

Daqui para frente, toda atualização enviada ao GitHub é publicada sozinha pela Vercel.

### Se algo der errado

| O que aparece | O que fazer |
|---|---|
| **"Falta conectar o Supabase"** | Uma das duas variáveis da Vercel está faltando ou com erro de digitação. Vercel → projeto → **Settings → Environment Variables** → corrija → **Deployments** → menu **⋯** do último → **Redeploy**. |
| **"Falta preparar o banco de dados"** | O script do banco ainda não foi rodado (ou há uma versão nova). Toque em **Copiar script SQL** na própria tela, cole no **SQL Editor** do Supabase, **Run**, e volte tocando em **Já rodei**. |
| **"o banco de dados precisa de uma atualização"** (ao trocar a senha-mestra) | É o mesmo script, numa versão mais nova. A janela tem o botão **Copiar script SQL**: cole no **SQL Editor** do Supabase, **Run**, volte e toque em **Já rodei**. Rodar de novo é seguro, não apaga nada. |
| **"E-mail ou senha incorretos"** | Confira o usuário em Supabase → **Authentication → Users**. Se precisar, apague e crie de novo marcando **Auto Confirm User**. |
| O painel parou de abrir depois de dias sem uso | No plano gratuito, o Supabase pausa projetos parados há cerca de uma semana. Entre no Supabase e clique em **Restore project**. Os dados continuam lá. |

---

## Como usar

- **Hoje** — o que fazer no dia: quais contas em aquecimento usar, por quantos minutos, em qual celular e em qual perfil do anti-detect, com o botão **Feito**. Mostra também os dias atrasados, as contas que hoje descansam, os aquecimentos que terminam em breve e as contas prontas para operar.
- **Países** — uma aba por país. No topo ficam as tags de aquecimento (toque numa tag para copiar, ou em *Copiar todas*). Abaixo, os avatares do país, com a barra de progresso do aquecimento.
- **Avatar** — toque em um avatar para abrir a página dele, com as seções: Visão geral · Conta atual · Aquecimento · Links · Vídeos para modelar · Perfis de exemplo · Kit de reposição · Histórico · Anotações.
- **Contas** — cada conta é uma *geração* do avatar. Quando uma cai, mude o status para **Caída** (o painel pede data e motivo) e crie a próxima geração: o @ já vem preenchido.
- **Aquecimento** — toda conta nova nasce com um calendário (padrão: 10 dias, usa nos dias 1, 3, 5, 7 e 9 e descansa nos pares). Dá para ajustar cada dia (minutos, o que fazer, uso ou descanso), a data de início e a duração. A data de fim é calculada sozinha. Se um dia de uso passar sem marcar, o painel pergunta: **Fiz no dia** ou **Não fiz: empurrar para hoje** — e recalcula o fim. Quando a conta sai do status *Aquecendo*, o calendário é encerrado; se ela voltar para *Aquecendo*, ele continua de onde parou. O padrão para contas novas fica em Configurações.
- **Cofre de senhas** — na aba *Conta atual* de cada avatar há o bloco **Senhas e códigos**: senha do Instagram, senha do e-mail, e-mail de recuperação e códigos de backup/2FA. Na primeira vez você cria a **senha-mestra**; depois é só destrancar. Os campos ficam escondidos, com botões de **mostrar** e **copiar**. O cofre tranca sozinho depois de alguns minutos sem uso (o tempo fica em Configurações), ao recarregar a página e ao sair. Contas antigas têm o mesmo bloco no *Histórico* (ícone da chave).
- **Planilha** — os mesmos dados em formato de tabela (Contas, Avatares, Celulares e Perfis). Toque no título de uma coluna para ordenar, use os filtros e a busca, e edite direto nas células das colunas marcadas com um lápis. **Copiar** leva a tabela para colar no Excel ou no Google Planilhas; **Baixar** gera um arquivo CSV.
- **Infraestrutura** — celulares e perfis do anti-detect, mostrando qual conta está em cada um, quais estão livres e quais já foram usados por conta que caiu. No celular fica no botão **Mais**.
- **Configurações** — tema claro/escuro, cofre de senhas (criar ou trocar a senha-mestra, trancar, tempo para trancar sozinho), padrão de aquecimento, apagar (ou recriar) os dados de exemplo e sair. No celular fica no botão **Mais**.
- **Exemplos** — Itália e Fra' Salvio vêm com dados fictícios. Se quiser aproveitar um exemplo como dado seu, abra o avatar (ou o país) e toque em **Ficar com este avatar / país**: ele deixa de ser exemplo e não é mais apagado em "Apagar exemplos".

O painel avisa quando você escolhe um celular, perfil ou proxy que já está em uso por outra conta, ou que foi usado por uma conta que caiu.

## Segurança e privacidade

- **Login único**, por e-mail e senha, com cadastro público desligado.
- **Row Level Security em todas as tabelas**: cada linha pertence a um usuário e só ele, logado, consegue ler ou alterar. Visitante sem login não acessa nada.
- **Nenhuma chave secreta no código**: as duas informações do Supabase ficam nas variáveis de ambiente da Vercel.
- **Links abrem sem revelar a origem**: ao abrir seu site de vendas ou qualquer link, o site de destino não recebe o endereço do painel.
- O painel pede aos buscadores para **não ser indexado** e não pode ser embutido em outros sites.
- Como camada extra, o navegador é instruído (Content-Security-Policy) a só carregar código do próprio painel e a só abrir conexões de dados com o painel e com o seu Supabase.

### Cofre de senhas

- Senhas, e-mails de recuperação e códigos de backup são **criptografados no seu aparelho** antes de irem para o banco. O banco só guarda texto cifrado; sem a senha-mestra, ninguém (nem eu, nem o Supabase) consegue ler.
- A **senha-mestra não é salva em lugar nenhum** e nunca é enviada pela internet. Ela só existe enquanto você digita.
- **Se você perder a senha-mestra, as senhas guardadas não podem ser recuperadas.** Anote num papel e guarde em lugar seguro. A única saída, nesse caso, é apagar o cofre (Configurações → Cofre de senhas → *Esqueci a senha-mestra*) e guardar as senhas de novo.
- A senha-mestra é diferente da senha de login. Use outra: no mínimo 12 caracteres, de preferência uma frase de 3 ou 4 palavras soltas. Se o navegador oferecer para salvá-la, recuse.
- O cofre tranca sozinho depois de alguns minutos sem uso, ao recarregar a página e ao sair da conta. Um campo que você mandou mostrar se esconde sozinho depois de 30 segundos.
- A Planilha e as exportações nunca incluem senhas — só dizem se a conta tem senhas guardadas.

- Ao copiar uma senha, o painel tenta limpar a área de transferência depois de 1 minuto e quando o cofre tranca (o navegador só permite isso com o painel aberto na frente).
- **Trocar a senha-mestra** (Configurações → Cofre de senhas): todas as senhas guardadas são cifradas de novo com a senha nova, de uma vez só. Na primeira vez o painel pede para rodar o script SQL atualizado no Supabase — ele mesmo mostra o botão **Copiar script SQL** e o passo a passo. Se você acha que alguém descobriu a senha antiga, troque também as senhas das próprias contas.

Para quem quiser os detalhes: a senha-mestra passa por PBKDF2 (SHA-256, 600 mil rodadas, sal aleatório) e vira a chave AES-256 do cofre, que cifra as senhas de cada conta com AES-256-GCM (um IV novo a cada gravação). O banco guarda só o sal, o número de rodadas, um teste de conferência (um texto fixo cifrado, para saber se a senha digitada está certa) e os blocos cifrados. Tudo é feito com a Web Crypto do próprio navegador.

## Para quem for mexer no código

- Tecnologias: Next.js (App Router) + TypeScript + Tailwind, Supabase (Postgres + Auth), deploy na Vercel.
- Estrutura do banco: [`supabase/schema.sql`](supabase/schema.sql) — pode ser rodado de novo a qualquer momento.
- Ambiente de testes local e testes automáticos: veja [`dev/README.md`](dev/README.md).
- Anotações de arquitetura e decisões do projeto: [`CLAUDE.md`](CLAUDE.md).
