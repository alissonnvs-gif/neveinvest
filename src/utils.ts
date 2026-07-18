export const fmt = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)

export function addMonths(ym: string, n: number): string {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(y, m - 1 + n, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

// Retorna o mês da fatura (YYYY-MM) para uma compra no cartão
// XP: fecha dia 02 — compras ANTES do dia 02 ficam na fatura deste mês; a partir do dia 02 (inclusive) vão para o próximo
// MP: fecha dia 09
export function getFaturaMonth(dateStr: string, card: 'xp' | 'mp'): string {
  const closingDay = card === 'xp' ? 2 : 9
  const d = new Date(dateStr + 'T12:00:00')
  const day = d.getDate()
  const ym = dateStr.slice(0, 7)
  return day < closingDay ? ym : addMonths(ym, 1)
}

// Fatura month da próxima fatura a vencer (baseado em hoje)
export function nextFaturaMonth(card: 'xp' | 'mp'): string {
  const today = new Date().toISOString().slice(0, 10)
  return getFaturaMonth(today, card)
}

// Retorna o mês da fatura já FECHADA (anterior à que está aberta agora) que ainda não foi paga,
// olhando até 3 meses para trás a partir da fatura aberta. Retorna null se não houver nenhuma
// fatura fechada em aberto (tudo já foi pago). Não confundir com "fatura aberta" (nextFaturaMonth):
// uma fatura pode estar fechada (não aceita mais compras) e ainda não paga ao mesmo tempo.
export function overdueFaturaMonth(
  expenses: { method: string; month: string; amount: number }[],
  card: 'xp' | 'mp'
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
export const CARD_SPEND_METHODS = ['cartao_xp', 'cartao_mp', 'cartao_beneficio']

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

export function faturaOpenAmount(expenses: { method: string; month: string; amount: number }[], card: 'xp' | 'mp', month: string): number {
  const method = card === 'xp' ? 'cartao_xp' : 'cartao_mp'
  const payMethod = card === 'xp' ? 'fatura_xp' : 'fatura_mp'
  const total = expenses.filter((e) => e.method === method && e.month === month).reduce((s, e) => s + e.amount, 0)
  const paid = expenses.filter((e) => e.method === payMethod && e.month === month).reduce((s, e) => s + e.amount, 0)
  return Math.max(0, total - paid)
}

// Soma o total ainda não pago no cartão, somando faturas já vencidas/atuais em aberto (até o mês da
// próxima fatura de cada cartão) — a meta só reseta quando a fatura é paga, não quando o mês vira.
// Parcelas futuras ainda não vencidas (meses após a próxima fatura) não entram na conta.
export function totalOpenCardSpend(
  expenses: { method: string; month: string; amount: number }[],
  cutoff: { xp: string; mp: string }
): number {
  const months = new Set(expenses.filter((e) => e.method === 'cartao_xp' || e.method === 'cartao_mp').map((e) => e.month))
  let total = 0
  months.forEach((m) => {
    if (m <= cutoff.xp) total += faturaOpenAmount(expenses, 'xp', m)
    if (m <= cutoff.mp) total += faturaOpenAmount(expenses, 'mp', m)
  })
  return total
}

// Lançamentos individuais de cartão que pertencem a faturas já vencidas/atuais e ainda em aberto (não pagas)
export function openCardExpenseItems<T extends { method: string; month: string; amount: number }>(
  expenses: T[],
  cutoff: { xp: string; mp: string }
): T[] {
  const cardExpenses = expenses.filter((e) => e.method === 'cartao_xp' || e.method === 'cartao_mp')
  const months = new Set(cardExpenses.map((e) => e.month))
  const openMonths = new Set(
    Array.from(months).filter((m) =>
      (m <= cutoff.xp && faturaOpenAmount(expenses, 'xp', m) > 0) ||
      (m <= cutoff.mp && faturaOpenAmount(expenses, 'mp', m) > 0)
    )
  )
  return cardExpenses.filter((e) => {
    if (!openMonths.has(e.month)) return false
    const cut = e.method === 'cartao_xp' ? cutoff.xp : cutoff.mp
    return e.month <= cut
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
  // Gastos efetivos = tudo exceto lançamentos de cartão (cartao_xp/mp)
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
