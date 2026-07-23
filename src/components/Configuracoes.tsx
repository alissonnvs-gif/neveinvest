import { useState } from 'react'
import { useStore } from '../store'
import { fmt, currentMonth, computeBenefitBalance, monthLabel } from '../utils'
import { showSuccessToast, showErrorToast } from '../lib/toast'
import { supabase } from '../lib/supabase'
import { IconBuildingBank, IconLogout, IconSettings, IconTicket, IconX, IconPigMoney, IconPlus, IconMinus } from '@tabler/icons-react'

const PAGE_GRADIENT = 'linear-gradient(160deg, #584f7c, #3d3659)'

export default function Configuracoes() {
  const {
    incomes, budgets, expenses, upsertBudget,
    benefitCardMonthlyAmount, benefitCardCredits,
    setBenefitCardMonthlyAmount, addBenefitCardCredit, removeBenefitCardCredit,
    savingsJars, addSavingsJar, removeSavingsJar, depositToSavingsJar, withdrawFromSavingsJar,
  } = useStore()

  const benefitBalance = computeBenefitBalance({ benefitCardCredits: benefitCardCredits ?? [], expenses })

  const month = currentMonth()
  const budget = budgets.find((b) => b.month === month)
  const totalIncome = incomes.reduce((s, i) => s + i.amount, 0)

  const [benefitAmountEdit, setBenefitAmountEdit] = useState(false)
  const [newBenefitAmount, setNewBenefitAmount] = useState(String(benefitCardMonthlyAmount))

  const [showJarForm, setShowJarForm] = useState(false)
  const [jarName, setJarName] = useState('')
  const [jarMove, setJarMove] = useState<{ id: string; type: 'depositar' | 'retirar' } | null>(null)
  const [jarMoveAmount, setJarMoveAmount] = useState('')

  function handleAddJar(ev: React.FormEvent) {
    ev.preventDefault()
    if (!jarName) {
      showErrorToast('Dê um nome pra caixinha.')
      return
    }
    addSavingsJar({ name: jarName, savedValue: 0, createdAt: new Date().toISOString() })
    showSuccessToast(`Caixinha "${jarName}" criada.`)
    setJarName('')
    setShowJarForm(false)
  }

  function openJarMove(id: string, type: 'depositar' | 'retirar') {
    setJarMove({ id, type })
    setJarMoveAmount('')
  }

  function handleConfirmJarMove() {
    if (!jarMove) return
    const v = parseFloat(jarMoveAmount.replace(',', '.'))
    if (isNaN(v) || v <= 0) {
      showErrorToast('Valor inválido.')
      return
    }
    if (jarMove.type === 'depositar') {
      depositToSavingsJar(jarMove.id, v)
      showSuccessToast(`${fmt(v)} depositado na caixinha.`)
    } else {
      withdrawFromSavingsJar(jarMove.id, v)
      showSuccessToast(`${fmt(v)} retirado da caixinha.`)
    }
    setJarMove(null)
  }

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
        <div className="relative text-center mb-2">
          <div className="text-[11px] text-white/75">Renda total cadastrada</div>
          <div className="text-3xl font-extrabold text-white">{fmt(totalIncome)}</div>
        </div>
        <div className="h-16" />
        <svg viewBox="0 0 320 74" className="absolute left-0 right-0 bottom-0 w-full block pointer-events-none" style={{ height: 74 }} preserveAspectRatio="none">
          <path d="M0,8 C 70,8 95,58 175,52 C 255,47 260,4 320,10 L320,74 L0,74 Z" fill="#18132e" />
        </svg>
      </div>

      {/* Corpo com leve degradê sutil */}
      <div className="-mx-4 px-4" style={{ background: 'linear-gradient(180deg, #18132e 0%, rgba(52,43,84,0.55) 22%, #18132e 100%)' }}>
      <div className="space-y-4 pt-1">

      {/* Cartão Benefício */}
      <div className="rounded-3xl p-4" style={{ background: 'rgba(45,212,191,0.08)', border: '1px solid rgba(45,212,191,0.2)' }}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-[13px] text-slate-100 flex items-center gap-2">
            <span className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: 'rgba(45,212,191,0.2)' }}>
              <IconTicket size={14} color="#5eead4" />
            </span>
            Cartão benefício
          </h2>
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
              className="bg-teal-600 hover:bg-teal-500 px-3 py-2 rounded-full text-sm font-medium"
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
                <div key={c.id} className="flex items-center justify-between bg-slate-800 rounded-2xl px-3 py-2">
                  <div>
                    <div className="text-sm text-slate-200">{monthLabel(c.month)}</div>
                    <div className="text-xs text-slate-400">Confirmado em {new Date(c.confirmedDate + 'T12:00:00').toLocaleDateString('pt-BR')}</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-teal-300 font-medium text-sm">{fmt(c.amount)}</span>
                    <button onClick={() => { removeBenefitCardCredit(c.id); showSuccessToast('Recarga removida.') }} className="text-slate-500 hover:text-red-400"><IconX size={13} /></button>
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
          className="w-full bg-teal-700 hover:bg-teal-600 py-2 rounded-full text-sm font-medium transition-colors"
        >
          + Confirmar nova recarga ({fmt(benefitCardMonthlyAmount)})
        </button>
      </div>

      {/* Caixinhas */}
      <div className="rounded-3xl p-4" style={{ background: 'rgba(217,70,239,0.08)', border: '1px solid rgba(217,70,239,0.2)' }}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-[13px] text-slate-100 flex items-center gap-2">
            <span className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: 'rgba(217,70,239,0.2)' }}>
              <IconPigMoney size={14} color="#f0abfc" />
            </span>
            Caixinhas
          </h2>
          <button
            onClick={() => setShowJarForm(!showJarForm)}
            className="text-xs bg-fuchsia-700 hover:bg-fuchsia-600 px-3 py-1.5 rounded-full font-medium"
          >
            {showJarForm ? 'Cancelar' : '+ Nova caixinha'}
          </button>
        </div>

        {showJarForm && (
          <form onSubmit={handleAddJar} className="bg-slate-800 rounded-2xl p-3 mb-3 space-y-2">
            <div>
              <label className="text-xs text-slate-400 block mb-1">Nome (ex: Carro, Viagem...)</label>
              <input
                value={jarName}
                onChange={(e) => setJarName(e.target.value)}
                className="w-full bg-slate-600 rounded px-2 py-1.5 text-sm text-slate-200"
              />
            </div>
            <button type="submit" className="w-full bg-fuchsia-600 hover:bg-fuchsia-500 py-2 rounded-full text-sm font-medium">
              Criar caixinha
            </button>
          </form>
        )}

        <div className="space-y-2">
          {(savingsJars ?? []).length === 0 && (
            <p className="text-slate-500 text-sm text-center py-3">Nenhuma caixinha criada ainda.</p>
          )}
          {(savingsJars ?? []).map((jar) => (
            <div key={jar.id} className="bg-slate-800 rounded-2xl px-3 py-2.5">
              <div className="flex justify-between items-center mb-2">
                <div className="text-sm text-slate-200">{jar.name}</div>
                <div className="flex items-center gap-3">
                  <span className="text-fuchsia-400 font-bold text-sm">{fmt(jar.savedValue)}</span>
                  <button onClick={() => { if (confirm(`Remover a caixinha "${jar.name}"?`)) { removeSavingsJar(jar.id); showSuccessToast('Caixinha removida.') } }} className="text-slate-500 hover:text-red-400"><IconX size={13} /></button>
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => openJarMove(jar.id, 'depositar')} className="flex-1 flex items-center justify-center gap-1 bg-emerald-700/40 hover:bg-emerald-700/60 text-emerald-300 py-1.5 rounded-full text-xs font-medium">
                  <IconPlus size={13} /> Depositar
                </button>
                <button onClick={() => openJarMove(jar.id, 'retirar')} className="flex-1 flex items-center justify-center gap-1 bg-slate-700 hover:bg-slate-600 text-slate-300 py-1.5 rounded-full text-xs font-medium">
                  <IconMinus size={13} /> Retirar
                </button>
              </div>
              {jarMove?.id === jar.id && (
                <div className="flex gap-2 mt-2">
                  <input
                    type="number"
                    value={jarMoveAmount}
                    onChange={(e) => setJarMoveAmount(e.target.value)}
                    autoFocus
                    className="flex-1 bg-slate-700 rounded px-3 py-1.5 text-sm text-slate-200 border border-slate-600"
                    placeholder={jarMove.type === 'depositar' ? 'Valor a depositar (R$)' : 'Valor a retirar (R$)'}
                  />
                  <button onClick={handleConfirmJarMove} className="bg-fuchsia-600 hover:bg-fuchsia-500 px-3 py-1.5 rounded-full text-sm font-medium">
                    Confirmar
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Meta de gastos */}
      <div className="rounded-3xl p-4" style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.22)' }}>
        <h2 className="font-bold text-[13px] text-slate-100 mb-3">Meta de gastos do mês</h2>
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

      {/* Fecho da página — colina decorativa */}
      <div className="relative -mx-4 mt-2">
        <svg viewBox="0 0 320 60" className="w-full block" style={{ height: 60 }} preserveAspectRatio="none">
          <path d="M0,60 L0,30 C 70,5 110,45 180,25 C 240,8 280,35 320,20 L320,60 Z" fill="#241e42" />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-end pb-2.5">
          <span className="w-8 h-8 rounded-full flex items-center justify-center mb-1" style={{ background: PAGE_GRADIENT, boxShadow: '0 4px 14px rgba(88,79,124,0.5)' }}>
            <IconSettings size={16} color="#fff" />
          </span>
          <span className="text-[10px] font-bold text-slate-200">Tudo em dia por aqui</span>
        </div>
      </div>
      </div>
    </div>
  )
}
