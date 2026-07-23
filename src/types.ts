import type { CardId } from './config/cards'

export type PaymentMethod = `cartao_${CardId}` | `fatura_${CardId}` | 'pix' | 'dinheiro' | 'boleto' | 'cartao_beneficio'

export interface BenefitCardCredit {
  id: string
  month: string   // YYYY-MM
  amount: number
  confirmedDate: string // YYYY-MM-DD
}

export interface CardBillPayment {
  id: string
  card: CardId
  amount: number
  date: string // YYYY-MM-DD
  month: string // YYYY-MM — mês em que o pagamento foi feito
}

export interface Expense {
  id: string
  date: string
  description: string
  amount: number
  method: PaymentMethod
  category: string
  month: string // YYYY-MM — para cartão: mês da fatura; demais: mês do gasto
  installments?: number       // total de parcelas (só na 1ª)
  installmentNumber?: number  // número desta parcela (1-based)
  installmentGroup?: string   // ID agrupando todas as parcelas de uma compra
  // Estorno/crédito no cartão (ex: cancelamento de compra). `amount` é NEGATIVO nesses
  // registros — soma naturalmente com as compras do mesmo `method`+`month` e reduz o
  // total da fatura em todos os cálculos existentes (faturaOpenAmount, totalOpenCardSpend
  // etc.), sem precisar de lógica extra em cada lugar que soma gastos de cartão.
  isEstorno?: boolean
}

export interface MonthlyBudget {
  month: string // YYYY-MM
  limit: number
  income: number
}

export interface Income {
  id: string
  description: string
  amount: number
  type: 'fixo' | 'variavel' | 'extraordinario'
  startMonth: string // YYYY-MM — a partir de quando esta renda passa a ser projetada nos meses
}

// Confirmação de recebimento de uma Income num mês específico.
// 'fixo' ganha um IncomeReceipt por mês (recorrente); 'variavel'/'extraordinario'
// recebem no máximo um, em qualquer mês, e depois somem da lista de pendentes.
export interface IncomeReceipt {
  id: string
  incomeId: string
  month: string // YYYY-MM
  receivedDate: string // YYYY-MM-DD
  amount: number
}

export interface Investment {
  id: string
  name: string
  type: 'CDB' | 'Tesouro Direto' | 'LCI' | 'LCA' | 'Poupança' | 'Ações' | 'FII' | 'Outro'
  currentValue: number
  initialValue: number
  startDate: string
  annualRate?: number // % ao ano se conhecido
}

export interface InvestmentRecord {
  id: string
  investmentId: string
  month: string // YYYY-MM
  previousValue: number
  currentValue: number // valor observado sem aporte
}

export type AporteSource = 'salario' | 'bonus' | 'fgts' | 'ferias' | '13salario' | 'judicial' | 'outro'

export interface Aporte {
  id: string
  investmentId: string // existente ou recém-criado
  date: string // YYYY-MM-DD
  amount: number
  source: AporteSource
  description?: string
}

export interface AnnualGoal {
  year: number
  targetValue: number
  judicialExpected: number
  judicialProbability: number // 0-100
}

export interface ExtraordinaryIncome {
  id: string
  description: string
  amount: number
  expectedDate: string // YYYY-MM
  probability: number // 0-100
  received: boolean
  receivedDate?: string
  type: 'fgts' | 'bonus' | '13salario' | 'ferias' | 'judicial' | 'outro'
}

export interface FixedCost {
  id: string
  description: string
  category: string
  defaultAmount: number
  defaultMethod: PaymentMethod
  recurrence: 'continuo' | number // number = total de meses
  startMonth: string // YYYY-MM
  active: boolean
}

// Caixinha de dinheiro guardado para um objetivo (carro, viagem etc). `savedValue` é
// atualizado manualmente pelo usuário em Configurações — não está ligado a saldo/investimentos.
export interface SavingsJar {
  id: string
  name: string
  targetValue: number
  savedValue: number
  createdAt: string // ISO date
}

export interface FixedCostPayment {
  id: string
  fixedCostId: string
  month: string // YYYY-MM
  expenseId: string
  paidAt: string // ISO date
}

export interface InsightSlide {
  type: 'frase' | 'gastos' | 'investimentos' | 'ideia'
  emoji: string
  title: string
  content: string
  highlight?: string // dado numérico em destaque
}

export interface DailyInsights {
  date: string // YYYY-MM-DD
  slides: InsightSlide[]
  generatedAt: string // ISO timestamp
}

export interface AppState {
  expenses: Expense[]
  budgets: MonthlyBudget[]
  incomes: Income[]
  incomeReceipts: IncomeReceipt[]
  investments: Investment[]
  investmentRecords: InvestmentRecord[]
  aportes: Aporte[]
  annualGoal: AnnualGoal
  extraordinaryIncomes: ExtraordinaryIncome[]
  fixedCosts: FixedCost[]
  fixedCostPayments: FixedCostPayment[]
  cardBillPayments: CardBillPayment[]
  dailyInsights: DailyInsights | null
  benefitCardMonthlyAmount: number
  benefitCardCredits: BenefitCardCredit[]
  savingsJars: SavingsJar[]
}
