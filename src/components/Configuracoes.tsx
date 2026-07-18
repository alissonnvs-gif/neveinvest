import { useState } from 'react'
import { useStore } from '../store'
import { fmt, currentMonth, monthLabel, computeBenefitBalance } from '../utils'
import type { ExtraordinaryIncome } from '../types'
import { showSuccessToast, showErrorToast } from '../lib/toast'

const EXTRA_TYPES: { value: ExtraordinaryIncome['type']; label: string; icon: string }[] = [
  { value: 'fgts', label: 'FGTS Aniversário', icon: '🏦' },
  { value: 'bonus', label: 'Bônus', icon: '🎯' },
  { value: '13salario', label: '13º Salário', icon: '📅' },
  { value: 'ferias', label: 'Férias', icon: '🌴' },
  { value: 'judicial', label: 'Processo Judicial', icon: '⚖️' },
  { value: 'outro', label: 'Outro', icon: '💰' },
]

export default function Configuracoes() {
  const {
    incomes, budgets, extraordinaryIncomes, expenses,
    addIncome, removeIncome, upsertBudget,
    addExtraordinaryIncome, removeExtraordinaryIncome,
    benefitCardMonthlyAmount, benefitCardCredits,
    setBenefitCardMonthlyAmount, addBenefitCardCredit, removeBenefitCardCredit,
  } = useStore()

  const benefitBalance = computeBenefitBalance({ benefitCardCredits: benefitCardCredits ?? [], expenses })

  const month = currentMonth()
  const budget = budgets.find((b) => b.month === month)
  const totalIncome = incomes.reduce((s, i) => s + i.amount, 0)

  const [incomeForm, setIncomeForm] = useState({ description: '', amount: '', type: 'fixo' as 'fixo' | 'variavel' | 'extraordinario' })
  const [showExtraForm, setShowExtraForm] = useState(false)
  const [benefitAmountEdit, setBenefitAmountEdit] = useState(false)
  const [newBenefitAmount, setNewBenefitAmount] = useState(String(benefitCardMonthlyAmount))

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
    addIncome({ startMonth: month, description: incomeForm.description, amount: parseFloat(incomeForm.amount), type: incomeForm.type })
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

  return (
    <div className="space-y-5">
      {/* Rendas cadastradas (templates) */}
      <div className="bg-slate-800 rounded-xl p-4">
        <h2 className="font-semibold mb-1 text-slate-200">Rendas cadastradas</h2>
        <p className="text-xs text-slate-500 mb-2">
          Fixo projeta e pede confirmação todo mês. Variável/Extraordinário ficam pendentes em
          qualquer mês até você confirmar uma vez — depois somem da lista.
        </p>
        <div className="text-2xl font-bold text-emerald-400 mb-3">{fmt(totalIncome)}</div>

        <div className="space-y-2 mb-4">
          {incomes.map((i) => (
            <div key={i.id} className="flex justify-between items-center bg-slate-700 rounded px-3 py-2">
              <div>
                <div className="text-sm text-slate-200">{i.description}</div>
                <div className={`text-xs capitalize ${i.type === 'fixo' ? 'text-emerald-400' : i.type === 'variavel' ? 'text-blue-400' : 'text-purple-400'}`}>
                  {i.type}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-emerald-400 font-medium">{fmt(i.amount)}</span>
                <button onClick={() => { removeIncome(i.id); showSuccessToast(`Renda "${i.description}" removida.`) }} className="text-slate-500 hover:text-red-400 text-xs">✕</button>
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
              className="bg-slate-700 rounded px-3 py-2 text-sm text-slate-200 border border-slate-600"
            />
            <input
              type="number"
              value={incomeForm.amount}
              onChange={(e) => setIncomeForm((f) => ({ ...f, amount: e.target.value }))}
              placeholder="Valor (R$)"
              className="bg-slate-700 rounded px-3 py-2 text-sm text-slate-200 border border-slate-600"
            />
          </div>
          <div className="flex gap-2">
            {(['fixo', 'variavel', 'extraordinario'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setIncomeForm((f) => ({ ...f, type: t }))}
                className={`flex-1 py-1.5 rounded text-xs font-medium transition-colors
                  ${incomeForm.type === t ? 'bg-emerald-600 text-white' : 'bg-slate-700 text-slate-400 hover:bg-slate-600'}`}
              >
                {t === 'fixo' ? 'Fixo' : t === 'variavel' ? 'Variável' : 'Extraordinário'}
              </button>
            ))}
          </div>
          <button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-500 py-2 rounded text-sm font-medium">
            + Adicionar renda
          </button>
        </form>
      </div>

      {/* Receitas extraordinárias */}
      <div className="bg-slate-800 rounded-xl p-4">
        <div className="flex justify-between items-center mb-3">
          <h2 className="font-semibold text-slate-200">Receitas Extraordinárias</h2>
          <button
            onClick={() => setShowExtraForm(!showExtraForm)}
            className="text-xs bg-purple-700 hover:bg-purple-600 px-3 py-1.5 rounded font-medium"
          >
            + Adicionar
          </button>
        </div>

        {showExtraForm && (
          <form onSubmit={handleAddExtra} className="bg-slate-700 rounded-lg p-3 mb-3 space-y-2">
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
            <button type="submit" className="w-full bg-purple-600 hover:bg-purple-500 py-2 rounded text-sm font-medium">
              Salvar
            </button>
          </form>
        )}

        <div className="space-y-2">
          {(extraordinaryIncomes ?? []).length === 0 && (
            <p className="text-slate-500 text-sm text-center py-3">Nenhuma receita cadastrada</p>
          )}
          {(extraordinaryIncomes ?? []).map((e) => (
            <div key={e.id} className={`flex justify-between items-center rounded px-3 py-2 ${e.received ? 'bg-emerald-900/30' : 'bg-slate-700'}`}>
              <div>
                <div className="text-sm text-slate-200">{e.description}</div>
                <div className="text-xs text-slate-400">
                  {e.received ? `✅ Recebido em ${e.receivedDate}` : `${e.expectedDate} · ${e.probability}%`}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <div className={`font-medium ${e.received ? 'text-emerald-400' : 'text-purple-400'}`}>{fmt(e.amount)}</div>
                  {!e.received && <div className="text-xs text-slate-400">{fmt(e.amount * e.probability / 100)}</div>}
                </div>
                <button onClick={() => { removeExtraordinaryIncome(e.id); showSuccessToast(`"${e.description}" removida.`) }} className="text-slate-500 hover:text-red-400 text-xs">✕</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Cartão Benefício */}
      <div className="bg-slate-800 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-slate-200">🎫 Cartão Benefício</h2>
          <button
            onClick={() => { setBenefitAmountEdit(!benefitAmountEdit); setNewBenefitAmount(String(benefitCardMonthlyAmount)) }}
            className="text-xs text-teal-400 hover:text-teal-300"
          >
            {benefitAmountEdit ? 'Cancelar' : 'Alterar valor mensal'}
          </button>
        </div>

        <div className="flex items-center gap-4 mb-3">
          <div>
            <span className="text-xs text-slate-400 block">Valor da recarga</span>
            <span className="text-lg font-bold text-teal-300">{fmt(benefitCardMonthlyAmount)}</span>
          </div>
          <div>
            <span className="text-xs text-slate-400 block">Saldo atual</span>
            <span className={`text-lg font-bold ${benefitBalance >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{fmt(benefitBalance)}</span>
          </div>
        </div>

        {benefitAmountEdit && (
          <div className="flex gap-2 mb-4">
            <input
              type="number"
              step="0.01"
              value={newBenefitAmount}
              onChange={(e) => setNewBenefitAmount(e.target.value)}
              className="flex-1 bg-slate-700 rounded px-3 py-2 text-sm text-slate-200 border border-slate-600"
              placeholder="Novo valor (R$)"
            />
            <button
              onClick={() => {
                const v = parseFloat(newBenefitAmount)
                if (!isNaN(v) && v > 0) {
                  setBenefitCardMonthlyAmount(v)
                  showSuccessToast(`Valor da recarga do Cartão Benefício atualizado para ${fmt(v)}.`)
                  setBenefitAmountEdit(false)
                } else {
                  showErrorToast('Valor inválido.')
                }
              }}
              className="bg-teal-600 hover:bg-teal-500 px-3 py-2 rounded text-sm font-medium"
            >
              Salvar
            </button>
          </div>
        )}

        <div className="mb-2">
          <div className="text-xs text-slate-400 mb-2">Histórico de recargas:</div>
          <div className="space-y-1.5">
            {(benefitCardCredits ?? []).length === 0 ? (
              <p className="text-slate-600 text-xs text-center py-2">Nenhuma recarga confirmada ainda</p>
            ) : (
              [...(benefitCardCredits ?? [])].sort((a, b) => b.confirmedDate.localeCompare(a.confirmedDate)).map((c) => (
                <div key={c.id} className="flex items-center justify-between bg-slate-700 rounded-lg px-3 py-2">
                  <div>
                    <div className="text-sm text-slate-200">{monthLabel(c.month)}</div>
                    <div className="text-xs text-slate-400">Confirmado em {new Date(c.confirmedDate + 'T12:00:00').toLocaleDateString('pt-BR')}</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-teal-300 font-medium text-sm">{fmt(c.amount)}</span>
                    <button onClick={() => { removeBenefitCardCredit(c.id); showSuccessToast('Recarga removida.') }} className="text-slate-500 hover:text-red-400 text-xs">✕</button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <button
          onClick={() => {
            addBenefitCardCredit({
              month,
              amount: benefitCardMonthlyAmount,
              confirmedDate: new Date().toISOString().slice(0, 10),
            })
            showSuccessToast(`Recarga de ${fmt(benefitCardMonthlyAmount)} confirmada.`)
          }}
          className="w-full bg-teal-700 hover:bg-teal-600 py-2 rounded text-sm font-medium transition-colors"
        >
          + Confirmar nova recarga ({fmt(benefitCardMonthlyAmount)})
        </button>
      </div>

      {/* Meta de gastos */}
      <div className="bg-slate-800 rounded-xl p-4">
        <h2 className="font-semibold mb-3 text-slate-200">Meta de gastos do mês</h2>
        <div className="flex gap-2">
          <input
            type="number"
            defaultValue={budget?.limit ?? 8000}
            onBlur={(e) => {
              const v = parseFloat(e.target.value)
              if (isNaN(v) || v <= 0) {
                showErrorToast('Valor de meta inválido.')
                return
              }
              upsertBudget({ month, limit: v, income: totalIncome })
              showSuccessToast(`Meta de gastos do mês atualizada para ${fmt(v)}.`)
            }}
            className="flex-1 bg-slate-700 rounded px-3 py-2 text-sm text-slate-200 border border-slate-600"
            placeholder="Limite mensal"
          />
          <div className="flex items-center text-sm text-slate-400 bg-slate-700 rounded px-3 py-2 whitespace-nowrap">
            {budget && totalIncome > 0 ? `${((budget.limit / totalIncome) * 100).toFixed(0)}% da renda` : '—'}
          </div>
        </div>
      </div>
    </div>
  )
}
