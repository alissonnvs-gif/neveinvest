import { useState } from 'react'
import { useStore } from '../store'
import { fmt, currentMonth, monthLabel, addMonths, getFaturaMonth, CARDS, cardMethod, faturaMethod } from '../utils'
import type { CardId } from '../config/cards'
import type { PaymentMethod, FixedCost } from '../types'
import CardSpendGoal from './CardSpendGoal'
import { showSuccessToast, showErrorToast } from '../lib/toast'

const METHODS: { value: PaymentMethod; label: string; icon: string }[] = [
  ...CARDS.map((c) => ({ value: cardMethod(c.id), label: c.label, icon: '💳' })),
  { value: 'pix', label: 'Pix', icon: '📲' },
  { value: 'dinheiro', label: 'Dinheiro', icon: '💵' },
  { value: 'boleto', label: 'Boleto', icon: '🧾' },
]

const CATEGORIES = ['Alimentação', 'Mercado', 'Saúde', 'Transporte', 'Educação', 'Lazer', 'Casa', 'Vestuário', 'Outros']


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
    addExpense, removeExpense,
  } = useStore()

  const [payingFatura, setPayingFatura] = useState<{ card: CardId; month: string; amount: number } | null>(null)
  const [faturaPayForm, setFaturaPayForm] = useState({ date: new Date().toISOString().slice(0, 10) })
  const [expandedCard, setExpandedCard] = useState<CardId | null>(null)

  // Calcula fatura aberta para um cartão em determinado mês
  function getFaturaAberta(card: CardId, fatMonth: string): number {
    const method = cardMethod(card)
    const payMethod = faturaMethod(card)
    const total = expenses.filter((e) => e.method === method && e.month === fatMonth).reduce((s, e) => s + e.amount, 0)
    const paid = expenses.filter((e) => e.method === payMethod && e.month === fatMonth).reduce((s, e) => s + e.amount, 0)
    return Math.max(0, total - paid)
  }


  // Lista os lançamentos individuais que compõem a fatura de um cartão em determinado mês
  function getFaturaLancamentos(card: CardId, fatMonth: string) {
    const method = cardMethod(card)
    return expenses
      .filter((e) => e.method === method && e.month === fatMonth)
      .sort((a, b) => b.date.localeCompare(a.date))
  }

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
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [payingCost, setPayingCost] = useState<FixedCost | null>(null)
  const [activeSection, setActiveSection] = useState<'checklist' | 'gerenciar' | 'projecao'>('checklist')

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
    addExpense({
      id: expId,
      date: payForm.date,
      description: payingCost.description,
      amount,
      method: payForm.method,
      category: payingCost.category,
      month: selectedMonth,
    } as any)
    addFixedCostPayment({
      fixedCostId: payingCost.id,
      month: selectedMonth,
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

  return (
    <div className="space-y-4">
      {/* Header com abas internas */}
      <div className="bg-slate-800 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h1 className="font-bold text-lg text-slate-100">📋 Custos Fixos</h1>
          <span className="text-xs text-slate-400">{(fixedCosts ?? []).filter((c) => c.active).length} ativos</span>
        </div>
        <div className="flex gap-2">
          {(['checklist', 'gerenciar', 'projecao'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setActiveSection(s)}
              className={`flex-1 py-1.5 rounded-lg text-sm font-medium transition-colors
                ${activeSection === s ? 'bg-emerald-600 text-white' : 'bg-slate-700 text-slate-400 hover:bg-slate-600'}`}
            >
              {s === 'checklist' ? '✅ Checklist' : s === 'gerenciar' ? '⚙️ Gerenciar' : '📆 Projeção'}
            </button>
          ))}
        </div>
      </div>

      {/* ── CHECKLIST DO MÊS ── */}
      {activeSection === 'checklist' && (
        <div className="space-y-4">
          {/* Seletor de mês */}
          <div className="bg-slate-800 rounded-xl p-4">
            <div className="flex items-center justify-between">
              <button onClick={() => setSelectedMonth(prevMonth)} className="text-slate-400 hover:text-slate-200 px-2 py-1">‹</button>
              <span className="font-semibold text-slate-200">{monthLabel(selectedMonth)}</span>
              <button onClick={() => setSelectedMonth(nextMonth)} className="text-slate-400 hover:text-slate-200 px-2 py-1">›</button>
            </div>

            {/* Resumo */}
            <div className="grid grid-cols-3 gap-3 mt-3">
              <div className="bg-slate-700 rounded-lg p-2 text-center">
                <div className="text-xs text-slate-400 mb-0.5">Projetado</div>
                <div className="text-sm font-bold text-slate-200">{fmt(totalProjected)}</div>
              </div>
              <div className="bg-emerald-900/40 rounded-lg p-2 text-center">
                <div className="text-xs text-emerald-400 mb-0.5">Pago</div>
                <div className="text-sm font-bold text-emerald-300">{fmt(totalPaid)}</div>
              </div>
              <div className="bg-amber-900/40 rounded-lg p-2 text-center">
                <div className="text-xs text-amber-400 mb-0.5">Pendente</div>
                <div className="text-sm font-bold text-amber-300">{fmt(totalPending)}</div>
              </div>
            </div>
          </div>

          {/* Meta de gastos no cartão (slim) */}
          <div className="bg-slate-800 rounded-xl p-3">
            <CardSpendGoal
              slim
              spent={totalFaturaAberta}
              limit={[...budgets].sort((a, b) => b.month.localeCompare(a.month))[0]?.limit ?? 8000}
              monthLabelText={monthLabel(selectedMonth)}
            />
          </div>

          {/* Faturas de Cartão — seção destacada */}
          {(() => {
            const faturaMonth = selectedMonth
            return (
              <div className="bg-amber-950/50 border border-amber-700/60 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-amber-400 font-semibold text-sm">💳 Faturas de Cartão</span>
                  <span className="text-xs text-amber-600">{monthLabel(faturaMonth)}</span>
                </div>
                <div className="space-y-2">
                  {CARDS.map(({ id: card, label, closingDay, dueDay }) => {
                    const amount = getFaturaAberta(card, faturaMonth)
                    const isPaid = amount === 0 &&
                      expenses.some((e) => e.method === faturaMethod(card) && e.month === faturaMonth)
                    const lancamentos = getFaturaLancamentos(card, faturaMonth)
                    const isExpanded = expandedCard === card
                    return (
                      <div key={card} className={`rounded-lg overflow-hidden border
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
                                <div className={`font-medium flex-shrink-0 ${e.isEstorno ? 'text-emerald-400' : 'text-amber-300'}`}>{fmt(e.amount)}</div>
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
          <div className="bg-slate-800 rounded-xl p-4">
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

                  return (
                    <div
                      key={cost.id}
                      className={`flex items-center gap-3 rounded-lg px-3 py-3 transition-colors
                        ${payment ? 'bg-emerald-900/30 border border-emerald-800/50' : 'bg-slate-700'}`}
                    >
                      <button
                        onClick={() => payment ? handleUnpay(cost.id) : openPayModal(cost)}
                        className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors
                          ${payment ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-slate-500 hover:border-emerald-400'}`}
                      >
                        {payment && <span className="text-xs">✓</span>}
                      </button>

                      <div className="flex-1 min-w-0">
                        <div className={`text-sm font-medium ${payment ? 'text-slate-400 line-through' : 'text-slate-200'}`}>
                          {cost.description}
                        </div>
                        <div className="text-xs text-slate-500">
                          {cost.category} · {METHODS.find((m) => m.value === cost.defaultMethod)?.icon}
                          {paidExpense && ` · pago ${fmt(paidExpense.amount)}`}
                        </div>
                      </div>

                      <div className="text-right flex-shrink-0">
                        <div className={`text-sm font-semibold ${payment ? 'text-emerald-400' : 'text-slate-200'}`}>
                          {fmt(paidExpense?.amount ?? projected)}
                        </div>
                        {!payment && cost.defaultAmount !== projected && (
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
          <div className="bg-slate-800 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-slate-200">Custos cadastrados</h2>
              <button
                onClick={() => { setShowForm(!showForm); setEditingId(null); setForm(emptyForm) }}
                className="bg-emerald-600 hover:bg-emerald-500 px-3 py-1.5 rounded-lg text-sm font-medium"
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
                  <div key={cost.id} className="bg-slate-700 rounded-lg px-3 py-2.5 flex items-center gap-3">
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
            <div className="bg-slate-800 rounded-xl p-4">
              <h2 className="font-semibold text-slate-200 mb-3">
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
                    className="flex-1 bg-slate-700 hover:bg-slate-600 py-2 rounded-lg text-sm"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleSave}
                    className="flex-1 bg-emerald-600 hover:bg-emerald-500 py-2 rounded-lg text-sm font-medium"
                  >
                    {editingId ? 'Salvar alterações' : 'Cadastrar'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── PROJEÇÃO ── */}
      {activeSection === 'projecao' && (
        <div className="bg-slate-800 rounded-xl p-4">
          <h2 className="font-semibold text-slate-200 mb-3">Projeção — próximos 6 meses</h2>
          {(fixedCosts ?? []).length === 0 ? (
            <p className="text-slate-500 text-sm text-center py-6">Nenhum custo fixo cadastrado ainda.</p>
          ) : (
            <div className="space-y-3">
              {projectionMonths.map((month) => {
                const active = (fixedCosts ?? []).filter((c) => isActiveInMonth(c, month))
                const total = active.reduce((s, c) => s + projectedAmount(c), 0)
                const isPast = month < currentMonth()
                const isCurrent = month === currentMonth()
                const paidTotal = active.filter((c) => isPaid(c.id, month)).reduce((s, c) => {
                  const p = isPaid(c.id, month)!
                  return s + (expenses.find((e) => e.id === p.expenseId)?.amount ?? 0)
                }, 0)

                const fatByCard = CARDS.map((c) => ({ card: c, amount: getFaturaAberta(c.id, month) }))
                const totalWithFatura = total + fatByCard.reduce((s, f) => s + f.amount, 0)
                return (
                  <div key={month} className={`rounded-lg p-3 ${isCurrent ? 'bg-slate-700 ring-1 ring-emerald-500' : 'bg-slate-700/60'}`}>
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
                      {active.map((c) => {
                        const payment = isPaid(c.id, month)
                        const paidAmt = payment ? expenses.find((e) => e.id === payment.expenseId)?.amount : null
                        return (
                          <div key={c.id} className="flex justify-between text-xs text-slate-400">
                            <span className={payment ? 'line-through text-slate-500' : ''}>{c.description}</span>
                            <span className={payment ? 'text-emerald-500' : ''}>{fmt(paidAmt ?? projectedAmount(c))}</span>
                          </div>
                        )
                      })}
                      {fatByCard.filter((f) => f.amount > 0).map((f) => (
                        <div key={f.card.id} className="flex justify-between text-xs text-amber-400">
                          <span>💳 Fatura {f.card.label}</span>
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

      {/* ── MODAL DE PAGAMENTO DE FATURA ── */}
      {payingFatura && (
        <div className="fixed inset-0 bg-black/70 flex items-end sm:items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-xl p-5 w-full max-w-sm">
            <h3 className="font-semibold text-amber-300 mb-1">💳 Pagar Fatura</h3>
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
              <button onClick={() => setPayingFatura(null)} className="flex-1 bg-slate-700 hover:bg-slate-600 py-2.5 rounded-lg text-sm">Cancelar</button>
              <button onClick={handlePagarFatura} className="flex-1 bg-amber-700 hover:bg-amber-600 py-2.5 rounded-lg text-sm font-medium text-white">✓ Confirmar pagamento</button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL DE PAGAMENTO ── */}
      {payingCost && (
        <div className="fixed inset-0 bg-black/70 flex items-end sm:items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-xl p-5 w-full max-w-sm">
            <h3 className="font-semibold text-slate-200 mb-1">Confirmar pagamento</h3>
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
                className="flex-1 bg-slate-700 hover:bg-slate-600 py-2.5 rounded-lg text-sm"
              >
                Cancelar
              </button>
              <button
                onClick={handlePay}
                className="flex-1 bg-emerald-600 hover:bg-emerald-500 py-2.5 rounded-lg text-sm font-medium"
              >
                ✓ Lançar como gasto
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
