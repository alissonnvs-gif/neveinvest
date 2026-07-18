import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { AppState, Expense, MonthlyBudget, Income, IncomeReceipt, Investment, InvestmentRecord, Aporte, AnnualGoal, ExtraordinaryIncome, FixedCost, FixedCostPayment, CardBillPayment, DailyInsights, BenefitCardCredit } from './types'
import { saveToSupabase } from './lib/supabase'

let saveTimer: ReturnType<typeof setTimeout> | null = null
let syncEnabled = false

export function enableSync() { syncEnabled = true; console.log('[supabase] sync habilitado') }

function scheduleSave(state: Record<string, unknown>) {
  if (!syncEnabled) return
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => saveToSupabase(state), 1500)
}

const CURRENT_MONTH = new Date().toISOString().slice(0, 7)
const CURRENT_YEAR = new Date().getFullYear()

// Converte incomes no formato antigo (vinculadas a um `month`, com `received`/`receivedDate`
// direto no objeto) para o formato novo (template + IncomeReceipt por mês). Idempotente: incomes
// que já têm `startMonth` passam direto, sem reagrupar.
//
// No formato antigo, sem recorrência de verdade, era comum recriar a "mesma" renda todo mês com
// um id novo (ex: "Salário CLT" em jun/2026 e de novo em jul/2026) — isso é exatamente o bug que
// motivou a migração. Por isso agrupamos por tipo+descrição: cada grupo vira UM template só
// (começando no mês mais antigo, com o valor mais recente) e cada lançamento com `received: true`
// dentro do grupo vira um IncomeReceipt naquele mês, preservando o histórico já confirmado.
function migrateIncomes(rawIncomes: any[]): { incomes: Income[]; receipts: IncomeReceipt[] } {
  const alreadyMigrated: Income[] = []
  const legacy: any[] = []
  for (const i of rawIncomes ?? []) {
    if ('startMonth' in i) alreadyMigrated.push(i as Income)
    else legacy.push(i)
  }

  const groups = new Map<string, any[]>()
  for (const i of legacy) {
    const key = `${i.type}::${String(i.description).trim().toLowerCase()}`
    groups.set(key, [...(groups.get(key) ?? []), i])
  }

  const receipts: IncomeReceipt[] = []
  const migrated: Income[] = []
  for (const entries of groups.values()) {
    const sorted = [...entries].sort((a, b) => String(a.month).localeCompare(String(b.month)))
    const earliest = sorted[0]
    const latest = sorted[sorted.length - 1]
    const templateId = crypto.randomUUID()
    migrated.push({
      id: templateId,
      description: latest.description,
      amount: latest.amount,
      type: latest.type,
      startMonth: earliest.month,
    })
    for (const e of entries) {
      if (e.received) {
        receipts.push({
          id: crypto.randomUUID(),
          incomeId: templateId,
          month: e.month,
          receivedDate: e.receivedDate ?? `${e.month}-01`,
          amount: e.amount,
        })
      }
    }
  }

  return { incomes: [...alreadyMigrated, ...migrated], receipts }
}

// Estado inicial em branco — a família preenche tudo pela própria plataforma (Configurações,
// Investimentos, Gastos). Nada de dados de exemplo pré-cadastrados.
const defaultState: AppState = {
  expenses: [],
  budgets: [{ month: CURRENT_MONTH, limit: 0, income: 0 }],
  incomes: [],
  incomeReceipts: [],
  investments: [],
  investmentRecords: [],
  aportes: [],
  annualGoal: {
    year: CURRENT_YEAR,
    targetValue: 0,
    judicialExpected: 0,
    judicialProbability: 0,
  },
  extraordinaryIncomes: [],
  fixedCosts: [],
  fixedCostPayments: [],
  cardBillPayments: [],
  dailyInsights: null,
  benefitCardMonthlyAmount: 0,
  benefitCardCredits: [],
}

