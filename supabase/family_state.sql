-- Rode isto uma vez no SQL Editor do Supabase (projeto do NeveInvest).
-- Cria a tabela que guarda o estado inteiro do app (gastos, investimentos, rendas etc.)
-- como um único documento JSON, sincronizado entre os dispositivos da família.

create table if not exists family_state (
  id text primary key,
  state jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- App de uso pessoal/familiar: a anon key lê/escreve direto, sem autenticação de usuário.
alter table family_state enable row level security;

drop policy if exists "anon full access" on family_state;
create policy "anon full access" on family_state
  for all
  to anon
  using (true)
  with check (true);
