import { useState } from 'react'
import { useStore } from '../store'
import { fmt, currentMonth, computeBenefitBalance, monthLabel } from '../utils'
import { showSuccessToast, showErrorToast } from '../lib/toast'
import { supabase } from '../lib/supabase'
import { IconBuildingBank, IconLogout, IconSettings, IconTicket, IconX } from '@tabler/icons-react'

const PAGE_GRADIENT = 'linear-gradient(160deg, #584f7c, #3d3659)'

export default function Configuracoes() {
  const {
    incomes, budgets, expenses, upsertBudget,
    benefitCardMonthlyAmount, benefitCardCredits,
    setBenefitCardMonthlyAmount, addBenefitCardCredit, removeBenefitCardCredit,
  } = useStore()

  const benefitBalance = computeBenefitBalance({ benefitCardCredits: benefitCardCredits ?? [], expenses })

  const month = currentMonth()
  const budget = budgets.find((b) => b.month === month)
  const totalIncome = incomes.reduce((s, i) => s + i.amount, 0)

  const [benefitAmountEdit, setBenefitAmountEdit] = useState(false)
  const [newBenefitAmount, setNewBenefitAmount] = useState(String(benefitCardMonthlyAmount))

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