interface Store extends AppState {
  hydrate: (remote: Partial<AppState>) => void
  addExpense: (e: Omit<Expense, 'id'>) => void
  updateExpense: (id: string, partial: Partial<Omit<Expense, 'id'>>) => void
  removeExpense: (id: string) => void
  upsertBudget: (b: MonthlyBudget) => void
  addIncome: (i: Omit<Income, 'id'>) => void
  removeIncome: (id: string) => void
  addInvestment: (inv: Omit<Investment, 'id'>) => void
  updateInvestment: (id: string, partial: Partial<Investment>) => void
  removeInvestment: (id: string) => void
  addInvestmentRecord: (r: Omit<InvestmentRecord, 'id'>) => void
  addAporte: (a: Omit<Aporte, 'id'>) => void
  removeAporte: (id: string) => void
  updateAnnualGoal: (g: Partial<AnnualGoal>) => void
  addExtraordinaryIncome: (e: Omit<ExtraordinaryIncome, 'id'>) => void
  updateExtraordinaryIncome: (id: string, partial: Partial<ExtraordinaryIncome>) => void
  removeExtraordinaryIncome: (id: string) => void
  markExtraordinaryReceived: (id: string, receivedDate: string) => void
  addFixedCost: (f: Omit<FixedCost, 'id'>) => void
  updateFixedCost: (id: string, partial: Partial<FixedCost>) => void
  removeFixedCost: (id: string) => void
  addIncomeReceipt: (r: Omit<IncomeReceipt, 'id'>) => void
  removeIncomeReceipt: (id: string) => void
  addFixedCostPayment: (p: Omit<FixedCostPayment, 'id'>) => void
  removeFixedCostPayment: (id: string) => void
  addCardBillPayment: (p: Omit<CardBillPayment, 'id'>) => void
  clearAportes: () => void
  setDailyInsights: (insights: DailyInsights) => void
  hideSaldo: boolean
  toggleHideSaldo: () => void
  setBenefitCardMonthlyAmount: (amount: number) => void
  addBenefitCardCredit: (c: Omit<BenefitCardCredit, 'id'>) => void
  removeBenefitCardCredit: (id: string) => void
}

