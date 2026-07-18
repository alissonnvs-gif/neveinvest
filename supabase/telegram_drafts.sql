-- Rode isto uma vez no SQL Editor do Supabase (projeto do NeveInvest).
-- Cria a fila de rascunhos de lançamento vindos do bot do Telegram.

create table if not exists telegram_drafts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'discarded')),
  raw_text text not null,
  guessed_date date not null,
  guessed_description text not null,
  guessed_amount numeric not null,
  guessed_method text not null,
  guessed_category text not null,
  telegram_chat_id bigint not null,
  telegram_message_id bigint
);

create index if not exists telegram_drafts_status_idx on telegram_drafts (status);

-- Quem mandou a mensagem (nome do Telegram) — útil quando mais de uma pessoa usa o mesmo grupo/bot.
alter table telegram_drafts add column if not exists sender_name text;

-- Mesmo padrão de acesso que a tabela family_state já usa hoje (anon key lê/escreve direto,
-- sem autenticação de usuário — app de uso pessoal/familiar).
alter table telegram_drafts enable row level security;

drop policy if exists "anon full access" on telegram_drafts;
create policy "anon full access" on telegram_drafts
  for all
  to anon
  using (true)
  with check (true);
