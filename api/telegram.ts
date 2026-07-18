/// <reference types="node" />
import { createClient } from '@supabase/supabase-js'

// Mantenha esta lista em sincronia com CATEGORIES/METHODS em src/components/Gastos.tsx
// (duplicada de propósito: esta função roda isolada do bundle do frontend).
const CATEGORY_KEYWORDS: [string, string[]][] = [
  ['Mercado', ['mercado', 'supermercado', 'feira', 'hortifruti']],
  ['Alimentação', ['restaurante', 'ifood', 'lanche', 'padaria', 'almoço', 'almoco', 'jantar', 'cafe', 'café', 'pizza', 'lanchonete']],
  ['Saúde', ['farmacia', 'farmácia', 'remedio', 'remédio', 'medico', 'médico', 'consulta', 'hospital', 'dentista']],
  ['Transporte', ['uber', '99', 'gasolina', 'combustivel', 'combustível', 'estacionamento', 'onibus', 'ônibus', 'metro', 'metrô', 'táxi', 'taxi']],
  ['Educação', ['curso', 'livro', 'faculdade', 'escola', 'mensalidade']],
  ['Lazer', ['cinema', 'bar', 'balada', 'show', 'streaming', 'netflix', 'ingresso', 'viagem']],
  ['Casa', ['aluguel', 'condominio', 'condomínio', 'luz', 'agua', 'água', 'internet', 'gas', 'gás', 'mercado livre']],
  ['Vestuário', ['roupa', 'sapato', 'tenis', 'tênis', 'loja']],
]

const METHOD_KEYWORDS: [string, string[]][] = [
  ['cartao_beneficio', ['beneficio', 'benefício', ' vr ', ' va ', 'alelo', 'ticket', 'sodexo', 'ducz']],
  ['cartao_xp', ['cartao xp', 'cartão xp', 'credito xp', 'crédito xp']],
  ['cartao_mp', ['cartao mp', 'cartão mp', 'cartao mercado pago', 'cartão mercado pago', 'credito mp', 'crédito mp']],
  ['boleto', ['boleto']],
  ['dinheiro', ['dinheiro', 'especie', 'espécie']],
  ['pix', ['pix']],
]

// Perguntas sobre o valor da fatura ("fatura", "quanto tá a fatura", "/fatura"...) — qualquer
// mensagem sem valor extraível que mencione "fatura" é tratada como consulta, não como gasto.
const FATURA_QUERY_KEYWORD = 'fatura'

// Duplicado de propósito (mesma razão do CATEGORY_KEYWORDS acima): esta função roda isolada do
// bundle do frontend. Mantenha em sincronia com getFaturaMonth/nextFaturaMonth/overdueFaturaMonth/
// faturaOpenAmount em src/utils.ts.
const CARDS: { card: 'xp' | 'mp'; label: string; closingDay: number; dueDay: number }[] = [
  { card: 'xp', label: 'XP', closingDay: 2, dueDay: 10 },
  { card: 'mp', label: 'Mercado Pago', closingDay: 9, dueDay: 14 },
]