export const useStore = create<Store>()(
  persist(
    (set) => ({
      ...defaultState,

      // Não usa o estado local (s) como fallback pra incomeReceipts: como o hydrate roda mais de
      // uma vez por carregamento (StrictMode em dev, reconexões etc.), usar `s` faria receipts
      // migrados numa chamada se acumularem por cima dos da chamada seguinte, duplicando valores
      // já recebidos. Cada chamada só enxerga o que já veio salvo em `remote`.
      hydrate: (remote) => set(() => {
        const rawIncomes = (remote as any).incomes
        if (!rawIncomes) return { ...remote }
        const { incomes, receipts } = migrateIncomes(rawIncomes)
        const baseReceipts = remote.incomeReceipts ?? []
        return {
          ...remote,
          incomes,
          incomeReceipts: receipts.length > 0 ? [...baseReceipts, ...receipts] : baseReceipts,
        }
      }),

      addExpense: (e) => set((s) => ({
        expenses: [...s.expenses, { ...e, id: (e as any).id ?? crypto.randomUUID() }],
      })),

      updateExpense: (id, partial) => set((s) => ({
        expenses: s.expenses.map((e) => e.id === id ? { ...e, ...partial } : e),
      })),

      removeExpense: (id) => set((s) => ({
        expenses: s.expenses.filter((e) => e.id !== id),
      })),

      upsertBudget: (b) => set((s) => ({
        budgets: s.budgets.some((x) => x.month === b.month)
          ? s.budgets.map((x) => x.month === b.month ? b : x)
          : [...s.budgets, b],
      })),

      addIncome: (i) => set((s) => ({
        incomes: [...s.incomes, { ...i, id: crypto.randomUUID() }],
      })),

      removeIncome: (id) => set((s) => ({
        incomes: s.incomes.filter((i) => i.id !== id),
        incomeReceipts: (s.incomeReceipts ?? []).filter((r) => r.incomeId !== id),
      })),

      addInvestment: (inv) => set((s) => ({
        investments: [...s.investments, { ...inv, id: (inv as any).id ?? crypto.randomUUID() }],
      })),

      updateInvestment: (id, partial) => set((s) => ({
        investments: s.investments.map((i) => i.id === id ? { ...i, ...partial } : i),
      })),

      removeInvestment: (id) => set((s) => ({
        investments: s.investments.filter((i) => i.id !== id),
      })),

      addInvestmentRecord: (r) => set((s) => ({
        investmentRecords: [...s.investmentRecords, { ...r, id: crypto.randomUUID() }],
      })),

      addAporte: (a) => set((s) => ({
        aportes: [...(s.aportes ?? []), { ...a, id: crypto.randomUUID() }],
        investments: s.investments.map((i) =>
          i.id === a.investmentId ? { ...i, currentValue: i.currentValue + a.amount } : i
        ),
      })),

      removeAporte: (id) => set((s) => {
        const a = s.aportes.find((x) => x.id === id)
        if (!a) return {}
        return {
          aportes: s.aportes.filter((x) => x.id !== id),
          investments: s.investments.map((i) =>
            i.id === a.investmentId ? { ...i, currentValue: i.currentValue - a.amount } : i
          ),
        }
      }),

      updateAnnualGoal: (g) => set((s) => ({
        annualGoal: { ...s.annualGoal, ...g },
      })),

      addExtraordinaryIncome: (e) => set((s) => ({
        extraordinaryIncomes: [...(s.extraordinaryIncomes ?? []), { ...e, id: crypto.randomUUID() }],
      })),

      updateExtraordinaryIncome: (id, partial) => set((s) => ({
        extraordinaryIncomes: (s.extraordinaryIncomes ?? []).map((e) => e.id === id ? { ...e, ...partial } : e),
      })),

      removeExtraordinaryIncome: (id) => set((s) => ({
        extraordinaryIncomes: (s.extraordinaryIncomes ?? []).filter((e) => e.id !== id),
      })),

      markExtraordinaryReceived: (id, receivedDate) => set((s) => ({
        extraordinaryIncomes: (s.extraordinaryIncomes ?? []).map((e) =>
          e.id === id ? { ...e, received: true, receivedDate } : e
        ),
      })),

      addFixedCost: (f) => set((s) => ({
        fixedCosts: [...(s.fixedCosts ?? []), { ...f, id: crypto.randomUUID() }],
      })),

      updateFixedCost: (id, partial) => set((s) => ({
        fixedCosts: (s.fixedCosts ?? []).map((f) => f.id === id ? { ...f, ...partial } : f),
      })),

      removeFixedCost: (id) => set((s) => ({
        fixedCosts: (s.fixedCosts ?? []).filter((f) => f.id !== id),
        fixedCostPayments: (s.fixedCostPayments ?? []).filter((p) => p.fixedCostId !== id),
      })),

      addFixedCostPayment: (p) => set((s) => ({
        fixedCostPayments: [...(s.fixedCostPayments ?? []), { ...p, id: crypto.randomUUID() }],
      })),

      removeFixedCostPayment: (id) => set((s) => ({
        fixedCostPayments: (s.fixedCostPayments ?? []).filter((p) => p.id !== id),
      })),

      addIncomeReceipt: (r) => set((s) => ({
        incomeReceipts: [...(s.incomeReceipts ?? []), { ...r, id: crypto.randomUUID() }],
      })),

      removeIncomeReceipt: (id) => set((s) => ({
        incomeReceipts: (s.incomeReceipts ?? []).filter((r) => r.id !== id),
      })),

      addCardBillPayment: (p) => set((s) => ({
        cardBillPayments: [...(s.cardBillPayments ?? []), { ...p, id: crypto.randomUUID() }],
      })),

      clearAportes: () => set({ aportes: [] }),

      setDailyInsights: (insights) => set({ dailyInsights: insights }),

      hideSaldo: false,
      toggleHideSaldo: () => set((s) => ({ hideSaldo: !s.hideSaldo })),

      setBenefitCardMonthlyAmount: (amount) => set({ benefitCardMonthlyAmount: amount }),

      addBenefitCardCredit: (c) => set((s) => ({
        benefitCardCredits: [...(s.benefitCardCredits ?? []), { ...c, id: crypto.randomUUID() }],
      })),

      removeBenefitCardCredit: (id) => set((s) => ({
        benefitCardCredits: (s.benefitCardCredits ?? []).filter((c) => c.id !== id),
      })),
    }),
    {
      name: 'neveinvest-v2',
      // O Supabase já é a fonte da verdade (App.tsx busca e chama hydrate() em todo carregamento).
      // Sem isso, o localStorage deste navegador podia reidratar por cima do dado fresco da nuvem
      // numa corrida de timing, e depois seria resincronizado — reintroduzindo dado antigo/duplicado
      // em qualquer dispositivo que tivesse um cache local desatualizado.
      skipHydration: true,
    }
  )
)

// Sincroniza com Supabase após cada mudança (debounced 1.5s)
useStore.subscribe((state) => {
  scheduleSave(state as unknown as Record<string, unknown>)
})
