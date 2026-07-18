import { useStore } from '../store'
import InsightsCard from './InsightsCard'
import CardSpendGoal from './CardSpendGoal'
import { fmt, fmtPct, currentMonth, monthLabel, CDI_MONTHLY, POUPANCA_MONTHLY, monthsRemaining, computeSaldo, computeBenefitBalance, CARD_SPEND_METHODS, nextFaturaMonth, overdueFaturaMonth, faturaOpenAmount, weeklyBuckets } from '../utils'
import {
  AreaChart, Area, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, ComposedChart,
  LineChart, ReferenceLine, Legend,
} from 'recharts'

const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#8b5cf6']

export default function Dashboard() {
  const { expenses, budgets, investments, investmentRecords, aportes, annualGoal, incomeReceipts, extraordinaryIncomes, hideSaldo, toggleHideSaldo, benefitCardMonthlyAmount, benefitCardCredits } = useStore()

  const month = currentMonth()
  const budget = [...budgets].sort((a, b) => b.month.localeCompare(a.month))[0]
  const monthExpenses = expenses.filter((e) => e.month === month)
  // Gastos efetivos do mês: tudo exceto lançamentos de cartão (cartao_xp/mp)
  const totalSpent = monthExpenses
    .filter((e) => !CARD_SPEND_METHODS.includes(e.method))
    .reduce((s, e) => s + e.amount, 0)
  // Fatura ABERTA de cada cartão (a que está acumulando compras agora, baseada só na data de hoje
  // e no dia de fechamento — não espera a fatura anterior ser paga para "virar")
  const fMXP = nextFaturaMonth('xp')
  const fMMP = nextFaturaMonth('mp')
  // Mês de referência exibido no card de meta (mesma lógica da aba Gastos): a fatura aberta mais antiga
  const cardMonth = fMXP < fMMP ? fMXP : fMMP
  // Fatura ANTERIOR já fechada mas ainda não paga (se houver), para avisar separadamente
  const overdueXP = overdueFaturaMonth(expenses, 'xp')
  const overdueMP = overdueFaturaMonth(expenses, 'mp')
  const overdueXPAmount = overdueXP ? faturaOpenAmount(expenses, 'xp', overdueXP) : 0
  const overdueMPAmount = overdueMP ? faturaOpenAmount(expenses, 'mp', overdueMP) : 0
  const faturaXP = Math.max(0,
    expenses.filter((e) => e.method === 'cartao_xp' && e.month === fMXP).reduce((s, e) => s + e.amount, 0)
    - expenses.filter((e) => e.method === 'fatura_xp' && e.month === fMXP).reduce((s, e) => s + e.amount, 0)
  )
  const faturaMP = Math.max(0,
    expenses.filter((e) => e.method === 'cartao_mp' && e.month === fMMP).reduce((s, e) => s + e.amount, 0)
    - expenses.filter((e) => e.method === 'fatura_mp' && e.month === fMMP).reduce((s, e) => s + e.amount, 0)
  )
  const cardSpent = faturaXP + faturaMP

  // Cartão Benefício — saldo contínuo (recarrega e debita, sem fechamento/vencimento mensal)
  const hasBenefitHistory = (benefitCardCredits ?? []).length > 0
  const benefitBalance = computeBenefitBalance({ benefitCardCredits: benefitCardCredits ?? [], expenses })
  const benefitSpentThisMonth = expenses
    .filter((e) => e.method === 'cartao_beneficio' && e.date.slice(0, 7) === month)
    .reduce((s, e) => s + e.amount, 0)
  // Medidor: saldo atual como fração de uma recarga mensal (não é "% usado", é "quanto sobrou")
  const benefitPct = Math.max(0, Math.min((benefitBalance / benefitCardMonthlyAmount) * 100, 100))

  // Meta de gastos: mesmo valor das faturas exibidas (líquido de pagamentos)
  const cardSpentOpen = faturaXP + faturaMP
  const cardWeeklySpent = weeklyBuckets(
    expenses.filter((e) => (e.method === 'cartao_xp' && e.month === fMXP) || (e.method === 'cartao_mp' && e.month === fMMP))
  )
  const saldo = computeSaldo({ incomeReceipts: incomeReceipts ?? [], extraordinaryIncomes: extraordinaryIncomes ?? [], expenses, aportes: aportes ?? [] })
  const limit = budget?.limit ?? 8000

  const totalInvested = investments.reduce((s, i) => s + i.currentValue, 0)
  const target = annualGoal.targetValue
  const goalPct = Math.min((totalInvested / target) * 100, 100)

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
  const projectedPct = Math.min((projectedValue / target) * 100, 100)

  // Jornada mensal da carteira (histórico real + projeção futura + benchmarks CDI/Poupança)
  const allMonths = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(annualGoal.year, 0 + i, 1)
    return d.toISOString().slice(0, 7)
  })
  const recordsByMonth = new Map<string, number>()
  allMonths.forEach((m) => {
    const recs = investmentRecords.filter((r) => r.month === m)
    if (recs.length > 0) {
      recordsByMonth.set(m, recs.reduce((s, r) => s + r.currentValue, 0))
    }
  })

  // Base para CDI/Poupança: valor inicial da carteira em jan/2026
  const baseValue = investments.reduce((s, i) => s + i.initialValue, 0) || totalInvested
  const currentMonthIdx = allMonths.indexOf(month)

  const journeyData = allMonths.map((m, idx) => {
    const isFuture = m > month
    const isCurrent = m === month
    const recorded = recordsByMonth.get(m)
    const valor = isCurrent ? totalInvested : (!isFuture && recorded) ? recorded : (isCurrent ? totalInvested : null)

    // Benchmarks compostos desde janeiro
    const cdi = baseValue * Math.pow(1 + CDI_MONTHLY, idx + 1)
    const poupanca = baseValue * Math.pow(1 + POUPANCA_MONTHLY, idx + 1)

    return {
      name: monthLabel(m).slice(0, 3),
      valor: isFuture ? null : valor,
      projecao: isFuture
        ? totalInvested + (avgMonthlyAporte + avgMonthlyReturn) * (idx - currentMonthIdx)
        : (isCurrent ? totalInvested : null),
      cdi: idx <= currentMonthIdx ? cdi : null,
      poupanca: idx <= currentMonthIdx ? poupanca : null,
    }
  })

  // Gastos no cartão por semana — acompanha a fatura aberta (fMXP/fMMP), não o mês calendário:
  // mostra os gastos feitos até agora que caem na fatura que vai vencer em breve.
  const weeklySpending = [1, 2, 3, 4].map((w) => {
    const start = (w - 1) * 7 + 1
    const end = w === 4 ? 31 : w * 7
    const total = expenses.filter((e) => {
      const day = parseInt(e.date.slice(8, 10))
      return day >= start && day <= end
        && ((e.method === 'cartao_xp' && e.month === fMXP) || (e.method === 'cartao_mp' && e.month === fMMP))
    }).reduce((s, e) => s + e.amount, 0)
    return { name: `Sem ${w}`, gasto: total, meta: limit / 4 }
  })
  // Semana em que hoje cai, para marcar "estamos aqui" no gráfico (mesmo critério do weeklyBuckets)
  const todayDay = new Date().getDate()
  const todayWeek = todayDay <= 7 ? 1 : todayDay <= 14 ? 2 : todayDay <= 21 ? 3 : 4

  // Por método
  const byMethod = ['cartao_xp', 'cartao_mp', 'pix', 'dinheiro', 'boleto'].map((method) => ({
    name: method === 'cartao_xp' ? 'Cartão XP' : method === 'cartao_mp' ? 'Mercado Pago' : method === 'pix' ? 'Pix' : method === 'dinheiro' ? 'Dinheiro' : 'Boleto',
    value: monthExpenses.filter((e) => e.method === method).reduce((s, e) => s + e.amount, 0),
  })).filter((d) => d.value > 0)

  // Marcos da meta
  const milestones = [
    { pct: 25, label: '25%', value: target * 0.25 },
    { pct: 50, label: '50%', value: target * 0.50 },
    { pct: 75, label: '75%', value: target * 0.75 },
    { pct: 100, label: '🏁', value: target },
  ]

  return (
    <div className="space-y-5">
      {/* Cards de resumo rápido */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-slate-800 rounded-xl p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <span className="text-xs text-slate-400">Saldo em Conta</span>
            <button onClick={toggleHideSaldo} className="text-slate-500 hover:text-slate-300 transition-colors text-xs" title={hideSaldo ? 'Mostrar' : 'Ocultar'}>
              {hideSaldo ? '👁️' : '🙈'}
            </button>
          </div>
          <div className={`text-lg font-bold ${saldo >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {hideSaldo ? '••••••' : fmt(saldo)}
          </div>
          <div className="text-xs text-slate-500 mt-1">rendas − gastos − aportes</div>
        </div>
        <Card label="Gasto efetivo" value={fmt(totalSpent)} sub="pix · boleto · faturas" color="yellow" />
        <Card label="Gastos no Cartão" value={fmt(cardSpent)} sub={`meta ${fmt(limit)}`} color="purple" />
        <Card label="Carteira total" value={fmt(totalInvested)} sub={`${goalPct.toFixed(1)}% da meta`} color="blue" />
      </div>

      {/* ── INSIGHTS DO DIA ── */}
      <InsightsCard />

      {/* ── MISSÃO: META R$500k ── */}
      <div className="bg-slate-800 rounded-xl p-5">
        <div className="flex items-center justify-between mb-1">
          <div>
            <h2 className="font-bold text-base text-slate-100">🎯 Missão: R$ 500.000 até Dez/2026</h2>
            <p className="text-xs text-slate-400 mt-0.5">Cada mês conta. Todo aporte te aproxima.</p>
          </div>
          <div className="text-right">
            <div className="text-2xl font-black text-emerald-400">{goalPct.toFixed(1)}%</div>
            <div className="text-xs text-slate-400">concluído</div>
          </div>
        </div>

        {/* Barra principal */}
        <div className="mt-4 mb-2">
          <div className="relative h-7 bg-slate-700 rounded-full overflow-visible">
            {/* Marcos */}
            {milestones.map((m) => (
              <div
                key={m.pct}
                className="absolute top-0 h-full flex flex-col items-center"
                style={{ left: `${m.pct}%`, transform: 'translateX(-50%)' }}
              >
                <div className={`h-full w-px ${goalPct >= m.pct ? 'bg-emerald-600' : 'bg-slate-600'}`} />
              </div>
            ))}
            {/* Barra de progresso atual */}
            <div
              className="h-full bg-gradient-to-r from-emerald-600 to-emerald-400 rounded-full transition-all duration-700 relative"
              style={{ width: `${goalPct}%` }}
            >
              {goalPct > 5 && (
                <span className="absolute right-2 top-0 h-full flex items-center text-xs font-bold text-white">
                  {fmt(totalInvested)}
                </span>
              )}
            </div>
            {/* Barra de projeção */}
            {projectedPct > goalPct && (
              <div
                className="absolute top-0 h-full bg-blue-500/30 rounded-r-full transition-all duration-700"
                style={{ left: `${goalPct}%`, width: `${Math.min(projectedPct - goalPct, 100 - goalPct)}%` }}
              />
            )}
          </div>

          {/* Labels dos marcos */}
          <div className="relative h-5 mt-1">
            {milestones.map((m) => (
              <div
                key={m.pct}
                className="absolute flex flex-col items-center"
                style={{ left: `${m.pct}%`, transform: 'translateX(-50%)' }}
              >
                <span className={`text-xs ${goalPct >= m.pct ? 'text-emerald-400 font-semibold' : 'text-slate-600'}`}>
                  {m.label}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Faltam / Projeção */}
        <div className="grid grid-cols-2 gap-3 mt-3 text-sm">
          <div className="bg-slate-700/60 rounded-lg px-3 py-2">
            <div className="text-xs text-slate-400 mb-0.5">Faltam</div>
            <div className="font-bold text-slate-100">{fmt(Math.max(0, target - totalInvested))}</div>
          </div>
          <div className="bg-blue-900/30 border border-blue-800/50 rounded-lg px-3 py-2">
            <div className="text-xs text-blue-400 mb-0.5 flex items-center gap-1">
              Projeção (ritmo atual)
              <InfoTooltip text={`Carteira atual (${fmt(totalInvested)}) + rendimento médio mensal dos últimos 6 meses (${fmt(avgMonthlyReturn)}) + aporte médio dos últimos 6 meses (${fmt(avgMonthlyAporte)}), projetados pelos ${months} meses restantes até dezembro/2026. Se não há histórico, usa CDI como rendimento estimado e R$ 0 de aporte.`} />
            </div>
            <div className="font-bold text-blue-300">{fmt(projectedValue)}</div>
          </div>
        </div>

        {/* Aportes necessários */}
        <div className="grid grid-cols-2 gap-3 mt-3 text-xs">
          <div className="bg-emerald-900/30 border border-emerald-800/40 rounded-lg px-3 py-2">
            <div className="text-slate-400 mb-0.5">Aporte/mês c/ rec. extraordinária</div>
            <div className="text-emerald-400 font-bold text-sm">{fmt(monthlyNeeded)}</div>
          </div>
          <div className="bg-slate-700/60 rounded-lg px-3 py-2">
            <div className="text-slate-400 mb-0.5">Aporte/mês só renda fixa</div>
            <div className="text-red-400 font-bold text-sm">{fmt(monthlyNeededNoExtra)}</div>
          </div>
        </div>
      </div>

      {/* Jornada anual — carteira mês a mês */}
      <div className="bg-slate-800 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-slate-200">📈 Jornada 2026 — Carteira mês a mês</h2>
        </div>
        {/* Legenda */}
        <div className="flex flex-wrap gap-3 mb-3 text-xs text-slate-400">
          <span className="flex items-center gap-1.5"><span className="inline-block w-4 h-0.5 bg-emerald-400 rounded" />Carteira real</span>
          <span className="flex items-center gap-1.5"><span className="inline-block w-4 h-0.5 bg-blue-400 rounded border-dashed" style={{borderTop:'2px dashed #60a5fa', background:'none'}} />Projeção</span>
          <span className="flex items-center gap-1.5"><span className="inline-block w-4 h-0.5 bg-amber-400 rounded" />CDI</span>
          <span className="flex items-center gap-1.5"><span className="inline-block w-4 h-0.5 bg-slate-400 rounded" />Poupança</span>
        </div>
        <ResponsiveContainer width="100%" height={200}>
          <ComposedChart data={journeyData}>
            <defs>
              <linearGradient id="gradVal" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 10 }} />
            <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
            <Tooltip
              formatter={(v, name) => {
                const labels: Record<string, string> = { valor: 'Carteira', projecao: 'Projeção', cdi: 'CDI', poupanca: 'Poupança' }
                return [fmt(v as number), labels[name as string] ?? name]
              }}
              contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }}
            />
            <Area type="monotone" dataKey="valor" stroke="#10b981" fill="url(#gradVal)" strokeWidth={2.5} name="valor" connectNulls dot={false} />
            <Line type="monotone" dataKey="projecao" stroke="#3b82f6" strokeDasharray="5 3" strokeWidth={1.5} name="projecao" connectNulls dot={false} />
            <Line type="monotone" dataKey="cdi" stroke="#f59e0b" strokeWidth={1.5} name="cdi" connectNulls dot={false} strokeDasharray="3 2" />
            <Line type="monotone" dataKey="poupanca" stroke="#94a3b8" strokeWidth={1.5} name="poupanca" connectNulls dot={false} strokeDasharray="2 3" />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Benchmarks */}
      <div className="bg-slate-800 rounded-xl p-4">
        <h2 className="font-semibold mb-3 text-slate-200">Referência mensal sobre {fmt(totalInvested)}</h2>
        <div className="grid grid-cols-3 gap-3 text-center text-sm">
          <BenchmarkCard label="CDI (10.75% aa)" value={fmt(totalInvested * CDI_MONTHLY)} pct={fmtPct(CDI_MONTHLY * 100)} />
          <BenchmarkCard label="Poupança (6.17% aa)" value={fmt(totalInvested * POUPANCA_MONTHLY)} pct={fmtPct(POUPANCA_MONTHLY * 100)} />
          <BenchmarkCard label="Aporte necessário" value={fmt(monthlyNeeded)} pct="/mês" />
        </div>
      </div>

      {/* Aviso: fatura já fechada (não aceita mais compras) mas ainda não paga */}
      {(overdueXP || overdueMP) && (
        <div className="bg-amber-900/30 border border-amber-700/50 rounded-lg px-3 py-2 text-xs text-amber-300 space-y-1">
          {overdueXP && <div>⚠️ Fatura XP de {monthLabel(overdueXP)} fechada, aguardando pagamento — {fmt(overdueXPAmount)}</div>}
          {overdueMP && <div>⚠️ Fatura Mercado Pago de {monthLabel(overdueMP)} fechada, aguardando pagamento — {fmt(overdueMPAmount)}</div>}
        </div>
      )}

      {/* Meta de gastos no cartão */}
      <CardSpendGoal
        spent={cardSpentOpen}
        limit={limit}
        weeklySpent={cardWeeklySpent}
        monthLabelText={monthLabel(cardMonth)}
      />

      {/* Cartão Benefício — saldo contínuo, sem fechamento/vencimento */}
      <div className="bg-slate-800 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-slate-200">🎫 Cartão Benefício</h2>
          <span className="text-xs text-slate-500">recarga de {fmt(benefitCardMonthlyAmount)}/mês</span>
        </div>
        {hasBenefitHistory ? (
          <div>
            <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
              <span>Gasto em {monthLabel(month)}: <span className="text-teal-300 font-semibold">{fmt(benefitSpentThisMonth)}</span></span>
              <span>Saldo atual: <span className={`font-semibold ${benefitBalance >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{fmt(benefitBalance)}</span></span>
            </div>
            <div className="h-2.5 bg-slate-700 rounded-full overflow-hidden mb-1">
              <div
                className={`h-full rounded-full transition-all ${benefitPct <= 15 ? 'bg-red-500' : benefitPct <= 40 ? 'bg-amber-500' : 'bg-teal-500'}`}
                style={{ width: `${benefitPct}%` }}
              />
            </div>
            <div className="text-xs text-slate-500 text-right">{benefitPct.toFixed(0)}% de uma recarga em saldo</div>
          </div>
        ) : (
          <div className="text-center py-2">
            <div className="text-slate-500 text-sm">Nenhuma recarga confirmada ainda</div>
            <div className="text-xs text-slate-600 mt-0.5">Confirme na aba Gastos</div>
          </div>
        )}
      </div>

      {/* Gastos por semana — fatura aberta (mesma referência do card de meta acima) */}
      <div className="bg-slate-800 rounded-xl p-4">
        <h2 className="font-semibold mb-1 text-slate-200">Gastos no Cartão por semana — {monthLabel(cardMonth)}</h2>
        <p className="text-xs text-slate-500 mb-3">XP + Mercado Pago · meta ÷ 4 ({fmt(limit / 4)}/semana)</p>
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={weeklySpending}>
            <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11 }} />
            <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} tickFormatter={(v) => `R$${(v / 1000).toFixed(1)}k`} domain={[0, Math.max(limit / 4 * 1.3, ...weeklySpending.map(w => w.gasto) )]} />
            <Tooltip formatter={(v, name) => [fmt(v as number), name === 'gasto' ? 'Gasto' : 'Meta/semana']} contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }} />
            <Legend formatter={(v) => v === 'gasto' ? 'Gasto real' : 'Meta/semana'} wrapperStyle={{ fontSize: 11, color: '#94a3b8' }} />
            <ReferenceLine x={`Sem ${todayWeek}`} stroke="#60a5fa" strokeDasharray="4 4" strokeWidth={1.5} label={{ value: 'Hoje', position: 'top', fill: '#60a5fa', fontSize: 10 }} />
            <Line type="monotone" dataKey="meta" name="meta" stroke="#f59e0b" strokeWidth={1.5} strokeDasharray="5 3" dot={{ fill: '#f59e0b', r: 3 }} activeDot={{ r: 5 }} />
            <Line type="monotone" dataKey="gasto" name="gasto" stroke="#10b981" strokeWidth={2.5} dot={{ fill: '#10b981', r: 4 }} activeDot={{ r: 6 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Distribuição por método */}
      {byMethod.length > 0 && (
        <div className="bg-slate-800 rounded-xl p-4">
          <h2 className="font-semibold mb-3 text-slate-200">Distribuição por forma de pagamento</h2>
          <div className="flex items-center">
            <ResponsiveContainer width="50%" height={160}>
              <PieChart>
                <Pie data={byMethod} dataKey="value" cx="50%" cy="50%" outerRadius={60}>
                  {byMethod.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v) => fmt(v as number)} contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }} />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex-1 space-y-2">
              {byMethod.map((d, i) => (
                <div key={d.name} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                    <span className="text-slate-300">{d.name}</span>
                  </div>
                  <span className="text-slate-200 font-medium">{fmt(d.value)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

    </div>
  )
}

function Card({ label, value, sub, color }: { label: string; value: string; sub: string; color: string }) {
  const colors: Record<string, string> = {
    green: 'text-emerald-400', red: 'text-red-400', blue: 'text-blue-400',
    purple: 'text-purple-400', yellow: 'text-yellow-400',
  }
  return (
    <div className="bg-slate-800 rounded-xl p-3">
      <div className="text-xs text-slate-400 mb-1">{label}</div>
      <div className={`text-lg font-bold ${colors[color]}`}>{value}</div>
      <div className="text-xs text-slate-500 mt-1">{sub}</div>
    </div>
  )
}

function BenchmarkCard({ label, value, pct }: { label: string; value: string; pct: string }) {
  return (
    <div className="bg-slate-700 rounded-lg p-3">
      <div className="text-xs text-slate-400 mb-1">{label}</div>
      <div className="text-emerald-400 font-bold">{value}</div>
      <div className="text-xs text-slate-400">{pct}</div>
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
