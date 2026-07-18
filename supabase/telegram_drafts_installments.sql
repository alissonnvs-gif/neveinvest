-- Rode isto uma vez no SQL Editor do Supabase (projeto do NeveInvest).
-- Adiciona o número de parcelas identificado no rascunho vindo do Telegram
-- (ex: "Gastei 90,00 no cartão XP em 2x em compra de blusa" -> guessed_installments = 2).

alter table telegram_drafts add column if not exists guessed_installments integer not null default 1;
