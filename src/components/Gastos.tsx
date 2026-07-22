import { useState } from 'react'
import { useStore } from '../store'
import {
  fmt, currentMonth, monthLabel, computeSaldo, computeBenefitBalance,
  CARDS, CARD_METHODS, FATURA_METHODS, cardMethod, faturaMethod, cardIdFromMethod,
  getFaturaMonth, addMonths, weeklyBuckets, nextFaturaMonth, overdueFaturaMonth, faturaOpenAmount,
} from '../utils'
import type { CardId } from '../config/cards'
import type { PaymentMethod, Expense } from '../types'
import CardSpendGoal from './CardSpendGoal'
import { showSuccessToast, showErrorToast } from '../lib/toast'
import {
  IconCreditCard, IconChevronLeft, IconChevronRight, IconEye, IconEyeOff,
  IconTicket, IconPencil, IconX, IconAlertTriangle, IconSearch,
} from '@tabler/icons-react'

const PAGE_GRADIENT = 'linear-gradient(160deg, #f97316, #ec4899)'

export const METHODS: { value: PaymentMethod; label: string; icon: string }[] = [
  ...CARDS.map((c) => ({ value: cardMethod(c.id), label: c.label, icon: '💳' })),
  { value: 'cartao_beneficio', label: 'Benefício', icon: '🎫' },
  { value: 'pix', label: 'Pix', icon: '📲' },
  { value: 'dinheiro', label: 'Dinheiro', icon: '💵' },
  { value: 'boleto', label: 'Boleto', icon: '🧾' },
]

export { CARD_METHODS }

function faturaLabel(method: string) {
  const card = CARDS.find((c) => faturaMethod(c.id) === method)
  return `Pag. Fatura ${card?.label ?? method}`
}

export const CATEGORIES = ['Alimentação', 'Mercado', 'Saúde', 'Transporte', 'Educação', 'Lazer', 'Casa', 'Vestuário', 'Outros']
const ESTORNO_CATEGORY = 'Estorno'

function methodLabel(m: string) {
  if (m === 'cartao_beneficio') return 'Cartão Benefício'
  return METHODS.find((x) => x.value === m)?.label ?? m
}

function methodIcon(m: string) {
  return METHODS.find((x) => x.value === m)?.icon ?? '💰'
}

const emptyForm = {
  date: new Date().toISOString().slice(0, 10),
  description: '',
  amount: '',
  method: cardMethod(CARDS[0].id) as PaymentMethod,
  category: 'Alimentação',
  installments: '1',
  isEstorno: false,
}

