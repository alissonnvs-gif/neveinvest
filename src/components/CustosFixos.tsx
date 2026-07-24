import { useState, useEffect, useRef } from 'react'
import { useStore } from '../store'
import { fmt, currentMonth, monthLabel, addMonths, getFaturaMonth, CARDS, CARD_METHODS, cardMethod, faturaMethod, cardIdFromMethod, faturaOpenAmount, getFaturaLancamentos } from '../utils'
import type { CardId } from '../config/cards'
import type { PaymentMethod, FixedCost, Expense, ExtraordinaryIncome } from '../types'
import CardSpendGoal from './CardSpendGoal'
import ExpenseEditModal from './ExpenseEditModal'
import { showSuccessToast, showErrorToast } from '../lib/toast'
import { supabase } from '../lib/supabase'
import {
  IconBuildingBank, IconLogout, IconClipboardList, IconChevronLeft, IconChevronRight, IconCreditCard,
  IconCheck, IconX, IconPencil,
} from '@tabler/icons-react'

const PAGE_GRADIENT = 'linear-gradient(160deg, #3b82f6, #7c3aed)'

const METHODS: { value: PaymentMethod; label: string; icon: string }[] = [
  ...CARDS.map((c) => ({ value: cardMethod(c.id), label: c.label, icon: '💳' })),
  { value: 'pix', label: 'Pix', icon: '📲' },
  { value: 'dinheiro', label: 'Dinheiro', icon: '💵' },
  { value: 'boleto', label: 'Boleto', icon: '🧾' },
]

const CATEGORIES = ['Alimentação', 'Mercado', 'Saúde', 'Transporte', 'Educação', 'Lazer', 'Casa', 'Vestuário', 'Outros']

const EXTRA_TYPES: { value: ExtraordinaryIncome['type']; label: string; icon: string }[] = [
  { value: 'fgts', label: 'FGTS Aniversário', icon: '🏦' },
  { value: 'bonus', label: 'Bônus', icon: '🎯' },
  { value: '13salario', label: '13º Salário', icon: '📅' },
  { value: 'ferias', label: 'Férias', icon: '🌴' },
  { value: 'judicial', label: 'Processo Judicial', icon: '⚖️' },
  { value: 'outro', label: 'Outro', icon: '💰' },
]


function getEndMonth(cost: FixedCost): string | null {
  if (cost.recurrence === 'continuo') return null
  return addMonths(cost.startMonth, (cost.recurrence as number) - 1)
}

function isActiveInMonth(cost: FixedCost, month: string): boolean {
  if (!cost.active) return false
  if (cost.startMonth > month) return false
  const end = getEndMonth(cost)
  if (end !== null && end < month) return false
  return true
}

