-- =====================================================================
--  Central de Avatares — estrutura do banco de dados (Supabase)
-- =====================================================================
--  COMO USAR
--    1. No Supabase, abra "SQL Editor" (menu da esquerda).
--    2. Cole este arquivo INTEIRO e clique em "Run".
--    3. Deve aparecer a mensagem "Tudo certo!" no final.
--
--  Pode rodar de novo quantas vezes quiser: este script só cria o que
--  ainda não existe. Ele NUNCA apaga dados.
--
--  SEGURANÇA
--    Todas as tabelas ficam com Row Level Security ligado: cada linha
--    pertence a um usuário (coluna user_id) e só esse usuário, logado,
--    consegue ler ou alterar. Visitantes sem login não acessam nada.
-- =====================================================================


-- ---------------------------------------------------------------------
-- Função auxiliar: mantém a coluna "updated_at" sempre atualizada
-- ---------------------------------------------------------------------
create or replace function public.cda_set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end
$$;


-- ---------------------------------------------------------------------
-- PAÍSES
-- ---------------------------------------------------------------------
create table if not exists public.countries (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name         text not null,
  flag         text,                               -- emoji da bandeira
  language     text,
  currency     text not null default 'EUR',        -- moeda padrão (EUR, USD, BRL...)
  timezone     text,                               -- ex.: Europe/Rome
  warmup_tags  text[] not null default '{}',       -- hashtags / temas / perfis do aquecimento
  notes        text,
  position     integer not null default 0,
  is_example   boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);


-- ---------------------------------------------------------------------
-- CELULARES
-- ---------------------------------------------------------------------
create table if not exists public.phones (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  nickname     text not null,
  model        text,
  number       text,                               -- número / chip
  notes        text,
  is_example   boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);


-- ---------------------------------------------------------------------
-- PERFIS DO NAVEGADOR ANTI-DETECT
-- ---------------------------------------------------------------------
create table if not exists public.antidetect_profiles (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  number       text not null,                      -- número do perfil
  name         text,
  proxy        text,
  notes        text,
  is_example   boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);


