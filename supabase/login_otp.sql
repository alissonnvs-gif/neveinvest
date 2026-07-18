-- Rode isto uma vez no SQL Editor do Supabase (projeto do NeveInvest).
-- Tabela de códigos de confirmação de login (2º fator via Telegram).
-- Só o backend (service_role) acessa esta tabela — por isso NENHUMA policy é criada
-- para anon/authenticated: RLS habilitado sem policies = acesso negado por padrão
-- para qualquer chave que não seja a service_role (que sempre ignora RLS).

create table if not exists login_otp (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed boolean not null default false,
  attempts int not null default 0
);

alter table login_otp enable row level security;

-- Limpeza automática: remove códigos expirados há mais de 1 dia. Não é essencial ao
-- fluxo, só evita a tabela crescer indefinidamente.
create index if not exists login_otp_expires_at_idx on login_otp (expires_at);

-- Tranca o acesso à tabela de estado da família e à fila de rascunhos do Telegram:
-- só usuários autenticados (login feito) podem ler/escrever. O bot do Telegram
-- (backend) usa a service_role key, que ignora RLS, então continua funcionando.
drop policy if exists "anon full access" on family_state;
drop policy if exists "authenticated full access" on family_state;
create policy "authenticated full access" on family_state
  for all
  to authenticated
  using (true)
  with check (true);

drop policy if exists "anon full access" on telegram_drafts;
drop policy if exists "authenticated full access" on telegram_drafts;
create policy "authenticated full access" on telegram_drafts
  for all
  to authenticated
  using (true)
  with check (true);