export default function CustosFixos() {
  const {
    fixedCosts, fixedCostPayments, expenses, budgets,
    addFixedCost, updateFixedCost, removeFixedCost,
    addFixedCostPayment, removeFixedCostPayment,
    addExpense, removeExpense, updateExpense,
    incomes, addIncome, removeIncome, incomeReceipts, addIncomeReceipt, removeIncomeReceipt,
    extraordinaryIncomes, addExtraordinaryIncome, removeExtraordinaryIncome,
  } = useStore()

  const [payingFatura, setPayingFatura] = useState<{ card: CardId; month: string; amount: number } | null>(null)
  const [faturaPayForm, setFaturaPayForm] = useState({ date: new Date().toISOString().slice(0, 10) })
  const [expandedCard, setExpandedCard] = useState<CardId | null>(null)

  // Custos fixos pagos no cartão são cobrança automática (o cartão debita sozinho todo mês) —
  // diferente de boleto/pix/dinheiro, que dependem de uma ação real do usuário. Por isso, ao
  // contrário desses, eles não pedem confirmação manual: assim que o mês vigente chega, o app
  // já lança a despesa e marca como pago sozinho, sem precisar clicar em "Pagar". Só vale daí
  // pra frente (não preenche meses passados retroativamente) e só roda uma vez por mês por
  // custo (verifica se já existe um FixedCostPayment antes de criar outro).
  //
  // A despesa (Expense.month) vai pro mês da fatura REAL do cartão (getFaturaMonth, baseado no
  // dia de fechamento) — isso mantém "Faturas de cartão" sempre exato. Já o registro de
  // pagamento (FixedCostPayment.month) usa o mês corrente real (currentMonth()), não o mês da
  // fatura — assim o check de "pago" aparece já marcado no Checklist assim que você abre o app
  // no mês vigente, em vez de só aparecer marcado lá na frente quando a fatura fechar.
  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10)
    const thisMonth = currentMonth()

    // Migração: registros de pagamento de custo fixo no cartão criados ANTES desse fix gravaram o
    // mês calendário (não o mês da fatura). Realinha pro mês real do gasto vinculado (fonte da
    // verdade, nunca teve esse problema) — sem isso, a Projeção não reconhece o pagamento antigo e
    // soma o custo de novo, duplicando o valor.
    const live = useStore.getState()
    const costById = new Map(live.fixedCosts.map((c) => [c.id, c]))
    const corrections = live.fixedCostPayments.reduce<Record<string, string>>((acc, p) => {
      const cost = costById.get(p.fixedCostId)
      if (!cost || !CARD_METHODS.includes(cost.defaultMethod as any)) return acc
      const exp = live.expenses.find((e) => e.id === p.expenseId)
      if (exp && exp.month !== p.month) acc[p.id] = exp.month
      return acc
    }, {})
    if (Object.keys(corrections).length > 0) {
      useStore.setState((s) => ({
        fixedCostPayments: s.fixedCostPayments.map((p) => (corrections[p.id] ? { ...p, month: corrections[p.id] } : p)),
      }))
    }

    fixedCosts.forEach((cost) => {
      if (!CARD_METHODS.includes(cost.defaultMethod as any)) return
      if (!isActiveInMonth(cost, thisMonth)) return
      const card = cardIdFromMethod(cost.defaultMethod)
      const expMonth = getFaturaMonth(today, card)
      // Lê o estado ao vivo (já com a correção da migração acima aplicada) pra não duplicar em
      // re-execuções do efeito (ex: StrictMode em dev). Checa pelo mês da FATURA (igual a
      // Expense.month), não pelo mês calendário — perto do dia de fechamento, duas rodadas em
      // calendários diferentes podem cair na MESMA fatura, e isso não pode gerar cobrança em dobro.
      const alreadyGenerated = useStore.getState().fixedCostPayments.some((p) => p.fixedCostId === cost.id && p.month === expMonth)
      if (alreadyGenerated) return
      const expId = crypto.randomUUID()
      addExpense({
        id: expId,
        date: today,
        description: cost.description,
        amount: cost.defaultAmount,
        method: cost.defaultMethod,
        category: cost.category,
        month: expMonth,
      } as any)
      addFixedCostPayment({
        fixedCostId: cost.id,
        month: expMonth,
        expenseId: expId,
        paidAt: new Date().toISOString(),
      })
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fixedCosts])

  const [receiveDate, setReceiveDate] = useState(new Date().toISOString().slice(0, 10))
  const [receivingId, setReceivingId] = useState<string | null>(null)
  const [receivingAmount, setReceivingAmount] = useState('')

  const [incomeForm, setIncomeForm] = useState({ description: '', amount: '', type: 'fixo' as 'fixo' | 'variavel' | 'extraordinario' })
  const [showExtraForm, setShowExtraForm] = useState(false)
  const [extraForm, setExtraForm] = useState({
    description: '',
    amount: '',
    expectedDate: '',
    probability: '80',
    type: 'fgts' as ExtraordinaryIncome['type'],
  })

  function handleAddIncome(ev: React.FormEvent) {
    ev.preventDefault()
    if (!incomeForm.description || !incomeForm.amount) {
      showErrorToast('Preencha descrição e valor da renda.')
      return
    }
    addIncome({ startMonth: currentMonth(), description: incomeForm.description, amount: parseFloat(incomeForm.amount), type: incomeForm.type })
    showSuccessToast(`Renda "${incomeForm.description}" cadastrada.`)
    setIncomeForm((f) => ({ ...f, description: '', amount: '' }))
  }

  function handleAddExtra(ev: React.FormEvent) {
    ev.preventDefault()
    if (!extraForm.description || !extraForm.amount || !extraForm.expectedDate) {
      showErrorToast('Preencha descrição, valor e mês previsto.')
      return
    }
    addExtraordinaryIncome({
      description: extraForm.description,
      amount: parseFloat(extraForm.amount),
      expectedDate: extraForm.expectedDate,
      probability: parseFloat(extraForm.probability),
      received: false,
      type: extraForm.type,
    })
    showSuccessToast(`Receita extraordinária "${extraForm.description}" cadastrada.`)
    setExtraForm({ description: '', amount: '', expectedDate: '', probability: '80', type: 'fgts' })
    setShowExtraForm(false)
  }
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null)

  // Fatura aberta / lançamentos de um cartão em determinado mês — lógica compartilhada em utils.ts
  // (evita reimplementação local divergente da mesma conta usada em Dashboard/Gastos)
  const getFaturaAberta = (card: CardId, fatMonth: string) => faturaOpenAmount(expenses, card, fatMonth)
  const getFaturaLancamentosLocal = (card: CardId, fatMonth: string) => getFaturaLancamentos(expenses, card, fatMonth)

  function handlePagarFatura() {
    if (!payingFatura) return
    const cardLabel = CARDS.find((c) => c.id === payingFatura.card)!.label
    const method: PaymentMethod = faturaMethod(payingFatura.card)
    addExpense({
      date: faturaPayForm.date,
      description: `Pagamento Fatura ${cardLabel}`,
      amount: payingFatura.amount,
      method,
      category: 'Outros',
      month: payingFatura.month,
    })
    showSuccessToast(`Fatura ${cardLabel} de ${fmt(payingFatura.amount)} paga.`)
    setPayingFatura(null)
  }

  const [selectedMonth, setSelectedMonth] = useState(currentMonth())

  // Rendas projetadas no mês selecionado: 'fixo' aparece todo mês (pendente até confirmar aquele
  // mês específico); 'variavel'/'extraordinario' aparece em qualquer mês até ser confirmada uma
  // única vez — depois disso some da lista (é um evento único, não recorrente).
  const monthIncomes = incomes
    .filter((i) => i.startMonth <= selectedMonth)
    .map((income) => {
      const receipt = (incomeReceipts ?? []).find((r) => r.incomeId === income.id && r.month === selectedMonth)
      return { income, receipt }
    })
    .filter(({ income, receipt }) => {
      if (income.type === 'fixo') return true
      if (receipt) return true
      const receivedElsewhere = (incomeReceipts ?? []).some((r) => r.incomeId === income.id)
      return !receivedElsewhere
    })

  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [payingCost, setPayingCost] = useState<FixedCost | null>(null)
  const [activeSection, setActiveSection] = useState<'checklist' | 'gerenciar' | 'projecao'>('checklist')

  // Rola até o formulário sozinho quando ele abre (tanto pelo "+ Novo" quanto pelo "Editar"),
  // pra não precisar rolar a página manualmente pra achar os campos.
  const formRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (showForm) formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [showForm])

  const emptyForm = {
    description: '',
    category: 'Casa',
    defaultAmount: '',
    defaultMethod: 'boleto' as PaymentMethod,
    recurrence: 'continuo' as 'continuo' | string,
    recurrenceMonths: '12',
    startMonth: currentMonth(),
  }
  const [form, setForm] = useState(emptyForm)

  const emptyPayForm = { amount: '', method: 'boleto' as PaymentMethod, date: new Date().toISOString().slice(0, 10) }
  const [payForm, setPayForm] = useState(emptyPayForm)

  // Projected amount for a cost: mean of last 3 payments, fallback to defaultAmount
  function projectedAmount(cost: FixedCost): number {
    const paid = fixedCostPayments
      .filter((p) => p.fixedCostId === cost.id)
      .sort((a, b) => b.month.localeCompare(a.month))
      .slice(0, 3)
    if (paid.length === 0) return cost.defaultAmount
    const exps = paid.map((p) => expenses.find((e) => e.id === p.expenseId)?.amount ?? cost.defaultAmount)
    return exps.reduce((s, v) => s + v, 0) / exps.length
  }

  function isPaid(costId: string, month: string) {
    return fixedCostPayments.find((p) => p.fixedCostId === costId && p.month === month)
  }

  const activeCosts = (fixedCosts ?? []).filter((c) => isActiveInMonth(c, selectedMonth))

  const totalFaturaAberta = CARDS.reduce((s, c) => s + getFaturaAberta(c.id, selectedMonth), 0)
  const totalProjected = activeCosts.reduce((s, c) => s + projectedAmount(c), 0) + totalFaturaAberta
  const totalPaid = activeCosts.filter((c) => isPaid(c.id, selectedMonth)).reduce((s, c) => {
    const p = isPaid(c.id, selectedMonth)!
    return s + (expenses.find((e) => e.id === p.expenseId)?.amount ?? 0)
  }, 0)
  const totalPending = activeCosts.filter((c) => !isPaid(c.id, selectedMonth)).reduce((s, c) => s + projectedAmount(c), 0) + totalFaturaAberta

  function handleSave() {
    const amount = parseFloat(String(form.defaultAmount).replace(',', '.'))
    if (!form.description || !amount) {
      showErrorToast('Preencha descrição e valor antes de salvar.')
      return
    }
    const data: Omit<FixedCost, 'id'> = {
      description: form.description,
      category: form.category,
      defaultAmount: amount,
      defaultMethod: form.defaultMethod,
      recurrence: form.recurrence === 'continuo' ? 'continuo' : parseInt(form.recurrenceMonths),
      startMonth: form.startMonth,
      active: true,
    }
    if (editingId) {
      updateFixedCost(editingId, data)
      setEditingId(null)
      showSuccessToast('Custo fixo atualizado.')
    } else {
      addFixedCost(data)
      showSuccessToast('Custo fixo cadastrado.')
    }
    setForm(emptyForm)
    setShowForm(false)
  }

  function startEdit(cost: FixedCost) {
    setForm({
      description: cost.description,
      category: cost.category,
      defaultAmount: String(cost.defaultAmount),
      defaultMethod: cost.defaultMethod,
      recurrence: cost.recurrence === 'continuo' ? 'continuo' : 'limitado',
      recurrenceMonths: cost.recurrence === 'continuo' ? '12' : String(cost.recurrence),
      startMonth: cost.startMonth,
    })
    setEditingId(cost.id)
    setShowForm(true)
    setActiveSection('gerenciar')
  }

  function openPayModal(cost: FixedCost) {
    setPayingCost(cost)
    setPayForm({
      amount: String(projectedAmount(cost).toFixed(2)),
      method: cost.defaultMethod,
      date: new Date().toISOString().slice(0, 10),
    })
  }

  function handlePay() {
    if (!payingCost) return
    const amount = parseFloat(String(payForm.amount).replace(',', '.'))
    if (!amount) {
      showErrorToast('Valor inválido para confirmar pagamento.')
      return
    }
    const expId = crypto.randomUUID()
    const isCard = CARD_METHODS.includes(payForm.method as any)
    const expMonth = isCard ? getFaturaMonth(payForm.date, cardIdFromMethod(payForm.method)) : selectedMonth
    addExpense({
      id: expId,
      date: payForm.date,
      description: payingCost.description,
      amount,
      method: payForm.method,
      category: payingCost.category,
      month: expMonth,
    } as any)
    addFixedCostPayment({
      fixedCostId: payingCost.id,
      month: expMonth,
      expenseId: expId,
      paidAt: new Date().toISOString(),
    })
    showSuccessToast(`${payingCost.description} pago (${fmt(amount)}).`)
    setPayingCost(null)
  }

  function handleUnpay(costId: string) {
    const payment = isPaid(costId, selectedMonth)
    if (!payment) return
    removeExpense(payment.expenseId)
    removeFixedCostPayment(payment.id)
    showSuccessToast('Pagamento desfeito.')
  }

  // Projeção: próximos 6 meses
  const projectionMonths = Array.from({ length: 6 }, (_, i) => addMonths(currentMonth(), i))

  // Navegação entre meses
  const prevMonth = addMonths(selectedMonth, -1)
  const nextMonth = addMonths(selectedMonth, 1)

  const paidPct = totalProjected > 0 ? Math.min(100, (totalPaid / totalProjected) * 100) : 0
  const ringR = 44
  const ringC = 2 * Math.PI * ringR
  const ringOffset = ringC - (paidPct / 100) * ringC

  return (
    <div className="space-y-4">
      {/* Cabeçalho colorido com onda */}
      <div className="relative -mx-4 px-4 pt-4 overflow-hidden" style={{ background: PAGE_GRADIENT }}>
        <div className="relative flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <span className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
              <IconBuildingBank size={17} color="#fff" />
            </span>
            <span className="font-bold text-sm text-white">NeveInvest</span>
          </div>
          <button onClick={() => supabase.auth.signOut()} className="w-8 h-8 rounded-full bg-white/15 flex items-center justify-center text-white/90" title="Sair">
            <IconLogout size={15} />
          </button>
        </div>

        <div className="relative flex items-center justify-between gap-3 mb-4">
          <div className="flex-1">
            <div className="text-[11px] text-white/80">Projetado — {monthLabel(selectedMonth)} · {(fixedCosts ?? []).filter((c) => c.active).length} ativos</div>
            <div className="text-2xl font-extrabold text-white">{fmt(totalProjected)}</div>
            <div className="text-[11px] text-white/70 mt-0.5">pago {fmt(totalPaid)} · pendente {fmt(totalPending)}</div>
          </div>
          <svg width={100} height={100} viewBox="0 0 100 100" className="flex-shrink-0">
            <circle cx={50} cy={50} r={ringR} fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth={9} />
            <circle cx={50} cy={50} r={ringR} fill="none" stroke="#fff" strokeWidth={9} strokeLinecap="round" strokeDasharray={ringC} strokeDashoffset={ringOffset} transform="rotate(-90 50 50)" />
            <text x="50%" y="47%" textAnchor="middle" dominantBaseline="central" className="fill-white font-extrabold" style={{ fontSize: 17 }}>{paidPct.toFixed(0)}%</text>
            <text x="50%" y="65%" textAnchor="middle" dominantBaseline="central" className="fill-white/80" style={{ fontSize: 8 }}>pago</text>
          </svg>
        </div>

        <div className="relative flex gap-1.5 mb-4">
          {(['checklist', 'gerenciar', 'projecao'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setActiveSection(s)}
              className={`flex-1 py-1.5 rounded-full text-xs font-medium transition-colors
                ${activeSection === s ? 'bg-white text-slate-900' : 'bg-white/15 text-white hover:bg-white/25'}`}
            >
              {s === 'checklist' ? 'Checklist' : s === 'gerenciar' ? 'Gerenciar' : 'Projeção'}
            </button>
          ))}
        </div>

        <div className="h-16" />
        <svg viewBox="0 0 320 74" className="absolute left-0 right-0 bottom-0 w-full block pointer-events-none" style={{ height: 74 }} preserveAspectRatio="none">
          <path d="M0,8 C 70,8 95,58 175,52 C 255,47 260,4 320,10 L320,74 L0,74 Z" fill="#18132e" />
        </svg>
      </div>

      {/* Corpo com leve degradê sutil */}
      <div className="-mx-4 px-4" style={{ background: 'linear-gradient(180deg, #18132e 0%, rgba(52,43,84,0.55) 22%, #18132e 100%)' }}>
      <div className="space-y-4 pt-1">

      {/* ── CHECKLIST DO MÊS ── */}
      {activeSection === 'checklist' && (
        <div className="space-y-4">
          {/* Seletor de mês */}
          <div className="rounded-3xl p-4" style={{ background: 'rgba(45,212,191,0.08)', border: '1px solid rgba(45,212,191,0.2)' }}>
            <div className="flex items-center justify-between">
              <button onClick={() => setSelectedMonth(prevMonth)} className="text-slate-400 hover:text-slate-200 w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center"><IconChevronLeft size={15} /></button>
              <span className="font-bold text-[13px] text-slate-100 capitalize">{monthLabel(selectedMonth)}</span>
              <button onClick={() => setSelectedMonth(nextMonth)} className="text-slate-400 hover:text-slate-200 w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center"><IconChevronRight size={15} /></button>
            </div>
          </div>

          {/* Rendas do mês selecionado */}
          <div className="rounded-3xl p-4" style={{ background: 'rgba(93,202,165,0.08)', border: '1px solid rgba(93,202,165,0.2)' }}>
            <h2 className="font-bold text-[13px] text-slate-100 mb-3">Rendas — {monthLabel(selectedMonth)}</h2>
            {monthIncomes.length === 0 ? (
              <p className="text-slate-500 text-sm text-center py-2">Nenhuma renda cadastrada para {monthLabel(selectedMonth)}.</p>
            ) : (
              <div className="space-y-2">
                {monthIncomes.map(({ income, receipt }) => {
                  const isConfirming = receivingId === income.id
                  return (
                    <div key={income.id} className={`rounded-lg px-3 py-2 ${receipt ? 'bg-emerald-900/20 border border-emerald-800/40' : 'bg-slate-700'}`}>
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-sm text-slate-200">{income.description}</div>
                          <div className="text-xs text-slate-400">
                            {receipt
                              ? `Recebido em ${new Date(receipt.receivedDate + 'T12:00:00').toLocaleDateString('pt-BR')}`
                              : 'Pendente'}
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className={`font-medium text-sm ${receipt ? 'text-emerald-400' : 'text-slate-400'}`}>{fmt(receipt ? receipt.amount : income.amount)}</span>
                          {receipt ? (
                            <button onClick={() => { removeIncomeReceipt(receipt.id); showSuccessToast('Recebimento desfeito.') }} className="text-xs text-slate-500 hover:text-amber-400" title="Desfazer">↩</button>
                          ) : (
                            <button
                              onClick={() => { setReceivingId(income.id); setReceivingAmount(String(income.amount)) }}
                              className="text-xs bg-emerald-700 hover:bg-emerald-600 text-white px-2 py-1 rounded font-medium"
                            >
                              Receber
                            </button>
                          )}
                        </div>
                      </div>

                      {isConfirming && (
                        <div className="mt-2 pt-2 border-t border-slate-600 space-y-2">
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="text-xs text-slate-400 block mb-1">Valor recebido (R$)</label>
                              <input type="number" step="0.01" value={receivingAmount} onChange={(e) => setReceivingAmount(e.target.value)}
                                className="w-full bg-slate-600 rounded px-2 py-1.5 text-sm text-slate-200 border border-slate-500" autoFocus />
                            </div>
                            <div>
                              <label className="text-xs text-slate-400 block mb-1">Data</label>
                              <input type="date" value={receiveDate} onChange={(e) => setReceiveDate(e.target.value)}
                                className="w-full bg-slate-600 rounded px-2 py-1.5 text-sm text-slate-200 border border-slate-500" />
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <button onClick={() => {
                              const amt = parseFloat(receivingAmount.replace(',', '.'))
                              if (!amt) {
                                showErrorToast('Valor inválido para confirmar recebimento.')
                                return
                              }
                              addIncomeReceipt({ incomeId: income.id, month: selectedMonth, receivedDate: receiveDate, amount: amt })
                              showSuccessToast(`Recebimento de ${fmt(amt)} confirmado.`)
                              setReceivingId(null)
                            }}
                              className="flex-1 bg-emerald-600 hover:bg-emerald-500 py-1.5 rounded text-xs font-medium">Confirmar</button>
                            <button onClick={() => setReceivingId(null)} className="flex-1 bg-slate-600 hover:bg-slate-500 py-1.5 rounded text-xs">Cancelar</button>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Meta de gastos no cartão (slim) */}
          <div className="rounded-3xl p-3.5" style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.22)' }}>
            <CardSpendGoal
              slim
              spent={totalFaturaAberta}
              limit={[...budgets].sort((a, b) => b.month.localeCompare(a.month))[0]?.limit || 8000}
              monthLabelText={monthLabel(selectedMonth)}
            />
          </div>

          {/* Faturas de Cartão — seção destacada */}
          {(() => {
            const faturaMonth = selectedMonth
            return (
              <div className="rounded-3xl p-4" style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.22)' }}>
                <div className="flex items-center gap-2 mb-3">
                  <IconCreditCard size={14} color="#fbbf24" />
                  <span className="text-amber-400 font-bold text-[13px]">Faturas de cartão</span>
                  <span className="text-xs text-amber-600">{monthLabel(faturaMonth)}</span>
                </div>
                <div className="space-y-2">
                  {CARDS.map(({ id: card, label, closingDay, dueDay }) => {
                    const amount = getFaturaAberta(card, faturaMonth)
                    const isPaid = amount === 0 &&
                      expenses.some((e) => e.method === faturaMethod(card) && e.month === faturaMonth)
                    const lancamentos = getFaturaLancamentosLocal(card, faturaMonth)
                    const isExpanded = expandedCard === card
                    return (
                      <div key={card} className={`rounded-2xl overflow-hidden border
                        ${isPaid ? 'bg-emerald-900/30 border-emerald-800/40' : 'bg-amber-900/20 border-amber-800/30'}`}>
                        <div className="px-3 py-3 flex items-center gap-3">
                          <button
                            onClick={() => lancamentos.length > 0 && setExpandedCard(isExpanded ? null : card)}
                            disabled={lancamentos.length === 0}
                            className="flex-1 min-w-0 text-left flex items-center gap-2"
                          >
                            {lancamentos.length > 0 && (
                              <span className={`text-slate-500 text-xs transition-transform ${isExpanded ? 'rotate-90' : ''}`}>▶</span>
                            )}
                            <div className="min-w-0">
                              <div className={`text-sm font-medium ${isPaid ? 'text-slate-400' : 'text-amber-200'}`}>{label}</div>
                              <div className="text-xs text-slate-500">
                                Fecha dia {String(closingDay).padStart(2,'0')} · Vence dia {String(dueDay).padStart(2,'0')}
                                {lancamentos.length > 0 && ` · ${lancamentos.length} lançamento${lancamentos.length > 1 ? 's' : ''}`}
                              </div>
                            </div>
                          </button>
                          <div className="text-right flex-shrink-0 mr-2">
                            <div className={`text-sm font-bold ${isPaid ? 'text-emerald-400' : amount > 0 ? 'text-amber-300' : 'text-slate-500'}`}>
                              {isPaid ? 'Pago' : fmt(amount)}
                            </div>
                          </div>
                          {!isPaid && amount > 0 && (
                            <button
                              onClick={() => setPayingFatura({ card, month: faturaMonth, amount })}
                              className="text-xs bg-amber-700 hover:bg-amber-600 text-white px-3 py-1.5 rounded font-medium flex-shrink-0"
                            >
                              Pagar
                            </button>
                          )}
                          {isPaid && <span className="text-emerald-500 text-lg flex-shrink-0">✓</span>}
                          {!isPaid && amount === 0 && <span className="text-slate-600 text-xs flex-shrink-0">sem gastos</span>}
                        </div>

                        {isExpanded && lancamentos.length > 0 && (
                          <div className="border-t border-amber-800/30 bg-slate-900/40 px-3 py-2 space-y-1.5">
                            {lancamentos.map((e) => (
                              <div key={e.id} className="flex items-center justify-between text-xs">
                                <div className="min-w-0 pr-2">
                                  <div className="text-slate-300 truncate">{e.isEstorno ? '↩️ ' : ''}{e.description}</div>
                                  <div className="text-slate-500">
                                    {new Date(e.date + 'T12:00:00').toLocaleDateString('pt-BR')} · {e.isEstorno ? 'Estorno' : e.category}
                                    {e.installments && e.installments > 1 && ` · ${e.installmentNumber}/${e.installments}`}
                                  </div>
                                </div>
                                <div className="flex items-center gap-2 flex-shrink-0">
                                  <div className={`font-medium ${e.isEstorno ? 'text-emerald-400' : 'text-amber-300'}`}>{fmt(e.amount)}</div>
                                  <button onClick={() => setEditingExpense(e)} className="text-slate-500 hover:text-blue-400" title="Editar"><IconPencil size={12} /></button>
                                  <button onClick={() => { removeExpense(e.id); showSuccessToast('Lançamento removido.') }} className="text-slate-500 hover:text-red-400"><IconX size={12} /></button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })()}

          {/* Lista de custos do mês */}
          <div className="rounded-3xl p-4" style={{ background: 'rgba(124,58,237,0.08)', border: '1px solid rgba(124,58,237,0.2)' }}>
            {activeCosts.length === 0 ? (
              <p className="text-slate-500 text-sm text-center py-6">
                Nenhum custo fixo ativo neste mês.<br />
                <span className="text-xs">Cadastre em "Gerenciar".</span>
              </p>
            ) : (
              <div className="space-y-2">
                {activeCosts.map((cost) => {
                  const payment = isPaid(cost.id, selectedMonth)
                  const paidExpense = payment ? expenses.find((e) => e.id === payment.expenseId) : null
                  const projected = projectedAmount(cost)
                  // Custo no cartão é cobrança automática — mostra sempre como pago, em qualquer
                  // mês (inclusive futuro), já que não depende de ação nenhuma sua. O registro real
                  // (payment/paidExpense) só existe de fato quando o mês vira o mês corrente (efeito
                  // acima), mas visualmente não faz sentido mostrar "pendente" num mês que o cartão
                  // vai cobrar sozinho de qualquer forma.
                  const isCardCost = CARD_METHODS.includes(cost.defaultMethod as any)
                  const showAsPaid = isCardCost || !!payment

                  return (
                    <div
                      key={cost.id}
                      className={`flex items-center gap-3 rounded-2xl px-3 py-3 transition-colors
                        ${showAsPaid ? 'bg-emerald-900/30 border border-emerald-800/50' : 'bg-slate-700'}`}
                    >
                      <button
                        onClick={() => payment ? handleUnpay(cost.id) : (isCardCost ? undefined : openPayModal(cost))}
                        disabled={isCardCost && !payment}
                        className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors
                          ${showAsPaid ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-slate-500 hover:border-emerald-400'}
                          ${isCardCost && !payment ? 'cursor-default' : ''}`}
                      >
                        {showAsPaid && <span className="text-xs">✓</span>}
                      </button>

                      <div className="flex-1 min-w-0">
                        <div className={`text-sm font-medium ${showAsPaid ? 'text-slate-400 line-through' : 'text-slate-200'}`}>
                          {cost.description}
                        </div>
                        <div className="text-xs text-slate-500">
                          {cost.category} · {METHODS.find((m) => m.value === cost.defaultMethod)?.icon}
                          {paidExpense ? ` · pago ${fmt(paidExpense.amount)}` : isCardCost ? ' · automático' : ''}
                        </div>
                      </div>

                      <div className="text-right flex-shrink-0">
                        <div className={`text-sm font-semibold ${showAsPaid ? 'text-emerald-400' : 'text-slate-200'}`}>
                          {fmt(paidExpense?.amount ?? projected)}
                        </div>
                        {!payment && !isCardCost && cost.defaultAmount !== projected && (
                          <div className="text-xs text-slate-500">média</div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── GERENCIAR ── */}
      {activeSection === 'gerenciar' && (
        <div className="space-y-4">
          <div className="rounded-3xl p-4" style={{ background: 'rgba(124,58,237,0.08)', border: '1px solid rgba(124,58,237,0.2)' }}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-bold text-[13px] text-slate-100">Custos cadastrados</h2>
              <button
                onClick={() => { setShowForm(!showForm); setEditingId(null); setForm(emptyForm) }}
                className="bg-emerald-600 hover:bg-emerald-500 px-3 py-1.5 rounded-full text-sm font-medium"
              >
                + Novo
              </button>
            </div>

            {(fixedCosts ?? []).length === 0 && !showForm && (
              <p className="text-slate-500 text-sm text-center py-4">Nenhum custo fixo cadastrado ainda.</p>
            )}

            <div className="space-y-2">
              {(fixedCosts ?? []).map((cost) => {
                const end = getEndMonth(cost)
                return (
                  <div key={cost.id} className="bg-slate-700 rounded-2xl px-3 py-2.5 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`text-sm font-medium ${cost.active ? 'text-slate-200' : 'text-slate-500'}`}>
                          {cost.description}
                        </span>
                        {!cost.active && <span className="text-xs bg-slate-600 text-slate-400 px-1.5 py-0.5 rounded">inativo</span>}
                      </div>
                      <div className="text-xs text-slate-400">
                        {cost.category} · {fmt(cost.defaultAmount)} ·{' '}
                        {cost.recurrence === 'continuo'
                          ? 'contínuo'
                          : `${cost.recurrence}x (até ${monthLabel(end!)})`}
                      </div>
                    </div>
                    <div className="flex gap-2 flex-shrink-0">
                      <button
                        onClick={() => { updateFixedCost(cost.id, { active: !cost.active }); showSuccessToast(cost.active ? 'Custo fixo pausado.' : 'Custo fixo reativado.') }}
                        className="text-xs text-slate-400 hover:text-slate-200 px-2 py-1 bg-slate-600 rounded"
                      >
                        {cost.active ? 'Pausar' : 'Ativar'}
                      </button>
                      <button onClick={() => startEdit(cost)} className="text-xs text-blue-400 hover:text-blue-300 px-2 py-1 bg-slate-600 rounded">
                        Editar
                      </button>
                      <button
                        onClick={() => { if (confirm(`Remover "${cost.description}"?`)) { removeFixedCost(cost.id); showSuccessToast('Custo fixo removido.') } }}
                        className="text-xs text-red-400 hover:text-red-300 px-2 py-1 bg-slate-600 rounded"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Formulário de cadastro/edição */}
          {showForm && (
            <div ref={formRef} className="rounded-3xl p-4" style={{ background: 'rgba(217,70,239,0.08)', border: '1px solid rgba(217,70,239,0.2)' }}>
              <h2 className="font-bold text-[13px] text-slate-100 mb-3">
                {editingId ? 'Editar custo fixo' : 'Novo custo fixo'}
              </h2>
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Descrição</label>
                  <input
                    type="text"
                    value={form.description}
                    onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                    placeholder="Ex: Conta de luz, Internet, Escola..."
                    className="w-full bg-slate-700 rounded px-3 py-2 text-sm text-slate-200 border border-slate-600"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">Categoria</label>
                    <select
                      value={form.category}
                      onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                      className="w-full bg-slate-700 rounded px-3 py-2 text-sm text-slate-200 border border-slate-600"
                    >
                      {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">Valor padrão (R$)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={form.defaultAmount}
                      onChange={(e) => setForm((f) => ({ ...f, defaultAmount: e.target.value }))}
                      placeholder="0,00"
                      className="w-full bg-slate-700 rounded px-3 py-2 text-sm text-slate-200 border border-slate-600"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs text-slate-400 block mb-1">Forma de pagamento padrão</label>
                  <div className="grid grid-cols-4 gap-1">
                    {METHODS.map((m) => (
                      <button
                        key={m.value}
                        type="button"
                        onClick={() => setForm((f) => ({ ...f, defaultMethod: m.value }))}
                        className={`py-1.5 rounded text-xs font-medium transition-colors
                          ${form.defaultMethod === m.value
                            ? 'bg-emerald-600 text-white'
                            : 'bg-slate-700 text-slate-400 hover:bg-slate-600'}`}
                      >
                        {m.icon} {m.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">Recorrência</label>
                    <select
                      value={form.recurrence}
                      onChange={(e) => setForm((f) => ({ ...f, recurrence: e.target.value }))}
                      className="w-full bg-slate-700 rounded px-3 py-2 text-sm text-slate-200 border border-slate-600"
                    >
                      <option value="continuo">Contínuo (sem fim)</option>
                      <option value="limitado">Número fixo de meses</option>
                    </select>
                  </div>
                  {form.recurrence === 'limitado' && (
                    <div>
                      <label className="text-xs text-slate-400 block mb-1">Quantos meses?</label>
                      <input
                        type="number"
                        min="1"
                        value={form.recurrenceMonths}
                        onChange={(e) => setForm((f) => ({ ...f, recurrenceMonths: e.target.value }))}
                        className="w-full bg-slate-700 rounded px-3 py-2 text-sm text-slate-200 border border-slate-600"
                      />
                    </div>
                  )}
                </div>

                <div>
                  <label className="text-xs text-slate-400 block mb-1">Começa em</label>
                  <input
                    type="month"
                    value={form.startMonth}
                    onChange={(e) => setForm((f) => ({ ...f, startMonth: e.target.value }))}
                    className="w-full bg-slate-700 rounded px-3 py-2 text-sm text-slate-200 border border-slate-600"
                  />
                </div>

                {form.recurrence === 'limitado' && form.recurrenceMonths && (
                  <div className="text-xs text-slate-400 bg-slate-700/50 rounded px-3 py-2">
                    Vai de <strong>{monthLabel(form.startMonth)}</strong> até{' '}
                    <strong>{monthLabel(addMonths(form.startMonth, parseInt(form.recurrenceMonths) - 1))}</strong>
                    {' '}({form.recurrenceMonths} meses)
                  </div>
                )}

                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => { setShowForm(false); setEditingId(null); setForm(emptyForm) }}
                    className="flex-1 bg-slate-700 hover:bg-slate-600 py-2 rounded-full text-sm"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleSave}
                    className="flex-1 bg-emerald-600 hover:bg-emerald-500 py-2 rounded-full text-sm font-medium"
                  >
                    {editingId ? 'Salvar alterações' : 'Cadastrar'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Rendas cadastradas (templates) */}
          <div className="rounded-3xl p-4" style={{ background: 'rgba(93,202,165,0.08)', border: '1px solid rgba(93,202,165,0.2)' }}>
            <h2 className="font-bold text-[13px] text-slate-100 mb-1">Rendas cadastradas</h2>
            <p className="text-xs text-slate-400 mb-2">
              Fixo projeta e pede confirmação todo mês. Variável/Extraordinário ficam pendentes em
              qualquer mês até você confirmar uma vez — depois somem da lista.
            </p>

            <div className="space-y-2 mb-4">
              {incomes.map((i) => (
                <div key={i.id} className="flex justify-between items-center bg-slate-800 rounded-2xl px-3 py-2">
                  <div>
                    <div className="text-sm text-slate-200">{i.description}</div>
                    <div className={`text-xs capitalize ${i.type === 'fixo' ? 'text-emerald-400' : i.type === 'variavel' ? 'text-blue-400' : 'text-purple-400'}`}>
                      {i.type}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-emerald-400 font-medium">{fmt(i.amount)}</span>
                    <button onClick={() => { removeIncome(i.id); showSuccessToast(`Renda "${i.description}" removida.`) }} className="text-slate-500 hover:text-red-400"><IconX size={13} /></button>
                  </div>
                </div>
              ))}
            </div>

            <form onSubmit={handleAddIncome} className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <input
                  value={incomeForm.description}
                  onChange={(e) => setIncomeForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="Descrição (ex: Bônus)"
                  className="bg-slate-700 rounded-xl px-3 py-2 text-sm text-slate-200 border border-slate-600"
                />
                <input
                  type="number"
                  value={incomeForm.amount}
                  onChange={(e) => setIncomeForm((f) => ({ ...f, amount: e.target.value }))}
                  placeholder="Valor (R$)"
                  className="bg-slate-700 rounded-xl px-3 py-2 text-sm text-slate-200 border border-slate-600"
                />
              </div>
              <div className="flex gap-2">
                {(['fixo', 'variavel', 'extraordinario'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setIncomeForm((f) => ({ ...f, type: t }))}
                    className={`flex-1 py-1.5 rounded-full text-xs font-medium transition-colors
                      ${incomeForm.type === t ? 'bg-emerald-600 text-white' : 'bg-slate-700 text-slate-400 hover:bg-slate-600'}`}
                  >
                    {t === 'fixo' ? 'Fixo' : t === 'variavel' ? 'Variável' : 'Extraordinário'}
                  </button>
                ))}
              </div>
              <button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-500 py-2 rounded-full text-sm font-medium">
                + Adicionar renda
              </button>
            </form>
          </div>

          {/* Receitas extraordinárias */}
          <div className="rounded-3xl p-4" style={{ background: 'rgba(124,58,237,0.08)', border: '1px solid rgba(124,58,237,0.2)' }}>
            <div className="flex justify-between items-center mb-3">
              <h2 className="font-bold text-[13px] text-slate-100">Receitas extraordinárias</h2>
              <button
                onClick={() => setShowExtraForm(!showExtraForm)}
                className="text-xs bg-purple-700 hover:bg-purple-600 px-3 py-1.5 rounded-full font-medium"
              >
                + Adicionar
              </button>
            </div>

            {showExtraForm && (
              <form onSubmit={handleAddExtra} className="bg-slate-800 rounded-2xl p-3 mb-3 space-y-2">
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Tipo</label>
                  <div className="grid grid-cols-3 gap-1">
                    {EXTRA_TYPES.map((t) => (
                      <button
                        key={t.value}
                        type="button"
                        onClick={() => setExtraForm((f) => ({ ...f, type: t.value, description: t.label }))}
                        className={`py-1.5 rounded text-xs font-medium transition-colors
                          ${extraForm.type === t.value ? 'bg-purple-600 text-white' : 'bg-slate-600 text-slate-400 hover:bg-slate-500'}`}
                      >
                        {t.icon} {t.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Descrição</label>
                  <input
                    value={extraForm.description}
                    onChange={(e) => setExtraForm((f) => ({ ...f, description: e.target.value }))}
                    className="w-full bg-slate-600 rounded px-2 py-1.5 text-sm text-slate-200"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">Valor esperado (R$)</label>
                    <input
                      type="number"
                      value={extraForm.amount}
                      onChange={(e) => setExtraForm((f) => ({ ...f, amount: e.target.value }))}
                      className="w-full bg-slate-600 rounded px-2 py-1.5 text-sm text-slate-200"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">Mês previsto</label>
                    <input
                      type="month"
                      value={extraForm.expectedDate}
                      onChange={(e) => setExtraForm((f) => ({ ...f, expectedDate: e.target.value }))}
                      className="w-full bg-slate-600 rounded px-2 py-1.5 text-sm text-slate-200"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Probabilidade: {extraForm.probability}%</label>
                  <input
                    type="range"
                    min={0} max={100} step={5}
                    value={extraForm.probability}
                    onChange={(e) => setExtraForm((f) => ({ ...f, probability: e.target.value }))}
                    className="w-full accent-purple-500"
                  />
                </div>
                <button type="submit" className="w-full bg-purple-600 hover:bg-purple-500 py-2 rounded-full text-sm font-medium">
                  Salvar
                </button>
              </form>
            )}

            <div className="space-y-2">
              {(extraordinaryIncomes ?? []).length === 0 && (
                <p className="text-slate-500 text-sm text-center py-3">Nenhuma receita cadastrada</p>
              )}
              {(extraordinaryIncomes ?? []).map((e) => (
                <div key={e.id} className={`flex justify-between items-center rounded-2xl px-3 py-2 ${e.received ? 'bg-emerald-900/30' : 'bg-slate-800'}`}>
                  <div>
                    <div className="text-sm text-slate-200">{e.description}</div>
                    <div className="text-xs text-slate-400">
                      {e.received ? `Recebido em ${e.receivedDate}` : `${e.expectedDate} · ${e.probability}%`}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <div className={`font-medium ${e.received ? 'text-emerald-400' : 'text-purple-400'}`}>{fmt(e.amount)}</div>
                      {!e.received && <div className="text-xs text-slate-400">{fmt(e.amount * e.probability / 100)}</div>}
                    </div>
                    <button onClick={() => { removeExtraordinaryIncome(e.id); showSuccessToast(`"${e.description}" removida.`) }} className="text-slate-500 hover:text-red-400"><IconX size={13} /></button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── PROJEÇÃO ── */}
      {activeSection === 'projecao' && (
        <div className="rounded-3xl p-4" style={{ background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.2)' }}>
          <h2 className="font-bold text-[13px] text-slate-100 mb-3">Projeção — próximos 6 meses</h2>
          {(fixedCosts ?? []).length === 0 ? (
            <p className="text-slate-500 text-sm text-center py-6">Nenhum custo fixo cadastrado ainda.</p>
          ) : (
            <div className="space-y-3">
              {projectionMonths.map((month) => {
                const active = (fixedCosts ?? []).filter((c) => isActiveInMonth(c, month))
                // Custos no cartão são agrupados por cartão (não por nome individual) pra bater
                // certinho com a fatura e não confundir — mostrar cada assinatura separada aqui
                // dava a impressão de que era gasto a mais, além do que já aparece na fatura.
                const nonCardActive = active.filter((c) => !CARD_METHODS.includes(c.defaultMethod as any))
                const cardActive = active.filter((c) => CARD_METHODS.includes(c.defaultMethod as any))
                // Valor real: se já existe um lançamento pra esse custo nesse mês, usa o valor real
                // dele; senão usa o valor fixo cadastrado (nunca uma média/estimativa — a Projeção
                // só deve mostrar o que já é certo: valor fixo combinado ou parcela já agendada).
                const amountFor = (c: FixedCost) => {
                  const payment = isPaid(c.id, month)
                  const paidAmt = payment ? expenses.find((e) => e.id === payment.expenseId)?.amount : null
                  return paidAmt ?? c.defaultAmount
                }
                const isPast = month < currentMonth()
                const isCurrent = month === currentMonth()
                const paidTotal = active.filter((c) => isPaid(c.id, month)).reduce((s, c) => {
                  const p = isPaid(c.id, month)!
                  return s + (expenses.find((e) => e.id === p.expenseId)?.amount ?? 0)
                }, 0)

                // Fatura por cartão: soma todo gasto real já lançado nesse cartão nesse mês (custo
                // fixo automático já gerado, parcelas já agendadas, compras avulsas) e completa com
                // os custos fixos desse cartão que ainda não geraram lançamento real nesse mês
                // (cobrança automática futura — entra pelo valor fixo cadastrado, nunca estimado).
                const cardTotals = CARDS.map((card) => {
                  const realTotal = expenses
                    .filter((e) => e.method === cardMethod(card.id) && e.month === month)
                    .reduce((s, e) => s + e.amount, 0)
                  const missingCostsTotal = cardActive
                    .filter((c) => cardIdFromMethod(c.defaultMethod) === card.id && !isPaid(c.id, month))
                    .reduce((s, c) => s + c.defaultAmount, 0)
                  return { card, amount: realTotal + missingCostsTotal }
                }).filter((f) => f.amount > 0)
                const nonCardTotal = nonCardActive.reduce((s, c) => s + amountFor(c), 0)
                const totalWithFatura = nonCardTotal + cardTotals.reduce((s, f) => s + f.amount, 0)
                return (
                  <div key={month} className={`rounded-2xl p-3 ${isCurrent ? 'bg-slate-700 ring-1 ring-emerald-500' : 'bg-slate-700/60'}`}>
                    <div className="flex items-center justify-between mb-2">
                      <span className={`font-medium text-sm ${isCurrent ? 'text-emerald-400' : 'text-slate-300'}`}>
                        {monthLabel(month)} {isCurrent && '← atual'}
                      </span>
                      <div className="text-right">
                        <span className="text-sm font-bold text-slate-200">{fmt(totalWithFatura)}</span>
                        {(isPast || isCurrent) && paidTotal > 0 && (
                          <span className="text-xs text-emerald-400 ml-2">({fmt(paidTotal)} pago)</span>
                        )}
                      </div>
                    </div>
                    <div className="space-y-1">
                      {nonCardActive.map((c) => {
                        const payment = isPaid(c.id, month)
                        return (
                          <div key={c.id} className="flex justify-between text-xs text-slate-400">
                            <span className={payment ? 'line-through text-slate-500' : ''}>{c.description}</span>
                            <span className={payment ? 'text-emerald-500' : ''}>{fmt(amountFor(c))}</span>
                          </div>
                        )
                      })}
                      {cardTotals.map((f) => (
                        <div key={f.card.id} className="flex justify-between text-xs text-amber-400">
                          <span>Fatura {f.card.label}</span>
                          <span>{fmt(f.amount)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      </div>

      {/* Fecho da página — colina decorativa */}
      <div className="relative -mx-4 mt-2">
        <svg viewBox="0 0 320 60" className="w-full block" style={{ height: 60 }} preserveAspectRatio="none">
          <path d="M0,60 L0,30 C 70,5 110,45 180,25 C 240,8 280,35 320,20 L320,60 Z" fill="#241e42" />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-end pb-2.5">
          <span className="w-8 h-8 rounded-full flex items-center justify-center mb-1" style={{ background: PAGE_GRADIENT, boxShadow: '0 4px 14px rgba(124,58,237,0.4)' }}>
            <IconClipboardList size={16} color="#fff" />
          </span>
          <span className="text-[10px] font-bold text-slate-200">Tudo em dia por aqui</span>
        </div>
      </div>
      </div>

      {/* ── MODAL DE PAGAMENTO DE FATURA ── */}
      {payingFatura && (
        <div className="fixed inset-0 bg-black/70 flex items-end sm:items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-3xl p-5 w-full max-w-sm">
            <h3 className="font-bold text-amber-300 mb-1">Pagar fatura</h3>
            <p className="text-sm text-slate-400 mb-1">
              {CARDS.find((c) => c.id === payingFatura.card)!.label} · {monthLabel(payingFatura.month)}
            </p>
            <p className="text-2xl font-bold text-amber-400 mb-4">{fmt(payingFatura.amount)}</p>
            <div>
              <label className="text-xs text-slate-400 block mb-1">Data do pagamento</label>
              <input
                type="date"
                value={faturaPayForm.date}
                onChange={(e) => setFaturaPayForm({ date: e.target.value })}
                className="w-full bg-slate-700 rounded px-3 py-2 text-sm text-slate-200 border border-slate-600 mb-4"
              />
            </div>
            <div className="flex gap-2">
              <button onClick={() => setPayingFatura(null)} className="flex-1 bg-slate-700 hover:bg-slate-600 py-2.5 rounded-full text-sm">Cancelar</button>
              <button onClick={handlePagarFatura} className="flex-1 bg-amber-700 hover:bg-amber-600 py-2.5 rounded-full text-sm font-medium text-white">Confirmar pagamento</button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL DE PAGAMENTO ── */}
      {payingCost && (
        <div className="fixed inset-0 bg-black/70 flex items-end sm:items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-3xl p-5 w-full max-w-sm">
            <h3 className="font-bold text-slate-200 mb-1">Confirmar pagamento</h3>
            <p className="text-sm text-slate-400 mb-4">{payingCost.description}</p>

            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Data</label>
                  <input
                    type="date"
                    value={payForm.date}
                    onChange={(e) => setPayForm((f) => ({ ...f, date: e.target.value }))}
                    className="w-full bg-slate-700 rounded px-3 py-2 text-sm text-slate-200 border border-slate-600"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Valor (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={payForm.amount}
                    onChange={(e) => setPayForm((f) => ({ ...f, amount: e.target.value }))}
                    className="w-full bg-slate-700 rounded px-3 py-2 text-sm text-slate-200 border border-slate-600"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs text-slate-400 block mb-1">Forma de pagamento</label>
                <div className="grid grid-cols-2 gap-1">
                  {METHODS.map((m) => (
                    <button
                      key={m.value}
                      onClick={() => setPayForm((f) => ({ ...f, method: m.value }))}
                      className={`py-2 rounded text-xs font-medium transition-colors
                        ${payForm.method === m.value
                          ? 'bg-emerald-600 text-white'
                          : 'bg-slate-700 text-slate-400 hover:bg-slate-600'}`}
                    >
                      {m.icon} {m.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="text-xs text-slate-500 bg-slate-700/50 rounded px-3 py-2">
                Categoria: <strong className="text-slate-400">{payingCost.category}</strong> ·
                Descrição: <strong className="text-slate-400">{payingCost.description}</strong>
              </div>
            </div>

            <div className="flex gap-2 mt-4">
              <button
                onClick={() => setPayingCost(null)}
                className="flex-1 bg-slate-700 hover:bg-slate-600 py-2.5 rounded-full text-sm"
              >
                Cancelar
              </button>
              <button
                onClick={handlePay}
                className="flex-1 bg-emerald-600 hover:bg-emerald-500 py-2.5 rounded-full text-sm font-medium"
              >
                Lançar como gasto
              </button>
            </div>
          </div>
        </div>
      )}

      {editingExpense && (
        <ExpenseEditModal
          expense={editingExpense}
          methods={METHODS}
          categories={CATEGORIES}
          onClose={() => setEditingExpense(null)}
          onSave={(id, patch) => { updateExpense(id, patch); showSuccessToast('Lançamento atualizado.'); setEditingExpense(null) }}
          onDelete={(id) => { removeExpense(id); showSuccessToast('Lançamento removido.'); setEditingExpense(null) }}
        />
      )}
    </div>
  )
}