export default function Gastos() {
  const {
    expenses, budgets, incomes, incomeReceipts, extraordinaryIncomes, aportes,
    addExpense, removeExpense, updateExpense, upsertBudget,
    addIncomeReceipt, removeIncomeReceipt,
    hideSaldo, toggleHideSaldo,
    benefitCardMonthlyAmount, benefitCardCredits, addBenefitCardCredit, removeBenefitCardCredit,
  } = useStore()

  const today = currentMonth()
  // Abre na fatura ABERTA mais antiga entre os cartões (mesma lógica do Dashboard): a fatura que
  // está acumulando compras agora, não a que está esperando pagamento.
  const defaultMonth = CARDS.map((c) => nextFaturaMonth(c.id)).sort()[0]
  const [selectedMonth, setSelectedMonth] = useState(defaultMonth)

  // Fatura ANTERIOR já fechada mas ainda não paga (se houver), por cartão
  const overdue = CARDS.map((c) => {
    const month = overdueFaturaMonth(expenses, c.id)
    return { card: c, month, amount: month ? faturaOpenAmount(expenses, c.id, month) : 0 }
  }).filter((o) => o.month)

  const budget = [...budgets].sort((a, b) => b.month.localeCompare(a.month))[0]
  const limit = budget?.limit ?? 8000

  const [form, setForm] = useState({ ...emptyForm })
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null)
  const [editForm, setEditForm] = useState({ ...emptyForm })

  const [editLimit, setEditLimit] = useState(false)
  const [newLimit, setNewLimit] = useState(String(limit))
  const [confirmPay, setConfirmPay] = useState<CardId | null>(null)
  const [receiveDate, setReceiveDate] = useState(new Date().toISOString().slice(0, 10))
  const [receivingId, setReceivingId] = useState<string | null>(null)
  const [receivingAmount, setReceivingAmount] = useState('')
  const [detailCard, setDetailCard] = useState<CardId | null>(null)

  const saldo = computeSaldo({ incomeReceipts: incomeReceipts ?? [], extraordinaryIncomes: extraordinaryIncomes ?? [], expenses, aportes: aportes ?? [] })

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

  // Lançamentos por DATA da compra no mês selecionado
  const monthExpenses = expenses
    .filter((e) => e.date.slice(0, 7) === selectedMonth)
    .sort((a, b) => b.date.localeCompare(a.date))

  // Faturas dos cartões para o mês selecionado (mês da fatura = selectedMonth)
  const cardTotals = CARDS.map((c) => {
    const total = expenses.filter((e) => e.method === cardMethod(c.id) && e.month === selectedMonth).reduce((s, e) => s + e.amount, 0)
    const paidAmount = expenses.filter((e) => e.method === faturaMethod(c.id) && e.month === selectedMonth).reduce((s, e) => s + e.amount, 0)
    const fatura = Math.max(0, total - paidAmount)
    const isPaid = total > 0 && fatura <= 0
    const paidDate = expenses.filter((e) => e.method === faturaMethod(c.id) && e.month === selectedMonth).sort((a, b) => b.date.localeCompare(a.date))[0]?.date
    return { card: c, total, fatura, isPaid, paidDate }
  })

  function getFaturaLancamentos(card: CardId) {
    return expenses
      .filter((e) => e.method === cardMethod(card) && e.month === selectedMonth)
      .sort((a, b) => b.date.localeCompare(a.date))
  }

  // "No cartão (mês)" = total bruto lançado na fatura do mês selecionado
  const cardSpent = cardTotals.reduce((s, c) => s + c.total, 0)

  // Meta de gastos: usa o total bruto gasto no mês (não zera quando a fatura é paga)
  const cardSpentOpen = cardSpent
  const cardWeeklySpent = weeklyBuckets(
    expenses.filter((e) => CARD_METHODS.includes(e.method as any) && e.month === selectedMonth)
  )
  const hasCardSpend = cardTotals.some((c) => c.total > 0)
  const cardFullyPaid = hasCardSpend && cardTotals.every((c) => c.fatura <= 0)

  // Gastos efetivos (saíram da conta) no mês selecionado por data
  const effectiveSpent = monthExpenses
    .filter((e) => !CARD_METHODS.includes(e.method as any))
    .reduce((s, e) => s + e.amount, 0)

  // Cartão Benefício — saldo contínuo (recarrega e debita, sem fechamento/vencimento mensal)
  // "Gasto" sempre olha o mês calendário real (today), não o mês de fatura navegado (selectedMonth):
  // o benefício não tem fatura, então não faz sentido acompanhar a navegação do cartão de crédito.
  const hasBenefitHistory = (benefitCardCredits ?? []).length > 0
  const benefitBalance = computeBenefitBalance({ benefitCardCredits: benefitCardCredits ?? [], expenses })
  const benefitSpentThisMonth = expenses
    .filter((e) => e.method === 'cartao_beneficio' && e.date.slice(0, 7) === today)
    .reduce((s, e) => s + e.amount, 0)
  // Medidor: saldo atual como fração de uma recarga mensal (não é "% usado", é "quanto sobrou")
  const benefitPct = benefitCardMonthlyAmount > 0 ? Math.max(0, Math.min((benefitBalance / benefitCardMonthlyAmount) * 100, 100)) : 0

  const byCategory = CATEGORIES.map((cat) => ({
    name: cat,
    valor: monthExpenses.filter((e) => e.category === cat).reduce((s, e) => s + e.amount, 0),
  })).filter((d) => d.valor > 0)

  const weeklyData = [1, 2, 3, 4].map((w) => {
    const start = (w - 1) * 7 + 1
    const end = w * 7
    const total = monthExpenses.filter((e) => {
      const day = parseInt(e.date.slice(8, 10))
      return day >= start && day <= end
    }).reduce((s, e) => s + e.amount, 0)
    return { name: `Sem ${w}`, valor: total }
  })

  function handleSubmit(ev: React.FormEvent) {
    ev.preventDefault()
    if (!form.description || !form.amount) {
      showErrorToast('Preencha descrição e valor antes de lançar.')
      return
    }
    const amount = parseFloat(form.amount.replace(',', '.'))
    if (isNaN(amount) || amount <= 0) {
      showErrorToast('Valor inválido — informe um número maior que zero.')
      return
    }
    const isCard = CARD_METHODS.includes(form.method as any)
    const isBeneficio = form.method === 'cartao_beneficio'
    const card = cardIdFromMethod(form.method)
    const numInstallments = isCard ? Math.max(1, parseInt(form.installments) || 1) : 1

    if (form.isEstorno) {
      addExpense({
        date: form.date,
        description: form.description,
        amount: -amount,
        method: form.method,
        category: ESTORNO_CATEGORY,
        month: getFaturaMonth(form.date, card),
        isEstorno: true,
      })
      showSuccessToast(`Estorno de ${fmt(amount)} registrado na fatura de ${monthLabel(getFaturaMonth(form.date, card))}.`)
      setForm((f) => ({ ...f, description: '', amount: '' }))
      return
    }

    if (isCard && numInstallments > 1) {
      const parcela = parseFloat((amount / numInstallments).toFixed(2))
      const firstFatura = getFaturaMonth(form.date, card)
      const groupId = crypto.randomUUID()
      for (let i = 0; i < numInstallments; i++) {
        addExpense({
          date: form.date,
          description: `${form.description} (${i + 1}/${numInstallments})`,
          amount: parcela,
          method: form.method,
          category: form.category,
          month: addMonths(firstFatura, i),
          installments: numInstallments,
          installmentNumber: i + 1,
          installmentGroup: groupId,
        })
      }
    } else {
      const expMonth = isCard ? getFaturaMonth(form.date, card) : form.date.slice(0, 7)
      addExpense({
        date: form.date,
        description: form.description,
        amount,
        method: form.method,
        category: form.category,
        month: expMonth,
      })
    }
    showSuccessToast(
      isCard ? `Lançado ${fmt(amount)} no cartão — fatura de ${monthLabel(getFaturaMonth(form.date, card))}.`
        : isBeneficio ? `Lançado ${fmt(amount)} no Cartão Benefício.`
        : `Gasto de ${fmt(amount)} registrado.`
    )
    setForm((f) => ({ ...f, description: '', amount: '', installments: '1' }))
  }

  function handlePayBill(card: CardId) {
    const info = cardTotals.find((c) => c.card.id === card)
    const amount = info?.fatura ?? 0
    if (amount <= 0) return
    const todayDate = new Date().toISOString().slice(0, 10)
    const method: PaymentMethod = faturaMethod(card)
    addExpense({
      date: todayDate,
      description: `Pagamento Fatura ${info!.card.label}`,
      amount,
      method,
      category: 'Outros',
      month: selectedMonth,
    })
    showSuccessToast(`Fatura ${info!.card.label} de ${fmt(amount)} paga.`)
    setConfirmPay(null)
  }

  function openEditModal(e: Expense) {
    setEditingExpense(e)
    setEditForm({
      date: e.date,
      description: e.description,
      amount: String(Math.abs(e.amount)),
      method: e.method,
      category: e.category,
      installments: String(e.installments ?? 1),
      isEstorno: !!e.isEstorno,
    })
  }

  function handleSaveEdit(ev: React.FormEvent) {
    ev.preventDefault()
    if (!editingExpense) return
    const amount = parseFloat(editForm.amount.replace(',', '.'))
    if (isNaN(amount) || amount <= 0) {
      showErrorToast('Valor inválido — informe um número maior que zero.')
      return
    }
    const isEstorno = !!editingExpense.isEstorno
    const isCard = CARD_METHODS.includes(editForm.method as any)
    const card = cardIdFromMethod(editForm.method)
    const expMonth = isCard ? getFaturaMonth(editForm.date, card) : editForm.date.slice(0, 7)
    updateExpense(editingExpense.id, {
      date: editForm.date,
      description: editForm.description,
      amount: isEstorno ? -amount : amount,
      method: editForm.method,
      category: isEstorno ? ESTORNO_CATEGORY : editForm.category,
      month: expMonth,
    })
    showSuccessToast('Lançamento atualizado.')
    setEditingExpense(null)
  }

  function handleConfirmBenefitCredit() {
    addBenefitCardCredit({
      month: today,
      amount: benefitCardMonthlyAmount,
      confirmedDate: new Date().toISOString().slice(0, 10),
    })
    showSuccessToast(`Recarga de ${fmt(benefitCardMonthlyAmount)} confirmada no Cartão Benefício.`)
  }

  const isCardMethod = CARD_METHODS.includes(form.method as any)

  function toggleEstorno(next: boolean) {
    setForm((f) => ({
      ...f,
      isEstorno: next,
      // Estorno só existe no cartão — se o método atual não for cartão, força o primeiro cartão como padrão
      method: next && !CARD_METHODS.includes(f.method as any) ? cardMethod(CARDS[0].id) : f.method,
    }))
  }

  const cardPct = limit > 0 ? Math.min(100, (cardSpentOpen / limit) * 100) : 0
  const ringR = 44
  const ringC = 2 * Math.PI * ringR
  const ringOffset = ringC - (cardPct / 100) * ringC

  return (
    <div className="space-y-4">
      {/* Cabeçalho colorido com onda */}
      <div className="relative -mx-4 -mt-2 px-4 pt-4 overflow-hidden" style={{ background: PAGE_GRADIENT }}>
        <div className="relative flex items-center gap-2 mb-5">
          <span className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
            <IconCreditCard size={17} color="#fff" />
          </span>
          <span className="font-bold text-sm text-white">Gastos</span>
        </div>

        <div className="relative flex items-center justify-between gap-3">
          <div className="flex-1">
            <div className="flex items-center justify-between mb-2">
              <button onClick={() => setSelectedMonth((m) => addMonths(m, -1))} className="w-8 h-8 rounded-full bg-white/15 flex items-center justify-center text-white">
                <IconChevronLeft size={16} />
              </button>
              <div className="text-center">
                <div className="text-sm font-bold text-white capitalize">{monthLabel(selectedMonth)}</div>
                {selectedMonth !== defaultMonth && (
                  <button onClick={() => setSelectedMonth(defaultMonth)} className="text-[10px] text-white/80 underline mt-0.5">
                    voltar à fatura atual
                  </button>
                )}
              </div>
              <button
                onClick={() => setSelectedMonth((m) => addMonths(m, 1))}
                disabled={selectedMonth >= defaultMonth}
                className="w-8 h-8 rounded-full bg-white/15 flex items-center justify-center text-white disabled:opacity-30"
              >
                <IconChevronRight size={16} />
              </button>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-white/80">Saldo em conta</span>
              <button onClick={toggleHideSaldo} className="text-white/70 hover:text-white transition-colors" title={hideSaldo ? 'Mostrar' : 'Ocultar'}>
                {hideSaldo ? <IconEye size={12} /> : <IconEyeOff size={12} />}
              </button>
            </div>
            <div className="text-2xl font-extrabold text-white">{hideSaldo ? '••••••' : fmt(saldo)}</div>
          </div>

          <svg width={100} height={100} viewBox="0 0 100 100" className="flex-shrink-0">
            <circle cx={50} cy={50} r={ringR} fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth={9} />
            <circle cx={50} cy={50} r={ringR} fill="none" stroke="#fff" strokeWidth={9} strokeLinecap="round" strokeDasharray={ringC} strokeDashoffset={ringOffset} transform="rotate(-90 50 50)" />
            <text x="50%" y="47%" textAnchor="middle" dominantBaseline="central" className="fill-white font-extrabold" style={{ fontSize: 17 }}>{cardPct.toFixed(0)}%</text>
            <text x="50%" y="65%" textAnchor="middle" dominantBaseline="central" className="fill-white/80" style={{ fontSize: 8 }}>meta cartão</text>
          </svg>
        </div>

        <div className="h-14" />
        <svg viewBox="0 0 320 74" className="absolute left-0 right-0 bottom-0 w-full block" style={{ height: 74 }} preserveAspectRatio="none">
          <path d="M0,8 C 70,8 95,58 175,52 C 255,47 260,4 320,10 L320,74 L0,74 Z" fill="#18132e" />
        </svg>
      </div>

      {/* Corpo com leve degradê sutil */}
      <div className="-mx-4 px-4" style={{ background: 'linear-gradient(180deg, #18132e 0%, rgba(52,43,84,0.55) 22%, #18132e 100%)' }}>
        <div className="space-y-4 pt-1">

          {/* Aviso: fatura já fechada (não aceita mais compras) mas ainda não paga */}
          {overdue.length > 0 && (
            <div className="bg-amber-900/30 border border-amber-700/50 rounded-2xl px-3 py-2 text-xs text-amber-300 space-y-1.5">
              {overdue.map((o) => (
                <div key={o.card.id} className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5"><IconAlertTriangle size={13} />Fatura {o.card.label} de {monthLabel(o.month!)} fechada, aguardando pagamento — {fmt(o.amount)}</span>
                  <button onClick={() => setSelectedMonth(o.month!)} className="text-amber-200 underline whitespace-nowrap">Ver e pagar</button>
                </div>
              ))}
            </div>
          )}

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

      {/* Faturas dos cartões — mês selecionado */}
      <div className="rounded-3xl p-4" style={{ background: 'rgba(237,147,177,0.08)', border: '1px solid rgba(237,147,177,0.2)' }}>
        <h2 className="font-bold text-[13px] text-slate-100 mb-3">Faturas dos cartões — {monthLabel(selectedMonth)}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {cardTotals.map(({ card, total, fatura, isPaid, paidDate }) => (
            <div key={card.id} className="bg-slate-800 rounded-2xl p-3">
              <div className="flex items-center justify-between mb-1">
                <div className="text-xs text-slate-400">{card.label}</div>
                <button onClick={() => setDetailCard(card.id)} className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1"><IconSearch size={12} />Ver</button>
              </div>
              <div className="text-lg font-bold text-amber-400">{fmt(total)}</div>
              <div className="text-xs text-slate-500 mb-2">Fecha dia {String(card.closingDay).padStart(2, '0')} · Vence dia {String(card.dueDay).padStart(2, '0')}</div>
              {isPaid ? (
                <div className="text-center text-xs text-emerald-400 font-medium py-1.5">
                  Pago{paidDate ? ` em ${new Date(paidDate + 'T12:00:00').toLocaleDateString('pt-BR')}` : ''}
                </div>
              ) : confirmPay === card.id ? (
                <div className="space-y-1.5">
                  <div className="text-xs text-slate-300">Confirmar pagamento de <span className="text-emerald-400 font-semibold">{fmt(fatura)}</span>?</div>
                  <div className="flex gap-1.5">
                    <button onClick={() => handlePayBill(card.id)} className="flex-1 bg-emerald-600 hover:bg-emerald-500 py-1 rounded text-xs font-medium">Confirmar</button>
                    <button onClick={() => setConfirmPay(null)} className="flex-1 bg-slate-600 hover:bg-slate-500 py-1 rounded text-xs">Cancelar</button>
                  </div>
                </div>
              ) : (
                <button onClick={() => fatura > 0 && setConfirmPay(card.id)} disabled={fatura <= 0}
                  className={`w-full py-1.5 rounded text-xs font-medium transition-colors ${fatura > 0 ? 'bg-emerald-700 hover:bg-emerald-600 text-white' : 'bg-slate-600 text-slate-500 cursor-not-allowed'}`}>
                  Pagar fatura
                </button>
              )}
            </div>
          ))}
        </div>

        {/* Resumo */}
        <div className="grid grid-cols-2 gap-2 mt-3">
          <div className="bg-slate-700/50 rounded-lg px-3 py-2 text-center">
            <div className="text-xs text-slate-400">No cartão (fatura)</div>
            <div className="text-sm font-bold text-amber-400">{fmt(cardSpent)}</div>
          </div>
          <div className="bg-slate-700/50 rounded-lg px-3 py-2 text-center">
            <div className="text-xs text-slate-400">Efetivo (por data)</div>
            <div className="text-sm font-bold text-blue-400">{fmt(effectiveSpent)}</div>
          </div>
        </div>
      </div>

      {/* Meta de gastos no cartão */}
      <CardSpendGoal
        spent={cardSpentOpen}
        limit={limit}
        weeklySpent={cardWeeklySpent}
        monthLabelText={monthLabel(selectedMonth)}
        paid={hasCardSpend ? cardFullyPaid : undefined}
        headerRight={
          <button onClick={() => setEditLimit(!editLimit)} className="text-xs text-emerald-400 hover:text-emerald-300">
            {editLimit ? 'Cancelar' : 'Alterar meta'}
          </button>
        }
      >
        {editLimit && (
          <div className="flex gap-2 mb-3">
            <input type="number" value={newLimit} onChange={(e) => setNewLimit(e.target.value)}
              className="flex-1 bg-slate-700 rounded px-3 py-1.5 text-sm text-slate-200 border border-slate-600" placeholder="Nova meta" />
            <button onClick={() => {
              const v = parseFloat(newLimit)
              if (isNaN(v) || v <= 0) {
                showErrorToast('Valor de meta inválido.')
                return
              }
              upsertBudget({ month: budget?.month ?? today, limit: v, income: budget?.income ?? 22100 })
              showSuccessToast(`Meta de gastos atualizada para ${fmt(v)}.`)
              setEditLimit(false)
            }}
              className="bg-emerald-600 hover:bg-emerald-500 px-3 py-1.5 rounded text-sm font-medium">Salvar</button>
          </div>
        )}
      </CardSpendGoal>

      {/* Cartão Benefício — saldo contínuo, sem fechamento/vencimento */}
      <div className="rounded-3xl p-4" style={{ background: 'rgba(45,212,191,0.08)', border: '1px solid rgba(45,212,191,0.2)' }}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-[13px] text-slate-100 flex items-center gap-2">
            <span className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: 'rgba(45,212,191,0.2)' }}>
              <IconTicket size={14} color="#5eead4" />
            </span>
            Cartão benefício
          </h2>
          <button onClick={handleConfirmBenefitCredit}
            className="text-xs bg-teal-700 hover:bg-teal-600 text-white px-3 py-1.5 rounded-full font-medium">
            Confirmar recarga ({fmt(benefitCardMonthlyAmount)})
          </button>
        </div>

        {hasBenefitHistory ? (
          <div>
            <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
              <span>Gasto em {monthLabel(today)}: <span className="text-teal-300 font-semibold">{fmt(benefitSpentThisMonth)}</span></span>
              <span>Saldo atual: <span className={`font-semibold ${benefitBalance >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{fmt(benefitBalance)}</span></span>
            </div>
            <div className="h-3 bg-slate-700 rounded-full overflow-hidden mb-1">
              <div className={`h-full rounded-full transition-all ${benefitPct <= 15 ? 'bg-red-500' : benefitPct <= 40 ? 'bg-amber-500' : 'bg-teal-500'}`}
                style={{ width: `${benefitPct}%` }} />
            </div>
            <div className="text-xs text-slate-500 text-right mb-2">{benefitPct.toFixed(0)}% de uma recarga em saldo</div>
            {[...(benefitCardCredits ?? [])]
              .sort((a, b) => b.confirmedDate.localeCompare(a.confirmedDate))
              .slice(0, 5)
              .map((c) => (
                <div key={c.id} className="flex items-center justify-between text-xs text-slate-500 mt-1">
                  <span>Recarga de {fmt(c.amount)} em {new Date(c.confirmedDate + 'T12:00:00').toLocaleDateString('pt-BR')}</span>
                  <button onClick={() => { removeBenefitCardCredit(c.id); showSuccessToast('Recarga removida.') }} className="text-slate-600 hover:text-red-400 ml-2">✕</button>
                </div>
              ))}
            {(benefitCardCredits ?? []).length > 5 && (
              <div className="text-xs text-slate-600 mt-1">Veja o histórico completo em Config.</div>
            )}
          </div>
        ) : (
          <div className="text-center py-4">
            <div className="text-slate-500 text-sm mb-1">Nenhuma recarga confirmada ainda</div>
            <div className="text-xs text-slate-600">Confirme a primeira recarga de <span className="text-teal-300 font-semibold">{fmt(benefitCardMonthlyAmount)}</span> acima</div>
          </div>
        )}
      </div>

      {/* Formulário de lançamento — não muda com o mês selecionado */}
      <div className="rounded-3xl p-4" style={{ background: 'rgba(124,58,237,0.08)', border: '1px solid rgba(124,58,237,0.2)' }}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-[13px] text-slate-100">Novo lançamento</h2>
          <div className="flex gap-1 bg-slate-900/50 rounded-full p-1">
            <button type="button" onClick={() => toggleEstorno(false)}
              className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${!form.isEstorno ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}>
              Gasto
            </button>
            <button type="button" onClick={() => toggleEstorno(true)}
              className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${form.isEstorno ? 'bg-teal-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}>
              Estorno/Crédito
            </button>
          </div>
        </div>
        {form.isEstorno ? (
          <div className="mb-3 bg-teal-900/30 border border-teal-700/50 rounded-lg px-3 py-2 text-xs text-teal-300">
            Estorno/crédito no cartão — vai reduzir a fatura de <span className="font-semibold text-teal-200">{monthLabel(getFaturaMonth(form.date, cardIdFromMethod(form.method)))}</span>.
          </div>
        ) : isCardMethod ? (
          <div className="mb-3 bg-amber-900/30 border border-amber-700/50 rounded-lg px-3 py-2 text-xs text-amber-300">
            Lançamento no cartão — ficará na fatura de <span className="font-semibold text-amber-200">{monthLabel(getFaturaMonth(form.date, cardIdFromMethod(form.method)))}</span>, não sai da conta ainda.
          </div>
        ) : form.method === 'cartao_beneficio' && (
          <div className="mb-3 bg-teal-900/30 border border-teal-700/50 rounded-lg px-3 py-2 text-xs text-teal-300">
            Débita do saldo do cartão benefício. Não afeta conta corrente.
          </div>
        )}
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-400 block mb-1">Data</label>
              <input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                className="w-full bg-slate-700 rounded px-3 py-2 text-sm text-slate-200 border border-slate-600" />
            </div>
            <div>
              <label className="text-xs text-slate-400 block mb-1">Valor (R$)</label>
              <input type="number" step="0.01" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                placeholder="0,00" className="w-full bg-slate-700 rounded px-3 py-2 text-sm text-slate-200 border border-slate-600" />
            </div>
          </div>

          <div>
            <label className="text-xs text-slate-400 block mb-1">Descrição</label>
            <input type="text" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Ex: Supermercado Extra" className="w-full bg-slate-700 rounded px-3 py-2 text-sm text-slate-200 border border-slate-600" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-400 block mb-1">Categoria</label>
              {form.isEstorno ? (
                <div className="w-full bg-slate-700/50 rounded px-3 py-2 text-sm text-teal-300 border border-slate-600">↩️ Estorno</div>
              ) : (
                <select value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                  className="w-full bg-slate-700 rounded px-3 py-2 text-sm text-slate-200 border border-slate-600">
                  {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                </select>
              )}
            </div>
            <div>
              <label className="text-xs text-slate-400 block mb-1">{form.isEstorno ? 'Cartão' : 'Forma de pagamento'}</label>
              <div className="grid grid-cols-2 gap-1">
                {(form.isEstorno ? METHODS.filter((m) => CARD_METHODS.includes(m.value as any)) : METHODS).map((m) => (
                  <button key={m.value} type="button" onClick={() => setForm((f) => ({ ...f, method: m.value }))}
                    className={`py-1.5 rounded text-xs font-medium transition-colors
                      ${form.method === m.value
                        ? form.isEstorno ? 'bg-teal-600 text-white'
                          : CARD_METHODS.includes(m.value as any) ? 'bg-amber-600 text-white'
                          : m.value === 'cartao_beneficio' ? 'bg-teal-600 text-white'
                          : 'bg-emerald-600 text-white'
                        : 'bg-slate-700 text-slate-400 hover:bg-slate-600'}`}>
                    {m.icon} {m.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {isCardMethod && !form.isEstorno && (
            <div>
              <label className="text-xs text-slate-400 block mb-1">Parcelas</label>
              <div className="flex gap-1 flex-wrap">
                {['1','2','3','4','5','6','7','8','9','10','11','12'].map((n) => (
                  <button key={n} type="button" onClick={() => setForm((f) => ({ ...f, installments: n }))}
                    className={`px-2.5 py-1 rounded text-xs font-medium transition-colors
                      ${form.installments === n ? 'bg-amber-600 text-white' : 'bg-slate-700 text-slate-400 hover:bg-slate-600'}`}>
                    {n}x
                  </button>
                ))}
              </div>
              {parseInt(form.installments) > 1 && form.amount && (
                <div className="mt-1 text-xs text-amber-300">
                  {form.installments}x de {fmt(parseFloat(form.amount.replace(',','.')) / parseInt(form.installments))}
                  {' · '}1ª fatura: {monthLabel(getFaturaMonth(form.date, cardIdFromMethod(form.method)))}
                </div>
              )}
            </div>
          )}

          <button type="submit"
            className={`w-full py-2.5 rounded-full font-medium transition-colors
              ${form.isEstorno ? 'bg-teal-600 hover:bg-teal-500'
                : isCardMethod ? 'bg-amber-600 hover:bg-amber-500'
                : form.method === 'cartao_beneficio' ? 'bg-teal-600 hover:bg-teal-500'
                : 'bg-emerald-600 hover:bg-emerald-500'}`}>
            {form.isEstorno
              ? `Registrar estorno na fatura de ${monthLabel(getFaturaMonth(form.date, cardIdFromMethod(form.method)))}`
              : isCardMethod
              ? parseInt(form.installments) > 1 ? `Parcelar em ${form.installments}x no cartão` : 'Lançar no cartão'
              : form.method === 'cartao_beneficio' ? 'Lançar no benefício'
              : 'Lançar gasto'}
          </button>
        </form>
      </div>

      {/* Gráfico semanal */}
      <div className="rounded-3xl p-4" style={{ background: 'rgba(217,70,239,0.08)', border: '1px solid rgba(217,70,239,0.2)' }}>
        <h2 className="font-bold text-[13px] text-slate-100 mb-3">Gastos por semana — {monthLabel(selectedMonth)}</h2>
        <div className="flex items-end gap-2" style={{ height: 60 }}>
          {weeklyData.map((w) => {
            const maxVal = Math.max(limit / 4, ...weeklyData.map((x) => x.valor), 1)
            const heightPct = Math.max(6, (w.valor / maxVal) * 100)
            const overBudget = w.valor > limit / 4
            return (
              <div key={w.name} className="flex-1 flex flex-col items-center gap-1">
                <div className="w-full rounded-t-lg" style={{
                  height: `${heightPct}%`,
                  background: overBudget ? 'linear-gradient(180deg, #f97316, #ec4899)' : '#3d3659',
                }} />
              </div>
            )
          })}
        </div>
        <div className="flex gap-2 mt-1">
          {weeklyData.map((w) => (
            <div key={w.name} className="flex-1 text-center">
              <div className="text-[9px] text-slate-400">{w.name}</div>
              <div className="text-[10px] font-bold text-slate-200">{fmt(w.valor)}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Por categoria */}
      {byCategory.length > 0 && (
        <div className="rounded-3xl p-4" style={{ background: 'rgba(124,58,237,0.08)', border: '1px solid rgba(124,58,237,0.2)' }}>
          <h2 className="font-bold text-[13px] text-slate-100 mb-3">Por categoria — {monthLabel(selectedMonth)}</h2>
          {byCategory.sort((a, b) => b.valor - a.valor).map((c) => (
            <div key={c.name} className="mb-2">
              <div className="flex justify-between text-sm mb-1">
                <span className="text-slate-300">{c.name}</span>
                <span className="text-slate-200">{fmt(c.valor)}</span>
              </div>
              <div className="h-2 bg-slate-700 rounded-full">
                <div className="h-full rounded-full" style={{ width: `${Math.min((c.valor / (cardSpent || 1)) * 100, 100)}%`, background: 'linear-gradient(90deg, #7c3aed, #d946ef)' }} />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Lista de lançamentos */}
      <div className="rounded-3xl p-4" style={{ background: 'rgba(148,139,199,0.08)', border: '1px solid rgba(148,139,199,0.2)' }}>
        <h2 className="font-bold text-[13px] text-slate-100 mb-3">Lançamentos — {monthLabel(selectedMonth)}</h2>
        {monthExpenses.length === 0 ? (
          <p className="text-slate-500 text-sm text-center py-4">Nenhum lançamento em {monthLabel(selectedMonth)}</p>
        ) : (
          <div className="space-y-2">
            {monthExpenses.map((e) => {
              const isCard = CARD_METHODS.includes(e.method as any)
              const isFatura = FATURA_METHODS.includes(e.method as any)
              const isBeneficio = e.method === 'cartao_beneficio'
              const bg = e.isEstorno ? 'bg-emerald-900/20 border border-emerald-800/30'
                : isCard ? 'bg-amber-900/20 border border-amber-800/30'
                : isFatura ? 'bg-blue-900/20 border border-blue-800/30'
                : isBeneficio ? 'bg-teal-900/20 border border-teal-800/30'
                : 'bg-slate-800'
              const amtColor = e.isEstorno ? 'text-emerald-400' : isCard ? 'text-amber-400' : isFatura ? 'text-blue-400' : isBeneficio ? 'text-teal-400' : 'text-emerald-400'
              return (
                <div key={e.id} className={`flex items-center justify-between rounded-2xl px-3 py-2 ${bg}`}>
                  <div className="flex-1 min-w-0 pr-2">
                    <div className="text-sm text-slate-200 truncate">{e.description}</div>
                    <div className="text-xs text-slate-400">
                      {new Date(e.date + 'T12:00:00').toLocaleDateString('pt-BR')} · {e.category} ·{' '}
                      {e.isEstorno ? '↩️ Estorno ' + methodLabel(e.method)
                        : isFatura ? '💸 ' + faturaLabel(e.method)
                        : isBeneficio ? '🎫 Cartão Benefício'
                        : methodIcon(e.method) + ' ' + methodLabel(e.method)}
                      {e.isEstorno && <span className="ml-1 text-emerald-500">• reduz fatura</span>}
                      {isCard && !e.isEstorno && <span className="ml-1 text-amber-500">• fatura</span>}
                      {isFatura && <span className="ml-1 text-blue-400">• débito na conta</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className={`font-medium ${amtColor}`}>{fmt(e.amount)}</span>
                    <button onClick={() => openEditModal(e)} className="text-slate-500 hover:text-blue-400" title="Editar"><IconPencil size={14} /></button>
                    <button onClick={() => { removeExpense(e.id); showSuccessToast('Lançamento removido.') }} className="text-slate-500 hover:text-red-400"><IconX size={14} /></button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

        </div>

        {/* Fecho da página — colina decorativa */}
        <div className="relative -mx-4 mt-2">
          <svg viewBox="0 0 320 60" className="w-full block" style={{ height: 60 }} preserveAspectRatio="none">
            <path d="M0,60 L0,30 C 70,5 110,45 180,25 C 240,8 280,35 320,20 L320,60 Z" fill="#241e42" />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-end pb-2.5">
            <span className="w-8 h-8 rounded-full flex items-center justify-center mb-1" style={{ background: PAGE_GRADIENT, boxShadow: '0 4px 14px rgba(236,72,153,0.4)' }}>
              <IconCreditCard size={16} color="#fff" />
            </span>
            <span className="text-[10px] font-bold text-slate-200">Tudo em dia por aqui</span>
          </div>
        </div>
      </div>

      {/* Modal de detalhes da fatura */}
      {detailCard && (() => {
        const info = cardTotals.find((c) => c.card.id === detailCard)!
        return (
          <div className="fixed inset-0 bg-black/70 flex items-end sm:items-center justify-center z-50 p-4">
            <div className="bg-slate-800 rounded-3xl p-5 w-full max-w-sm max-h-[80vh] flex flex-col">
              <div className="flex items-center justify-between mb-1">
                <h3 className="font-bold text-amber-300">{info.card.label}</h3>
                <button onClick={() => setDetailCard(null)} className="text-slate-500 hover:text-slate-300"><IconX size={18} /></button>
              </div>
              <p className="text-sm text-slate-400 mb-3">
                Fatura {monthLabel(selectedMonth)} · Total {fmt(info.total)}
                {info.isPaid && <span className="text-emerald-400"> · Pago</span>}
              </p>
              <div className="flex-1 overflow-y-auto space-y-1.5">
                {getFaturaLancamentos(detailCard).length === 0 ? (
                  <p className="text-slate-500 text-sm text-center py-6">Nenhum lançamento nesta fatura.</p>
                ) : (
                  getFaturaLancamentos(detailCard).map((e) => (
                    <div key={e.id} className={`flex items-center justify-between rounded-2xl px-3 py-2 ${e.isEstorno ? 'bg-emerald-900/20 border border-emerald-800/40' : 'bg-slate-700'}`}>
                      <div className="min-w-0 pr-2">
                        <div className="text-sm text-slate-200 truncate">{e.description}</div>
                        <div className="text-xs text-slate-400">
                          {new Date(e.date + 'T12:00:00').toLocaleDateString('pt-BR')} · {e.isEstorno ? 'Estorno' : e.category}
                          {e.installments && e.installments > 1 && ` · ${e.installmentNumber}/${e.installments}`}
                        </div>
                      </div>
                      <span className={`font-medium flex-shrink-0 ${e.isEstorno ? 'text-emerald-400' : 'text-amber-400'}`}>{fmt(e.amount)}</span>
                    </div>
                  ))
                )}
              </div>
              <button onClick={() => setDetailCard(null)} className="mt-4 w-full bg-slate-700 hover:bg-slate-600 py-2.5 rounded-full text-sm">Fechar</button>
            </div>
          </div>
        )
      })()}

      {/* Modal de edição */}
      {editingExpense && (
        <div className="fixed inset-0 bg-black/70 flex items-end sm:items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-3xl p-5 w-full max-w-sm max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-slate-200">{editingExpense.isEstorno ? 'Editar estorno' : 'Editar lançamento'}</h3>
              <button onClick={() => setEditingExpense(null)} className="text-slate-500 hover:text-slate-300"><IconX size={18} /></button>
            </div>
            <form onSubmit={handleSaveEdit} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Data</label>
                  <input type="date" value={editForm.date} onChange={(e) => setEditForm((f) => ({ ...f, date: e.target.value }))}
                    className="w-full bg-slate-700 rounded px-3 py-2 text-sm text-slate-200 border border-slate-600" />
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Valor (R$)</label>
                  <input type="number" step="0.01" value={editForm.amount} onChange={(e) => setEditForm((f) => ({ ...f, amount: e.target.value }))}
                    className="w-full bg-slate-700 rounded px-3 py-2 text-sm text-slate-200 border border-slate-600" />
                </div>
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Descrição</label>
                <input type="text" value={editForm.description} onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))}
                  className="w-full bg-slate-700 rounded px-3 py-2 text-sm text-slate-200 border border-slate-600" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Categoria</label>
                  {editingExpense.isEstorno ? (
                    <div className="w-full bg-slate-700/50 rounded px-3 py-2 text-sm text-emerald-400 border border-slate-600">↩️ Estorno</div>
                  ) : (
                    <select value={editForm.category} onChange={(e) => setEditForm((f) => ({ ...f, category: e.target.value }))}
                      className="w-full bg-slate-700 rounded px-3 py-2 text-sm text-slate-200 border border-slate-600">
                      {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                    </select>
                  )}
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Forma de pagamento</label>
                  {editingExpense.isEstorno ? (
                    <div className="w-full bg-slate-700/50 rounded px-3 py-2 text-sm text-slate-300 border border-slate-600">{methodIcon(editForm.method)} {methodLabel(editForm.method)}</div>
                  ) : (
                    <select value={editForm.method} onChange={(e) => setEditForm((f) => ({ ...f, method: e.target.value as PaymentMethod }))}
                      className="w-full bg-slate-700 rounded px-3 py-2 text-sm text-slate-200 border border-slate-600">
                      {METHODS.map((m) => <option key={m.value} value={m.value}>{m.icon} {m.label}</option>)}
                    </select>
                  )}
                </div>
              </div>
              <div className="flex gap-2 pt-1">
                <button type="submit" className="flex-1 bg-emerald-600 hover:bg-emerald-500 py-2.5 rounded-full text-sm font-medium">Salvar</button>
                <button type="button" onClick={() => setEditingExpense(null)} className="flex-1 bg-slate-700 hover:bg-slate-600 py-2.5 rounded-full text-sm">Cancelar</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
