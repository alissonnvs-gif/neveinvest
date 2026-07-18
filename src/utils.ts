import { CARDS, cardConfig, type CardId } from './config/cards'

export { CARDS, type CardId }

export const fmt = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)

export function addMonths(ym: string, n: number): string {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(y, m - 1 + n, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export const CARD_METHODS = CARDS.map((c) => `cartao_${c.id}`) as `cartao_${CardId}`[]
export const FATURA_METHODS = CARDS.map((c) => `fatura_${c.id}`) as `fatura_${CardId}`[]

export function cardMethod(card: CardId): `cartao_${CardId}` { return `cartao_${card}` }
export function faturaMethod(card: CardId): `fatura_${CardId}` { return `fatura_${card}` }

// A partir de um method ('cartao_itau', 'fatura_mana' etc.) volta pro id do cartão. Usado nos
// pontos que recebem um `method` solto (formulários, edição, rascunhos do Telegram) e precisam
// saber a qual cartão ele pertence — substitui o antigo `method === 'cartao_xp' ? 'xp' : 'mp'`,
// que só fazia sentido com exatamente 2 cartões fixos.
export function cardIdFromMethod(method: string): CardId {
  const found = CARDS.find((c) => method === `cartao_${c.id}` || method === `fatura_${c.id}`)
  return (found ?? CARDS[0]).id
}

// Retorna o mês da fatura (YYYY-MM) para uma compra no cartão: compras ANTES do dia de fechamento
// ficam na fatura deste mês; a partir do dia de fechamento (inclusive) vão para o próximo.
export function getFaturaMonth(dateStr: string, card: CardId): string {
  const closingDay = cardConfig(card).closingDay
  const d = new Date(dateStr + 'T12:00:00')
  const day = d.getDate()
  const ym = dateStr.slice(0, 7)
  return day < closingDay ? ym : addMonths(ym, 1)
}

// Fatura month da próxima fatura a vencer (baseado em hoje)
export function nextFaturaMonth(card: CardId): string {
  const today = new Date().toISOString().slice(0, 10)
  return getFaturaMonth(today, card)
}

// Retorna o mês da fatura já FECHADA (anterior à que está aberta agora) que ainda não foi paga,
// olhando até 3 meses para trás a partir da fatura aberta. Retorna null se não houver nenhuma
// fatura fechada em aberto (tudo já foi pago). Não confundir com "fatura aberta" (nextFaturaMonth):
// uma fatura pode estar fechada (não aceita mais compras) e ainda não paga ao mesmo tempo.
export function overdueFaturaMonth(
  expenses: { method: string; month: string; amount: number }[],
  card: CardId
): string | null {
  const next = nextFaturaMonth(card)
  // Verifica do mais recente ao mais antigo (janela de 3 meses)
  for (let i = 1; i <= 3; i++) {
    const m = addMonths(next, -i)
    if (faturaOpenAmount(expenses, card, m) > 0) return m
  }
  return null
}

export const fmtPct = (v: number) =>
  `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`

export const currentMonth = () => new Date().toISOString().slice(0, 7)

export const monthLabel = (m: string) => {
  const [y, mo] = m.split('-')
  const months = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
  return `${months[parseInt(mo) - 1]}/${y}`
}

export const CDI_MONTHLY = 0.008156 // ~10.75% aa em Jun/2026
export const SELIC_MONTHLY = 0.008156
export const POUPANCA_MONTHLY = 0.005014 // ~6.17% aa
export const IBOVESPA_ANNUAL = 0.12 // referência histórica

// Métodos de cartão (não efetivados ainda — ficam na fatura / saldo benefício)
export const CARD_SPEND_METHODS: string[] = [...CARD_METHODS, 'cartao_beneficio']

// Agrupa valores por período do mês (semana 1: dia 1-7, semana 2: 8-14, semana 3: 15-21, semana 4: 22-31)
// com base na data real da compra (não no mês da fatura)
export function weeklyBuckets(items: { date: string; amount: number }[]): [number, number, number, number] {
  const buckets: [number, number, number, number] = [0, 0, 0, 0]
  items.forEach((it) => {
    const day = parseInt(it.date.slice(8, 10))
    const idx = day <= 7 ? 0 : day <= 14 ? 1 : day <= 21 ? 2 : 3
    buckets[idx] += it.amount
  })
  return buckets
}

export function faturaOpenAmount(expenses: { method: string; month: string; amount: number }[], card: CardId, month: string): number {
  const method = cardMethod(card)
  const payMethod = faturaMethod(card)
  const total = expenses.filter((e) => e.method === method && e.month === month).reduce((s, e) => s + e.amount, 0)
  const paid = expenses.filter((e) => e.method === payMethod && e.month === month).reduce((s, e) => s + e.amount, 0)
  return Math.max(0, total - paid)
}

// Soma o total ainda não pago no cartão, somando faturas já vencidas/atuais em aberto (até o mês da
// próxima fatura de cada cartão) — a meta só reseta quando a fatura é paga, não quando o mês vira.
// Parcelas futuras ainda não vencidas (meses após a próxima fatura) não entram na conta.
export function totalOpenCardSpend(
  expenses: { method: string; month: string; amount: number }[],
  cutoff: Partial<Record<CardId, string>>
): number {
  const months = new Set(expenses.filter((e) => (CARD_METHODS as string[]).includes(e.method)).map((e) => e.month))
  let total = 0
  months.forEach((m) => {
    CARDS.forEach(({ id }) => {
      const cut = cutoff[id]
      if (cut && m <= cut) total += faturaOpenAmount(expenses, id, m)
    })
  })
  return total
}

// Lançamentos individuais de cartão que pertencem a faturas já vencidas/atuais e ainda em aberto (não pagas)
export function openCardExpenseItems<T extends { method: string; month: string; amount: number }>(
  expenses: T[],
  cutoff: Partial<Record<CardId, string>>
): T[] {
  const cardExpenses = expenses.filter((e) => (CARD_METHODS as string[]).includes(e.method))
  const months = new Set(cardExpenses.map((e) => e.month))
  const openMonths = new Set(
    Array.from(months).filter((m) =>
      CARDS.some(({ id }) => {
        const cut = cutoff[id]
        return cut !== undefined && m <= cut && faturaOpenAmount(expenses, id, m) > 0
      })
    )
  )
  return cardExpenses.filter((e) => {
    if (!openMonths.has(e.month)) return false
    const cut = cutoff[cardIdFromMethod(e.method)]
    return cut !== undefined && e.month <= cut
  })
}

// Saldo do Cartão Benefício: carteira contínua, sem fechamento/vencimento — soma todas as
// recargas confirmadas e subtrai todo o histórico de gastos, sem recorte por mês.
export function computeBenefitBalance(state: {
  benefitCardCredits: { amount: number }[]
  expenses: { method: string; amount: number }[]
}): number {
  const totalCredited = (state.benefitCardCredits ?? []).reduce((s, c) => s + c.amount, 0)
  const totalSpent = state.expenses
    .filter((e) => e.method === 'cartao_beneficio')
    .reduce((s, e) => s + e.amount, 0)
  return totalCredited - totalSpent
}

export function computeSaldo(state: {
  incomeReceipts: { amount: number }[]
  extraordinaryIncomes: { received: boolean; amount: number }[]
  expenses: { method: string; amount: number }[]
  cardBillPayments?: { amount: number }[] // mantido para compat, não usado no cálculo
  aportes: { amount: number; source?: string }[]
}): number {
  const totalReceivedIncome = (state.incomeReceipts ?? []).reduce((s, r) => s + r.amount, 0)
  const totalReceivedExtra = (state.extraordinaryIncomes ?? [])
    .filter((e) => e.received)
    .reduce((s, e) => s + e.amount, 0)
  // Gastos efetivos = tudo exceto lançamentos de cartão de crédito
  const totalEffectiveExpenses = state.expenses
    .filter((e) => !CARD_SPEND_METHODS.includes(e.method))
    .reduce((s, e) => s + e.amount, 0)
  // Só aportes com origem 'salario' debitam do saldo (dinheiro saiu da conta)
  // Aportes de outras origens (bonus, fgts, judicial etc.) não passam pela conta
  const totalAportes = (state.aportes ?? [])
    .filter((a) => a.source === 'salario')
    .reduce((s, a) => s + a.amount, 0)

  return totalReceivedIncome + totalReceivedExtra - totalEffectiveExpenses - totalAportes
}

export const monthsRemaining = () => {
  const now = new Date()
  return 12 - now.getMonth() // meses até dez (inclusive mês atual)
}