-- ---------------------------------------------------------------------
-- AVATARES (pertencem a um país)
-- ---------------------------------------------------------------------
create table if not exists public.avatars (
  id                       uuid primary key default gen_random_uuid(),
  user_id                  uuid not null default auth.uid() references auth.users (id) on delete cascade,
  country_id               uuid not null references public.countries (id),
  name                     text not null,
  niche                    text,
  photo_url                text,
  status                   text not null default 'ativo' check (status in ('ativo', 'pausado')),
  -- produto e preço
  product_name             text,
  product_price            numeric(12, 2),
  product_currency         text,
  -- links
  sales_site_url           text,
  checkout_url             text,
  delivery_page_url        text,
  deliverables_folder_url  text,
  extra_links              jsonb not null default '[]'::jsonb,   -- [{id, label, url}]
  -- kit de reposição: {display_name, bio, bio_link, highlights[], proof_links[]}
  kit                      jsonb not null default '{}'::jsonb,
  -- vídeos para modelar: [{id, label, url, status, note}]
  model_videos             jsonb not null default '[]'::jsonb,
  -- perfis de exemplo: [{id, handle, note}]
  reference_profiles       jsonb not null default '[]'::jsonb,
  notes                    text,
  position                 integer not null default 0,
  is_example               boolean not null default false,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create index if not exists avatars_country_idx on public.avatars (country_id);


-- ---------------------------------------------------------------------
-- CONTAS (cada conta é uma "geração" de um avatar)
-- ---------------------------------------------------------------------
create table if not exists public.accounts (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null default auth.uid() references auth.users (id) on delete cascade,
  avatar_id             uuid not null references public.avatars (id) on delete cascade,
  generation            integer not null check (generation >= 1),
  handle                text not null,             -- @ do Instagram (sem o @)
  email                 text,
  -- Senhas, e-mail de recuperação e códigos de backup: SEMPRE criptografados
  -- no navegador antes de chegar aqui. O banco só guarda texto cifrado.
  secrets_enc           text,
  phone_id              uuid references public.phones (id) on delete set null,
  profile_id            uuid references public.antidetect_profiles (id) on delete set null,
  proxy                 text,
  created_on            date not null default current_date,
  status                text not null default 'aquecendo'
                          check (status in ('aquecendo', 'ativa', 'restrita', 'caida')),
  followers             integer,
  followers_updated_at  timestamptz,
  notes                 text,
  -- preenchidos quando a conta cai
  fell_on               date,
  fall_reason           text,
  -- checklist de reposição: [{key, label, done}]
  checklist             jsonb,
  is_example            boolean not null default false,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (avatar_id, generation)
);

create index if not exists accounts_avatar_idx  on public.accounts (avatar_id);
create index if not exists accounts_phone_idx   on public.accounts (phone_id);
create index if not exists accounts_profile_idx on public.accounts (profile_id);


-- ---------------------------------------------------------------------
-- AQUECIMENTO (um por conta)
-- ---------------------------------------------------------------------
create table if not exists public.warmups (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  account_id   uuid not null unique references public.accounts (id) on delete cascade,
  start_date   date not null,
  total_days   integer not null default 10 check (total_days between 1 and 120),
  -- dias: [{n, date, use, minutes, task, done, done_at}]
  days         jsonb not null default '[]'::jsonb,
  finished_at  timestamptz,
  notes        text,
  is_example   boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);


-- ---------------------------------------------------------------------
-- VENDAS SEMANAIS (por avatar)
-- ---------------------------------------------------------------------
create table if not exists public.weekly_sales (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  avatar_id    uuid not null references public.avatars (id) on delete cascade,
  account_id   uuid references public.accounts (id) on delete set null,  -- conta ativa na semana
  week_start   date not null,                      -- segunda-feira da semana
  amount       numeric(14, 2) not null default 0,
  currency     text not null,
  sales_count  integer,
  brl_rate     numeric(14, 6),                     -- cotação para BRL usada no lançamento
  notes        text,
  is_example   boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (avatar_id, week_start)
);

create index if not exists weekly_sales_avatar_idx on public.weekly_sales (avatar_id, week_start);


-- ---------------------------------------------------------------------
-- REGISTRO DE ATIVIDADES (linha do tempo das contas)
-- ---------------------------------------------------------------------
create table if not exists public.activity_log (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  avatar_id    uuid references public.avatars (id) on delete cascade,
  account_id   uuid references public.accounts (id) on delete cascade,
  kind         text not null,                      -- ex.: conta_criada, status_alterado, caiu
  message      text,
  data         jsonb,
  occurred_at  timestamptz not null default now(),
  is_example   boolean not null default false,
  created_at   timestamptz not null default now()
);

create index if not exists activity_account_idx on public.activity_log (account_id, occurred_at);
create index if not exists activity_avatar_idx  on public.activity_log (avatar_id, occurred_at);


-- ---------------------------------------------------------------------
-- CONFIGURAÇÕES (uma linha por usuário)
-- ---------------------------------------------------------------------
create table if not exists public.settings (
  user_id          uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  -- cofre: só o "sal", o número de rodadas e um teste de conferência (texto fixo
  -- cifrado). A senha-mestra e a chave do cofre NUNCA são guardadas.
  vault            jsonb,
  warmup_defaults  jsonb,                          -- padrão de aquecimento
  brl_rates        jsonb not null default '{}'::jsonb,   -- cotações digitadas: {"EUR": 6.1}
  prefs            jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);


-- ---------------------------------------------------------------------
-- SEGURANÇA: Row Level Security + permissões + gatilhos
-- ---------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'countries', 'phones', 'antidetect_profiles', 'avatars', 'accounts',
    'warmups', 'weekly_sales', 'activity_log', 'settings'
  ]
  loop
    -- liga o RLS
    execute format('alter table public.%I enable row level security', t);

    -- regra única: só o dono da linha, logado, pode ver e mexer
    if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = t and policyname = 'dono_acessa'
    ) then
      execute format(
        'create policy dono_acessa on public.%I for all to authenticated '
        'using ((select auth.uid()) = user_id) '
        'with check ((select auth.uid()) = user_id)',
        t
      );
    end if;

    -- visitante sem login: nenhuma permissão; usuário logado: uso normal
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);

    -- updated_at automático
    if t <> 'activity_log' then
      execute format(
        'create or replace trigger cda_updated_at before update on public.%I '
        'for each row execute function public.cda_set_updated_at()',
        t
      );
    end if;
  end loop;
