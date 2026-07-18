import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string

export const supabase = createClient(url, key)

const STATE_ID = 'neveinvest'

export async function loadFromSupabase(): Promise<Record<string, unknown> | null> {
  const { data, error } = await supabase
    .from('family_state')
    .select('state')
    .eq('id', STATE_ID)
    .single()
  if (error) { console.error('[supabase] erro ao carregar:', JSON.stringify(error)); return null }
  if (!data) return null
  console.log('[supabase] estado carregado, chaves:', Object.keys(data.state ?? {}).length)
  return data.state as Record<string, unknown>
}

export async function saveToSupabase(state: Record<string, unknown>): Promise<void> {
  const { error } = await supabase
    .from('family_state')
    .upsert({ id: STATE_ID, state, updated_at: new Date().toISOString() })
  if (error) console.error('[supabase] erro ao salvar:', error)
  else console.log('[supabase] estado salvo')
}

export interface TelegramDraft {
  id: string
  created_at: string
  status: 'pending' | 'confirmed' | 'discarded'
  raw_text: string
  guessed_date: string
  guessed_description: string
  guessed_amount: number
  guessed_method: string
  guessed_category: string
  guessed_installments: number
  telegram_chat_id: number
  telegram_message_id: number | null
  sender_name: string | null
}

export async function fetchPendingDrafts(): Promise<TelegramDraft[]> {
  const { data, error } = await supabase
    .from('telegram_drafts')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
  if (error) { console.error('[supabase] erro ao buscar rascunhos:', error); return [] }
  return (data ?? []) as TelegramDraft[]
}

export async function fetchPendingDraftsCount(): Promise<number> {
  const { count, error } = await supabase
    .from('telegram_drafts')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending')
  if (error) { console.error('[supabase] erro ao contar rascunhos:', error); return 0 }
  return count ?? 0
}

export async function resolveDraft(id: string, status: 'confirmed' | 'discarded'): Promise<void> {
  const { error } = await supabase.from('telegram_drafts').update({ status }).eq('id', id)
  if (error) console.error('[supabase] erro ao resolver rascunho:', error)
}
