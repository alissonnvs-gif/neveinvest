import type { ReactNode, CSSProperties } from 'react'
import { useStore } from '../store'
import InsightsCard from './InsightsCard'
import CardSpendGoal from './CardSpendGoal'
import { fmt, currentMonth, monthLabel, addMonths, CDI_MONTHLY, monthsRemaining, computeSaldo, CARD_SPEND_METHODS, CARDS, cardMethod, nextFaturaMonth, overdueFaturaMonth, faturaOpenAmount, weeklyBuckets } from '../utils'
import { supabase } from '../lib/supabase'
import { Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'
import {
  IconBuildingBank, IconLogout, IconFlame, IconReceipt, IconCreditCard,
  IconTrendingUp, IconEye, IconEyeOff, IconStar, IconFlag2, IconPigMoney,
} from '@tabler/icons-react'

const COLORS = ['#7c3aed', '#d946ef', '#f97316', '#06b6d4']

export default function Dashboard() {
  const { expenses, budgets, investments, investmentRecords, aportes, annualGoal, incomeReceipts, extraordinaryIncomes, hideSaldo, toggleHideSaldo, savingsJars } = useStore()

  const month = currentMonth()
  const budget = [...budgets].sort((a, b) => b.month.localeCompare(a.month))[0]
  const monthExpenses = expenses.filter((e) => e.month === month)
  // Gastos efetivos do mês: tudo exceto lançamentos de cartão de crédito
  const totalSpent = monthExpenses
    .filter((e) => !CARD_SPEND_METHODS.includes(e.method))
    .reduce((s, e) => s + e.amount, 0)
  // Fatura ABERTA de cada cartão (a que está acumulando compras agora, baseada só na data de hoje
  // e no dia de fechamento — não espera a fatura anterior ser paga para "virar")
  const cardOpenFaturas = CARDS.map((c) => ({ card: c, month: nextFaturaMonth(c.id) }))
  // Mês de referência exibido no card de meta (mesma lógica da aba Gastos): a fatura aberta mais antiga
  const cardMonth = cardOpenFaturas.map((f) => f.month).sort()[0]
  // Fatura ANTERIOR já fechada mas ainda não paga (se houver), para avisar separadamente
  const overdueCards = CARDS.map((c) => {
    const month = overdueFaturaMonth(expenses, c.id)
    return { card: c, month, amount: month ? faturaOpenAmount(expenses, c.id, month) : 0 }
  }).filter((o) => o.month)
  const cardFaturas = cardOpenFaturas.map(({ card, month }) => ({
    card,
    month,
    amount: faturaOpenAmount(expenses, card.id, month),
  }))
  const cardSpent = cardFaturas.reduce((s, f) => s + f.amount, 0)

  // Meta de gastos: mesmo valor das faturas exibidas (líquido de pagamentos)
  const cardSpentOpen = cardSpent
  const cardWeeklySpent = weeklyBuckets(
    expenses.filter((e) => cardFaturas.some((f) => e.method === cardMethod(f.card.id) && e.month === f.month))
  )
  const saldo = computeSaldo({ incomeReceipts: incomeReceipts ?? [], extraordinaryIncomes: extraordinaryIncomes ?? [], expenses, aportes: aportes ?? [] })
  const limit = budget?.limit || 8000

  const totalInvested = investments.reduce((s, i) => s + i.currentValue, 0)
  const target = annualGoal.targetValue
  const goalPct = target > 0 ? Math.min((totalInvested / target) * 100, 100) : 0

  const months = monthsRemaining()
  const extraWeighted = (extraordinaryIncomes ?? [])
    .filter((e) => !e.received)
    .reduce((s, e) => s + e.amount * (e.probability / 100), 0)
  const gap = target - totalInvested
  const monthlyNeeded = Math.max(0, (gap - extraWeighted) / months)
  const monthlyNeededNoExtra = gap / months

  // Projeção: média dos últimos 6 meses de rendimento + aportes
  const last6Records = investmentRecords.slice(-6)
  const avgMonthlyReturn = last6Records.length > 0
    ? last6Records.reduce((s, r) => s + (r.currentValue - r.previousValue), 0) / last6Records.length
    : totalInvested * CDI_MONTHLY
  const last6Aportes = (aportes ?? []).slice(-6)
  const avgMonthlyAporte = last6Aportes.length > 0
    ? last6Aportes.reduce((s, a) => s + a.amount, 0) / last6Aportes.length
    : 0
  const projectedValue = totalInvested + (avgMonthlyAporte + avgMonthlyReturn) * months

  // Passos da jornada até a meta (visual simplificado tipo "fases")
  const journeySteps = [25, 50, 75, 100].map((pct) => ({ pct, reached: goalPct >= pct }))
  const currentStepIdx = journeySteps.filter((s) => s.reached).length

  // Gastos no cartão por semana — acompanha a fatura aberta de cada cartão, não o mês calendário:
  // mostra os gastos feitos até agora que caem na fatura que vai vencer em breve.
  const weeklySpending = [1, 2, 3, 4].map((w) => {
    const start = (w - 1) * 7 + 1
    const end = w === 4 ? 31 : w * 7
    const total = expenses.filter((e) => {
      const day = parseInt(e.date.slice(8, 10))
      return day >= start && day <= end
        && cardFaturas.some((f) => e.method === cardMethod(f.card.id) && e.month === f.month)
    }).reduce((s, e) => s + e.amount, 0)
    return { name: `Sem ${w}`, gasto: total, meta: limit / 4 }
  })
  // Semana em que hoje cai, para marcar "estamos aqui" no gráfico (mesmo critério do weeklyBuckets)
  const todayDay = new Date().getDate()
  const todayWeek = todayDay <= 7 ? 1 : todayDay <= 14 ? 2 : todayDay <= 21 ? 3 : 4

  // Por método
  const byMethod = [...CARDS.map((c) => ({ method: cardMethod(c.id), name: c.label })), { method: 'pix', name: 'Pix' }, { method: 'dinheiro', name: 'Dinheiro' }, { method: 'boleto', name: 'Boleto' }].map(({ method, name }) => ({
    name,
    value: monthExpenses.filter((e) => e.method === method).reduce((s, e) => s + e.amount, 0),
  })).filter((d) => d.value > 0)

  // Sequência de meses consecutivos com pelo menos um aporte registrado (mês atual pra trás)
  const monthsWithAporte = new Set((aportes ?? []).map((a) => a.date.slice(0, 7)))
  let streakMonths = 0
  let streakCursor = month
  while (monthsWithAporte.has(streakCursor)) {
    streakMonths++
    streakCursor = addMonths(streakCursor, -1)
  }

  return (
    <div className="space-y-4">
      {/* Cabeçalho colorido com onda */}
      <div className="relative -mx-4 px-4 pt-4 overflow-hidden" style={{ background: 'linear-gradient(160deg, #7c3aed, #d946ef 55%, #f97316)' }}>
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

        <div className="relative flex items-center justify-center gap-2 mb-1">
          <span className="text-xs font-bold text-white/85">Saldo em conta</span>
          <button onClick={toggleHideSaldo} className="text-white/70 hover:text-white transition-colors" title={hideSaldo ? 'Mostrar' : 'Ocultar'}>
            {hideSaldo ? <IconEye size={13} /> : <IconEyeOff size={13} />}
          </button>
        </div>
        <div className="relative text-center text-4xl font-extrabold text-white tracking-tight">
          {hideSaldo ? '••••••' : fmt(saldo)}
        </div>
        <div className="relative text-center text-[11px] text-white/70 mt-1">rendas − gastos − aportes</div>

        <div className="relative my-4">
          <div className="text-center text-[11px] font-bold text-white/85 mb-2">Caixinhas</div>
          {(savingsJars ?? []).length === 0 ? (
            <div className="text-center text-[11px] text-white/70 px-6">
              Crie sua primeira caixinha em Config para guardar dinheiro pra algo (carro, viagem...).
            </div>
          ) : (
            <div className="flex gap-2.5 overflow-x-auto px-1 pb-1" style={{ scrollbarWidth: 'none' }}>
              {(savingsJars ?? []).map((jar) => (
                <div key={jar.id} className="flex flex-col items-center flex-shrink-0 bg-white/15 rounded-2xl px-3 py-2.5" style={{ minWidth: 84 }}>
                  <IconPigMoney size={18} color="#fff" />
                  <span className="text-sm font-extrabold text-white mt-1 whitespace-nowrap">{fmt(jar.savedValue)}</span>
                  <span className="text-[10px] text-white/80 font-medium text-center truncate w-full">{jar.name}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {streakMonths > 0 && (
          <div className="relative flex justify-center mb-3">
            <div className="flex items-center gap-1.5 bg-white/20 rounded-full px-3 py-1.5">
              <IconFlame size={14} color="#fed7aa" />
              <span className="text-[11px] font-bold text-white">
                {streakMonths} {streakMonths === 1 ? 'mês seguido' : 'meses seguidos'} investindo
              </span>
            </div>
          </div>
        )}

        <div className="h-16" />
        <svg viewBox="0 0 320 74" className="absolute left-0 right-0 bottom-0 w-full block pointer-events-none" style={{ height: 74 }} preserveAspectRatio="none">
          <path d="M0,8 C 70,8 95,58 175,52 C 255,47 260,4 320,10 L320,74 L0,74 Z" fill="#18132e" />
        </svg>
      </div>

      {/* Corpo com leve degradê sutil */}
      <div className="-mx-4 px-4" style={{ background: 'linear-gradient(180deg, #18132e 0%, rgba(52,43,84,0.55) 28%, #18132e 100%)' }}>
        <div className="space-y-4 pt-1">

          {/* Chips de resumo */}
          <div className="grid grid-cols-3 gap-3">
            <StatChip icon={<IconReceipt size={15} color="#f0997b" />} tint="rgba(240,153,123,0.1)" border="rgba(240,153,123,0.25)" iconBg="rgba(240,153,123,0.2)" label="Gasto efetivo" value={fmt(totalSpent)} sub="pix·boleto·faturas" />
            <StatChip icon={<IconCreditCard size={15} color="#ed93b1" />} tint="rgba(237,147,177,0.1)" border="rgba(237,147,177,0.25)" iconBg="rgba(237,147,177,0.2)" label="No cartão" value={fmt(cardSpent)} sub={`meta ${fmt(limit)}`} />
            <StatChip icon={<IconTrendingUp size={15} color="#5dcaa5" />} tint="rgba(93,202,165,0.1)" border="rgba(93,202,165,0.25)" iconBg="rgba(93,202,165,0.2)" label="Carteira" value={fmt(totalInvested)} sub={`${goalPct.toFixed(1)}% da meta`} />
          </div>

          {/* Faltam / Projeção */}
          <div className="rounded-3xl p-3.5" style={{ background: 'rgba(217,70,239,0.08)', border: '1px solid rgba(217,70,239,0.2)' }}>
            <div className="flex justify-between text-[11px] mb-2">
              <span className="text-slate-300">Faltam pra meta</span>
              <span className="font-bold text-slate-100">{fmt(Math.max(0, target - totalInvested))}</span>
            </div>
            <div className="flex justify-between text-[11px] mb-2">
              <span className="text-slate-300 flex items-center gap-1">
                Projeção (ritmo atual)
                <InfoTooltip text={`Carteira atual (${fmt(totalInvested)}) + rendimento médio mensal dos últimos 6 meses (${fmt(avgMonthlyReturn)}) + aporte médio dos últimos 6 meses (${fmt(avgMonthlyAporte)}), projetados pelos ${months} meses restantes até dezembro/${annualGoal.year}. Se não há histórico, usa CDI como rendimento estimado e R$ 0 de aporte.`} />
              </span>
              <span className="font-bold text-fuchsia-300">{fmt(projectedValue)}</span>
            </div>
            <div className="flex justify-between text-[11px]">
              <span className="text-slate-300">Aporte/mês necessário</span>
              <span className="font-bold text-emerald-300">{fmt(monthlyNeeded)}</span>
            </div>
          </div>

          {/* ── INSIGHTS DO DIA ── */}
          <InsightsCard />

          {/* Jornada até a meta — caminho de fases */}
          <div className="rounded-3xl p-4" style={{ background: 'rgba(124,58,237,0.08)', border: '1px solid rgba(124,58,237,0.2)' }}>
            <h2 className="font-bold text-[13px] text-slate-100 mb-3">Sua jornada até a meta</h2>
            <div className="relative" style={{ height: 46 }}>
              <svg width="100%" height={46} viewBox="0 0 280 46" preserveAspectRatio="none" className="absolute top-2">
                <path d="M10,10 Q70,40 140,20 T270,8" fill="none" stroke="#3d3659" strokeWidth={3} strokeLinecap="round" strokeDasharray="1 10" />
              </svg>
              {journeySteps.map((s, i) => {
                const left = i === 0 ? '0%' : i === 1 ? '32%' : i === 2 ? '62%' : undefined
                const isCurrent = i === currentStepIdx
                const isLast = i === journeySteps.length - 1
                const style: CSSProperties = isLast
                  ? { right: 0, top: 0 }
                  : { left, top: i === 1 ? 26 : i === 2 ? 10 : 4 }
                return (
                  <div
                    key={s.pct}
                    className="absolute rounded-full flex items-center justify-center"
                    style={{
                      ...style,
                      width: isCurrent || isLast ? 22 : 18,
                      height: isCurrent || isLast ? 22 : 18,
                      border: '3px solid #18132e',
                      background: s.reached ? '#5dcaa5' : isCurrent ? 'linear-gradient(135deg, #7c3aed, #d946ef)' : '#3d3659',
                    }}
                  >
                    {isCurrent && !isLast && <IconStar size={10} color="#fff" />}
                    {isLast && <IconFlag2 size={10} color={s.reached ? '#fff' : '#948bc7'} />}
                  </div>
                )
              })}
            </div>
            <div className="text-[10px] text-slate-400 mt-2">
              {goalPct.toFixed(0)}% da meta — faltam {Math.max(0, 4 - currentStepIdx)} fases até {fmt(target)}
            </div>
          </div>

          {/* Aviso: fatura já fechada (não aceita mais compras) mas ainda não paga */}
          {overdueCards.length > 0 && (
            <div className="bg-amber-900/30 border border-amber-700/50 rounded-2xl px-3 py-2 text-xs text-amber-300 space-y-1">
              {overdueCards.map((o) => (
                <div key={o.card.id}>Fatura {o.card.label} de {monthLabel(o.month!)} fechada, aguardando pagamento — {fmt(o.amount)}</div>
              ))}
            </div>
          )}

          {/* Meta de gastos no cartão */}
          <CardSpendGoal
            spent={cardSpentOpen}
            limit={limit}
            weeklySpent={cardWeeklySpent}
            monthLabelText={monthLabel(cardMonth)}
          />

          {/* Gastos por semana */}
          <div className="rounded-3xl p-4" style={{ background: 'rgba(217,70,239,0.08)', border: '1px solid rgba(217,70,239,0.2)' }}>
            <h2 className="font-bold text-[13px] text-slate-100 mb-1">Gastos no cartão por semana — {monthLabel(cardMonth)}</h2>
            <p className="text-[11px] text-slate-400 mb-3">{CARDS.map((c) => c.label).join(' + ')} · meta ÷ 4 ({fmt(limit / 4)}/semana)</p>
            <div className="flex items-end gap-2" style={{ height: 60 }}>
              {weeklySpending.map((w, i) => {
                const maxVal = Math.max(limit / 4, ...weeklySpending.map((x) => x.gasto), 1)
                const heightPct = Math.max(6, (w.gasto / maxVal) * 100)
                const isCurrent = i + 1 === todayWeek
                return (
                  <div key={w.name} className="flex-1 flex flex-col items-center gap-1">
                    <div className="w-full rounded-t-lg" style={{
                      height: `${heightPct}%`,
                      background: isCurrent ? 'linear-gradient(180deg, #d946ef, #7c3aed)' : '#3d3659',
                    }} />
                  </div>
                )
              })}
            </div>
            <div className="flex gap-2 mt-1">
              {weeklySpending.map((w) => (
                <div key={w.name} className="flex-1 text-center">
                  <div className="text-[9px] text-slate-400">{w.name}</div>
                  <div className="text-[10px] font-bold text-slate-200">{fmt(w.gasto)}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Distribuição por método */}
          {byMethod.length > 0 && (
            <div className="rounded-3xl p-4" style={{ background: 'rgba(124,58,237,0.08)', border: '1px solid rgba(124,58,237,0.2)' }}>
              <h2 className="font-bold text-[13px] text-slate-100 mb-3">Distribuição por forma de pagamento</h2>
              <div className="flex items-center">
                <ResponsiveContainer width="50%" height={150}>
                  <PieChart>
                    <Pie data={byMethod} dataKey="value" cx="50%" cy="50%" outerRadius={55} innerRadius={30}>
                      {byMethod.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v) => fmt(v as number)} contentStyle={{ background: '#241e42', border: '1px solid #413764', borderRadius: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex-1 space-y-2">
                  {byMethod.map((d, i) => (
                    <div key={d.name} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                        <span className="text-slate-300 text-xs">{d.name}</span>
                      </div>
                      <span className="text-slate-100 font-bold text-xs">{fmt(d.value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

        </div>

        {/* Fecho da página — colina decorativa */}
        <div className="relative -mx-4 mt-2">
          <svg viewBox="0 0 320 60" className="w-full block" style={{ height: 60 }} preserveAspectRatio="none">
            <path d="M0,60 L0,30 C 70,5 110,45 180,25 C 240,8 280,35 320,20 L320,60 Z" fill="#241e42" />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-end pb-2.5">
            <span className="w-8 h-8 rounded-full brand-gradient-bg flex items-center justify-center mb-1" style={{ boxShadow: '0 4px 14px rgba(217,70,239,0.4)' }}>
              <IconFlag2 size={16} color="#fff" />
            </span>
            <span className="text-[10px] font-bold text-slate-200">Tudo em dia por aqui</span>
          </div>
        </div>
      </div>
    </div>
  )
}

function StatChip({ icon, label, value, sub, tint, border, iconBg }: { icon: ReactNode; label: string; value: string; sub: string; tint: string; border: string; iconBg: string }) {
  return (
    <div className="rounded-[20px] p-3 flex flex-col items-center text-center gap-1" style={{ background: tint, border: `1px solid ${border}` }}>
      <span className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: iconBg }}>{icon}</span>
      <div className="text-[10px] text-slate-300 leading-tight">{label}</div>
      <div className="text-xs font-bold text-slate-100 leading-tight">{value}</div>
      <div className="text-[9px] text-slate-400 leading-tight">{sub}</div>
    </div>
  )
}

function InfoTooltip({ text }: { text: string }) {
  return (
    <span className="relative group inline-flex items-center cursor-help">
      <span className="w-3.5 h-3.5 rounded-full bg-slate-600 text-slate-300 text-[9px] flex items-center justify-center font-bold leading-none select-none">
        i
      </span>
      <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 bg-slate-900 border border-slate-600 text-slate-300 text-xs rounded-lg px-3 py-2 shadow-xl
        opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-150 z-50 leading-relaxed">
        {text}
        <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-600" />
      </span>
    </span>
  )
}