end
$$;

-- ---------------------------------------------------------------------
-- VERSÃO DA ESTRUTURA
-- O painel pergunta este número quando uma tela depende de algo que foi
-- acrescentado depois (hoje: a troca da senha-mestra). Aumente ao acrescentar.
-- ---------------------------------------------------------------------
create or replace function public.cda_schema_version()
returns integer
language sql
immutable
set search_path = ''
as $$ select 2 $$;

revoke all on function public.cda_schema_version() from public, anon;
grant execute on function public.cda_schema_version() to authenticated;


-- ---------------------------------------------------------------------
-- COFRE: trocar a senha-mestra
-- A chave do cofre sai direto da senha-mestra. Trocar a senha muda a chave,
-- então TODAS as senhas guardadas precisam ser regravadas — já cifradas, no
-- navegador, com a chave nova. Esta função faz a troca de uma vez só: ou grava
-- tudo (configuração do cofre + senhas de todas as contas), ou não grava nada.
-- Ela nunca vê senha nenhuma em texto claro: só recebe e grava texto cifrado.
--
--   expected_salt  o "sal" do cofre atual (a troca só vale se ele ainda for o mesmo)
--   new_vault      a nova configuração do cofre
--   new_secrets    {"<id da conta>": {"old": "<bloco atual>", "new": "<bloco recifrado>"}}
-- ---------------------------------------------------------------------
create or replace function public.cda_vault_rekey(expected_salt text, new_vault jsonb, new_secrets jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  changed integer;
begin
  if expected_salt is null or new_vault is null or new_secrets is null
     or jsonb_typeof(new_vault) <> 'object' or jsonb_typeof(new_secrets) <> 'object' then
    raise exception 'cda_vault_invalid' using errcode = '22023';
  end if;

  -- 1) a configuração só é trocada se o cofre ainda for o que o aparelho conhece
  update public.settings
     set vault = new_vault
   where user_id = (select auth.uid())
     and vault ->> 'salt' = expected_salt;
  get diagnostics changed = row_count;
  if changed <> 1 then
    raise exception 'cda_vault_changed' using errcode = 'P0001';
  end if;

  -- 2) segura as contas até o fim, para nada mudar no meio da troca
  perform 1 from public.accounts where user_id = (select auth.uid()) for update;

  -- 3) toda conta com senhas guardadas precisa estar na lista, com o bloco que o
  --    aparelho leu; se alguma mudou nesse meio tempo, a troca inteira é desfeita
  if exists (
    select 1
      from public.accounts a
     where a.user_id = (select auth.uid())
       and a.secrets_enc is not null
       and (
         a.secrets_enc is distinct from (new_secrets -> a.id::text ->> 'old')
         or (new_secrets -> a.id::text ->> 'new') is null
       )
  ) then
    raise exception 'cda_vault_secrets_changed' using errcode = 'P0001';
  end if;

  -- 4) grava os blocos recifrados. Passa por TODAS as contas (as que não têm senhas
  --    continuam sem): assim cada uma ganha um "updated_at" novo, e um aparelho que
  --    ainda estivesse com a chave antiga não consegue gravar por cima depois da troca
  --    (o painel só grava se a linha ainda estiver na versão que ele conhece).
  update public.accounts a
     set secrets_enc = case
           when a.secrets_enc is null then null
           else new_secrets -> a.id::text ->> 'new'
         end
   where a.user_id = (select auth.uid());
end
$$;

revoke all on function public.cda_vault_rekey(text, jsonb, jsonb) from public, anon;
grant execute on function public.cda_vault_rekey(text, jsonb, jsonb) to authenticated;


-- avisa a API do Supabase que a estrutura mudou
notify pgrst, 'reload schema';

select 'Tudo certo! O banco da Central de Avatares está pronto.' as resultado;