function addMonths(ym: string, n: number): string {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(y, m - 1 + n, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function getFaturaMonth(dateStr: string, closingDay: number): string {
  const d = new Date(dateStr + 'T12:00:00')
  const day = d.getDate()
  const ym = dateStr.slice(0, 7)
  return day < closingDay ? ym : addMonths(ym, 1)
}

function nextFaturaMonth(closingDay: number): string {
  const today = new Date().toISOString().slice(0, 10)
  return getFaturaMonth(today, closingDay)
}

function faturaOpenAmount(expenses: { method: string; month: string; amount: number }[], card: 'xp' | 'mp', month: string): number {
  const method = card === 'xp' ? 'cartao_xp' : 'cartao_mp'
  const payMethod = card === 'xp' ? 'fatura_xp' : 'fatura_mp'
  const total = expenses.filter((e) => e.method === method && e.month === month).reduce((s, e) => s + e.amount, 0)
  const paid = expenses.filter((e) => e.method === payMethod && e.month === month).reduce((s, e) => s + e.amount, 0)
  return Math.max(0, total - paid)
}

// Mês da fatura já fechada e ainda não paga (olha até 3 meses pra trás a partir da fatura aberta).
function overdueFaturaMonth(expenses: { method: string; month: string; amount: number }[], card: 'xp' | 'mp', closingDay: number): string | null {
  const next = nextFaturaMonth(closingDay)
  for (let i = 1; i <= 3; i++) {
    const m = addMonths(next, -i)
    if (faturaOpenAmount(expenses, card, m) > 0) return m
  }
  return null
}

function monthLabel(m: string): string {
  const [y, mo] = m.split('-')
  const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
  return `${months[parseInt(mo) - 1]}/${y}`
}

function fmtBRL(v: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
}

function describeFaturas(expenses: { method: string; month: string; amount: number }[]): string {
  const lines = CARDS.map(({ card, label, closingDay, dueDay }) => {
    const overdue = overdueFaturaMonth(expenses, card, closingDay)
    if (overdue) {
      const amount = faturaOpenAmount(expenses, card, overdue)
      return `⚠️ ${label}: ${fmtBRL(amount)} — fatura de ${monthLabel(overdue)} fechada, aguardando pagamento (venceu dia ${dueDay}).`
    }
    const open = nextFaturaMonth(closingDay)
    const amount = faturaOpenAmount(expenses, card, open)
    return `💳 ${label}: ${fmtBRL(amount)} em aberto até agora (fecha dia ${String(closingDay).padStart(2, '0')}).`
  })
  return lines.join('\n')
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
}

function extractAmount(text: string): number | null {
  const match = text.match(/(\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)/)
  if (!match) return null
  const raw = match[1].replace(/\.(?=\d{3})/g, '').replace(',', '.')
  const value = parseFloat(raw)
  return isNaN(value) || value <= 0 ? null : value
}

// Detecta "em 2x", "2x", "12x" etc — mesmo padrão que o usuário sempre usa pra parcelamento
// ("Gastei 90,00 no cartão XP em 2x em compra de blusa"). Sem menção de parcela = 1x (à vista).
// Limitado a 2-12x, mesmo teto do seletor manual em Gastos.tsx.
function extractInstallments(text: string): number {
  const match = text.match(/\b(\d{1,2})\s*x\b/i)
  if (!match) return 1
  const n = parseInt(match[1], 10)
  return n >= 2 && n <= 12 ? n : 1
}

function guessCategory(normalized: string): string {
  for (const [category, keywords] of CATEGORY_KEYWORDS) {
    if (keywords.some((k) => normalized.includes(normalize(k)))) return category
  }
  return 'Outros'
}

// Acha a forma de pagamento mencionada e onde a menção termina no texto (índice), pra description
// poder pegar só o que vem DEPOIS dela — ex: "gastei no cartão de crédito corte de cabelo" vira
// description "Corte de cabelo", não o texto inteiro.
function matchMethod(normalized: string): { method: string; keywordEnd: number } | null {
  for (const [method, keywords] of METHOD_KEYWORDS) {
    for (const k of keywords) {
      const nk = normalize(k)
      const idx = normalized.indexOf(nk)
      if (idx !== -1) return { method, keywordEnd: idx + nk.length }
    }
  }
  // Frases genéricas de cartão sem especificar qual — assume XP. Frase mais longa primeiro,
  // pra consumir "cartão de crédito" inteiro em vez de parar só em "cartão".
  for (const generic of ['cartao de credito', 'cartao', 'credito']) {
    const idx = normalized.indexOf(generic)
    if (idx !== -1) return { method: 'cartao_xp', keywordEnd: idx + generic.length }
  }
  return null
}

function guessDescription(rawText: string, amountMatch: string | null): string {
  let desc = rawText
  if (amountMatch) desc = desc.replace(amountMatch, ' ')
  desc = desc
    .replace(/\br\$\s*/gi, ' ')
    .replace(/\breais?\b/gi, ' ')
    .replace(/\bgastei\b|\bpaguei\b|\bcomprei\b/gi, ' ')
    .replace(/\b\d{1,2}\s*x\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!desc) return rawText.trim()
  return desc.charAt(0).toUpperCase() + desc.slice(1)
}

// Quando a forma de pagamento foi mencionada, a description é só o que vem depois dela.
function guessDescriptionAfterMethod(rawText: string, keywordEnd: number, amountMatch: string | null): string {
  let desc = rawText.slice(keywordEnd)
  if (amountMatch) desc = desc.replace(amountMatch, ' ')
  desc = desc
    .replace(/\br\$\s*/gi, ' ')
    .replace(/\breais?\b/gi, ' ')
    .replace(/\b\d{1,2}\s*x\b/gi, ' ')
    .trim()
    // duas passadas: cobre "em 2x em compra" -> remove "2x" -> "em  em compra" -> cada replace tira um "em"
    .replace(/^\b(no|na|do|da|de|em)\b\s+/i, '')
    .replace(/^\b(no|na|do|da|de|em)\b\s+/i, '')
    .trim()
  if (!desc) return rawText.trim()
  return desc.charAt(0).toUpperCase() + desc.slice(1)
}

async function sendTelegramMessage(chatId: number, text: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
  })
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.status(405).send('Method Not Allowed')
    return
  }

  const secretHeader = req.headers['x-telegram-bot-api-secret-token']
  if (!process.env.TELEGRAM_WEBHOOK_SECRET || secretHeader !== process.env.TELEGRAM_WEBHOOK_SECRET) {
    res.status(401).send('Unauthorized')
    return
  }

  const update = req.body
  const message = update?.message
  const chatId = message?.chat?.id
  const text: string | undefined = message?.text
  const senderName: string | null = message?.from?.first_name ?? null

  const allowedChatIds = (process.env.TELEGRAM_ALLOWED_CHAT_ID ?? '')
    .split(',')
    .map((id: string) => id.trim())
    .filter(Boolean)
  if (!chatId || !allowedChatIds.includes(String(chatId))) {
    // Log ajuda a descobrir o chat_id de um grupo novo (ex: ao adicionar mais alguém da família).
    console.log(`[telegram] mensagem ignorada de chat não autorizado: ${chatId} (${senderName ?? 'sem nome'})`)
    res.status(200).json({ ok: true })
    return
  }

  if (!text) {
    res.status(200).json({ ok: true })
    return
  }

  const supabase = createClient(process.env.VITE_SUPABASE_URL as string, process.env.VITE_SUPABASE_ANON_KEY as string)
  const normalized = normalize(text)

  const amount = extractAmount(text)
  if (amount === null) {
    if (normalized.includes(FATURA_QUERY_KEYWORD)) {
      const { data, error: stateError } = await supabase.from('family_state').select('state').eq('id', 'neveinvest').single()
      if (stateError || !data) {
        console.error('[telegram] erro ao buscar estado para consulta de fatura:', stateError)
        await sendTelegramMessage(chatId, 'Deu erro ao consultar a fatura. Tenta de novo em instantes.')
      } else {
        const expenses = ((data.state as any)?.expenses ?? []) as { method: string; month: string; amount: number }[]
        await sendTelegramMessage(chatId, describeFaturas(expenses))
      }
    }
    // Sem valor extraível e sem menção a fatura: pode rolar conversa que não é lançamento — fica quieto.
    res.status(200).json({ ok: true })
    return
  }

  const category = guessCategory(normalized)
  const amountMatch = text.match(/(\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)/)
  const methodMatch = matchMethod(normalized)
  const method = methodMatch?.method ?? 'pix'
  const description = methodMatch
    ? guessDescriptionAfterMethod(text, methodMatch.keywordEnd, amountMatch ? amountMatch[1] : null)
    : guessDescription(text, amountMatch ? amountMatch[1] : null)
  const installments = extractInstallments(text)
  const today = new Date().toISOString().slice(0, 10)

  const { error } = await supabase.from('telegram_drafts').insert({
    status: 'pending',
    raw_text: text,
    guessed_date: today,
    guessed_description: description,
    guessed_amount: amount,
    guessed_method: method,
    guessed_category: category,
    guessed_installments: installments,
    telegram_chat_id: chatId,
    telegram_message_id: message?.message_id ?? null,
    sender_name: senderName,
  })

  if (error) {
    console.error('[telegram] erro ao gravar rascunho:', error)
    await sendTelegramMessage(chatId, 'Deu erro ao salvar o rascunho. Tenta de novo em instantes.')
    res.status(200).json({ ok: true })
    return
  }

  const quem = senderName ? `${senderName} — ` : ''
  const parcelas = installments > 1 ? ` em ${installments}x` : ''
  await sendTelegramMessage(
    chatId,
    `📝 ${quem}rascunho salvo: R$ ${amount.toFixed(2).replace('.', ',')}${parcelas} — ${description} (${category} · ${method})\nRevise e confirme no NeveInvest, aba Rascunhos.`
  )
  res.status(200).json({ ok: true })
}
