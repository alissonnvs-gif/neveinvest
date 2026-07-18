import type { ReactNode } from 'react'
import { fmt } from '../utils'

interface CardSpendGoalProps {
  spent: number
  limit: number
  weeklySpent?: [number, number, number, number]
  slim?: boolean
  monthLabelText?: string
  headerRight?: ReactNode
  children?: ReactNode
  // true = fatura paga, false = ainda em aberto, undefined = não exibe selo (ex: sem gasto no mês)
  paid?: boolean
}

const TIERS = [
  { max: 25, color: 'from-emerald-600 to-emerald-400', text: 'text-emerald-400', msg: '😌 Tranquilo, base baixa' },
  { max: 50, color: 'from-emerald-500 to-lime-400', text: 'text-lime-400', msg: '🙂 Ritmo OK — mantenha o pé leve' },
  { max: 70, color: 'from-amber-500 to-amber-400', text: 'text-amber-400', msg: '😬 Metade da meta — ainda dá pra segurar' },
  { max: 85, color: 'from-orange-500 to-orange-400', text: 'text-orange-400', msg: '⚠️ Fatura engordando — atenção' },
  { max: 100, color: 'from-red-600 to-red-500', text: 'text-red-400', msg: '🔥 Quase estourando — freia!' },
  { max: Infinity, color: 'from-red-800 to-red-600', text: 'text-red-500', msg: '💥 Meta estourada — hora de recalcular' },
]

function getTier(pct: number) {
  return TIERS.find((t) => pct <= t.max) ?? TIERS[TIERS.length - 1]
}

export default function CardSpendGoal({ spent, limit, weeklySpent, slim, monthLabelText, headerRight, children, paid }: CardSpendGoalProps) {
  const pct = limit > 0 ? (spent / limit) * 100 : 0
  const displayPct = Math.min(pct, 100)
  const tier = getTier(pct)
  const fairShare = limit / 4
  const maxWeek = weeklySpent ? Math.max(...weeklySpent) : 0
  const heaviestWeekIdx = weeklySpent ? weeklySpent.indexOf(maxWeek) : -1

  if (slim) {
    return (
      <div>
        <div className="flex items-center justify-between mb-1 text-xs">
          <span className="text-slate-400">🛑 Meta de Cartão{monthLabelText ? ` — ${monthLabelText}` : ''}</span>
          <span className={`font-semibold ${tier.text}`}>{pct.toFixed(0)}%</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] leading-none text-slate-500 whitespace-nowrap flex-shrink-0">{fmt(spent)}</span>
          <div className="relative h-2 bg-slate-700 rounded-full overflow-hidden flex-1">
            {[25, 50, 75].map((q) => (
              <div key={q} className="absolute top-0 h-full w-px bg-slate-900/40 z-10" style={{ left: `${q}%` }} />
            ))}
            <div className={`h-full bg-gradient-to-r ${tier.color} rounded-full transition-all duration-500`} style={{ width: `${displayPct}%` }} />
          </div>
          <span className="text-[10px] leading-none text-slate-500 whitespace-nowrap flex-shrink-0">{fmt(limit)}</span>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-slate-800 rounded-xl p-4">
      <div className="flex items-center justify-between mb-1">
        <h2 className="font-semibold text-slate-200">🛑 Meta de Gastos no Cartão{monthLabelText ? ` — ${monthLabelText}` : ''}</h2>
        <div className="flex items-center gap-2">
          <span className={`text-sm font-bold ${tier.text}`}>{pct.toFixed(0)}%</span>
          {headerRight}
        </div>
      </div>
      <p className={`text-xs mb-3 ${tier.text}`}>{tier.msg}</p>

      {children}

      <div className="relative h-5 bg-slate-700 rounded-full overflow-hidden">
        {[25, 50, 75].map((q) => (
          <div key={q} className="absolute top-0 h-full w-px bg-slate-900/50 z-10" style={{ left: `${q}%` }} />
        ))}
        <div className={`h-full bg-gradient-to-r ${tier.color} rounded-full transition-all duration-500`} style={{ width: `${displayPct}%` }} />
        {pct > 100 && (
          <div className="absolute inset-0 flex items-center justify-end pr-2">
            <span className="text-[10px] font-bold text-white bg-red-700 px-1.5 py-0.5 rounded animate-pulse">+{(pct - 100).toFixed(0)}%</span>
          </div>
        )}
      </div>

      <div className="flex justify-between text-xs text-slate-400 mt-1.5">
        <span>{fmt(spent)} de {fmt(limit)}</span>
        <span>{pct >= 100 ? `Excedeu em ${fmt(spent - limit)}` : `Faltam ${fmt(limit - spent)}`}</span>
      </div>

      {paid !== undefined && (
        <div className={`text-xs font-medium mt-1.5 ${paid ? 'text-emerald-400' : 'text-amber-400'}`}>
          {paid ? '✅ Fatura paga' : '🕒 Fatura ainda não paga'}
        </div>
      )}

      {weeklySpent && (
        <>
          <div className="grid grid-cols-4 gap-1.5 mt-3">
            {weeklySpent.map((v, i) => {
              const isCritical = maxWeek > 0 && v === maxWeek && v > fairShare
              return (
                <div key={i} className={`rounded-lg px-2 py-1.5 text-center ${isCritical ? 'bg-red-900/40 border border-red-700/50' : 'bg-slate-700/60'}`}>
                  <div className={`text-[10px] ${isCritical ? 'text-red-400' : 'text-slate-500'}`}>Sem {i + 1}{isCritical ? ' 🔥' : ''}</div>
                  <div className={`text-xs font-semibold ${isCritical ? 'text-red-300' : 'text-slate-300'}`}>{fmt(v)}</div>
                </div>
              )
            })}
          </div>
          {maxWeek > fairShare && (
            <p className="text-[11px] text-red-400 mt-2">
              📌 Semana {heaviestWeekIdx + 1} foi o período mais crítico — passou da cota semanal de {fmt(fairShare)}.
            </p>
          )}
        </>
      )}
    </div>
  )
}
