import type { ReactNode } from 'react'
import { useStore } from '../store'
import InsightsCard from './InsightsCard'
import CardSpendGoal from './CardSpendGoal'
import { fmt, fmtPct, currentMonth, monthLabel, addMonths, CDI_MONTHLY, POUPANCA_MONTHLY, monthsRemaining, computeSaldo, computeBenefitBalance, CARD_SPEND_METHODS, CARDS, cardMethod, nextFaturaMonth, overdueFaturaMonth, faturaOpenAmount, weeklyBuckets } from '../utils'
import {
  Area, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, ComposedChart,
  LineChart, ReferenceLine, Legend,
} from 'recharts'
import {
  IconFlame, IconReceipt, IconCreditCard,
  IconTrendingUp, IconTicket, IconCheck, IconEye, IconEyeOff,
} from '@tabler/icons-react'

const COLORS = ['#7c3aed', '#d946ef', '#f97316', '#06b6d4']

export default function Dashboard() {
  const { expenses, budgets, investments, investmentRecords, aportes, annualGoal, incomeReceipts, extraordinaryIncomes, hideSaldo, toggleHideSaldo, benefitCardMonthlyAmount, benefitCardCredits } = useStore()

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
    amount: Math.max(0,
      expenses.filter((e) => e.method === cardMethod(card.id) && e.month === month).reduce((s, e) => s + e.amount, 0)
      - expenses.filter((e) => e.method === `fatura_${card.id}` && e.month === month).reduce((s, e) => s + e.amount, 0)
    ),
  }))
  const cardSpent = cardFaturas.reduce((s, f) => s + f.amount, 0)

  // Cartão Benefício — saldo contínuo (recarrega e debita, sem fechamento/vencimento mensal)
  const hasBenefitHistory = (benefitCardCredits ?? []).length > 0
  const benefitBalance = computeBenefitBalance({ benefitCardCredits: benefitCardCredits ?? [], expenses })
  const benefitSpentThisMonth = expenses
    .filter((e) => e.method === 'cartao_beneficio' && e.date.slice(0, 7) === month)
    .reduce((s, e) => s + e.amount, 0)
  // Medidor: saldo atual como fração de uma recarga mensal (não é "% usado", é "quanto sobrou")
  const benefitPct = benefitCardMonthlyAmount > 0 ? Math.max(0, Math.min((benefitBalance / benefitCardMonthlyAmount) * 100, 100)) : 0

  // Meta de gastos: mesmo valor das faturas exibidas (líquido de pagamentos)
  const cardSpentOpen = cardSpent
  const cardWeeklySpent = weeklyBuckets(
    expenses.filter((e) => cardFaturas.some((f) => e.method === cardMethod(f.card.id) && e.month === f.month))
  )
  const saldo = computeSaldo({ incomeReceipts: incomeReceipts ?? [], extraordinaryIncomes: extraordinaryIncomes ?? [], expenses, aportes: aportes ?? [] })
  const limit = budget?.limit ?? 8000

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
  const projectedPct = target > 0 ? Math.min((projectedValue / target) * 100, 100) : 0

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

  const ringR = 49
  const ringC = 2 * Math.PI * ringR
  const ringOffset = ringC - (Math.min(100, Math.max(0, goalPct)) / 100) * ringC

  return (
    <div className="space-y-4">
      {/* Cabeçalho colorido com onda */}
      <div className="relative -mx-4 -mt-2 px-4 pt-5 overflow-hidden" style={{ background: 'linear-gradient(160deg, #7c3aed, #d946ef 55%, #f97316)' }}>
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

        <div className="relative flex justify-center my-4">
          <svg width={128} height={128} viewBox="0 0 128 128">
            <circle cx={64} cy={64} r={ringR} fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth={10} />
            <circle
              cx={64} cy={64} r={ringR} fill="none" stroke="#fff" strokeWidth={10} strokeLinecap="round"
              strokeDasharray={ringC} strokeDashoffset={ringOffset} transform="rotate(-90 64 64)"
            />
            <text x="50%" y="47%" textAnchor="middle" dominantBaseline="central" className="fill-white font-extrabold" style={{ fontSize: 22 }}>
              {goalPct.toFixed(0)}%
            </text>
            <text x="50%" y="63%" textAnchor="middle" dominantBaseline="central" className="fill-white/80 font-medium" style={{ fontSize: 10 }}>
              da missão
            </text>
          </svg>
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
        <svg viewBox="0 0 320 74" className="absolute left-0 right-0 bottom-0 w-full block" style={{ height: 74 }} preserveAspectRatio="none">
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

          {/* Jornada anual — carteira mês a mês */}
          <div className="rounded-3xl p-4" style={{ background: 'rgba(124,58,237,0.08)', border: '1px solid rgba(124,58,237,0.2)' }}>
            <h2 className="font-bold text-[13px] text-slate-100 mb-3">Jornada {annualGoal.year} — carteira mês a mês</h2>
            <div className="flex flex-wrap gap-3 mb-3 text-[10px] text-slate-400">
              <span className="flex items-center gap-1.5"><span className="inline-block w-4 h-0.5 bg-emerald-400 rounded" />Carteira real</span>
              <span className="flex items-center gap-1.5"><span className="inline-block w-4 h-0.5 rounded" style={{ borderTop: '2px dashed #60a5fa', background: 'none' }} />Projeção</span>
              <span className="flex items-center gap-1.5"><span className="inline-block w-4 h-0.5 bg-amber-400 rounded" />CDI</span>
              <span className="flex items-center gap-1.5"><span className="inline-block w-4 h-0.5 bg-slate-400 rounded" />Poupança</span>
            </div>
            <ResponsiveContainer width="100%" height={190}>
              <ComposedChart data={journeyData}>
                <defs>
                  <linearGradient id="gradVal" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="name" tick={{ fill: '#948bc7', fontSize: 10 }} />
                <YAxis tick={{ fill: '#948bc7', fontSize: 10 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip
                  formatter={(v, name) => {
                    const labels: Record<string, string> = { valor: 'Carteira', projecao: 'Projeção', cdi: 'CDI', poupanca: 'Poupança' }
                    return [fmt(v as number), labels[name as string] ?? name]
                  }}
                  contentStyle={{ background: '#241e42', border: '1px solid #413764', borderRadius: 12 }}
                />
                <Area type="monotone" dataKey="valor" stroke="#10b981" fill="url(#gradVal)" strokeWidth={2.5} name="valor" connectNulls dot={false} />
                <Line type="monotone" dataKey="projecao" stroke="#3b82f6" strokeDasharray="5 3" strokeWidth={1.5} name="projecao" connectNulls dot={false} />
                <Line type="monotone" dataKey="cdi" stroke="#f59e0b" strokeWidth={1.5} name="cdi" connectNulls dot={false} strokeDasharray="3 2" />
                <Line type="monotone" dataKey="poupanca" stroke="#94a3b8" strokeWidth={1.5} name="poupanca" connectNulls dot={false} strokeDasharray="2 3" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {/* Benchmarks */}
          <div className="rounded-3xl p-4" style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.22)' }}>
            <h2 className="font-bold text-[13px] text-slate-100 mb-3">Referência mensal sobre {fmt(totalInvested)}</h2>
            <div className="grid grid-cols-3 gap-2 text-center">
              <BenchmarkCard label="CDI (10.75% aa)" value={fmt(totalInvested * CDI_MONTHLY)} pct={fmtPct(CDI_MONTHLY * 100)} />
              <BenchmarkCard label="Poupança (6.17% aa)" value={fmt(totalInvested * POUPANCA_MONTHLY)} pct={fmtPct(POUPANCA_MONTHLY * 100)} />
              <BenchmarkCard label="Aporte necessário" value={fmt(monthlyNeeded)} pct="/mês" />
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

          {/* Cartão Benefício — saldo contínuo, sem fechamento/vencimento */}
          <div className="rounded-3xl p-4" style={{ background: 'rgba(240,153,123,0.08)', border: '1px solid rgba(240,153,123,0.2)' }}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-bold text-[13px] text-slate-100 flex items-center gap-2">
                <span className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: 'rgba(240,153,123,0.2)' }}>
                  <IconTicket size={14} color="#f0997b" />
                </span>
                Cartão benefício
              </h2>
              <span className="text-[10px] text-slate-400">recarga de {fmt(benefitCardMonthlyAmount)}/mês</span>
            </div>
            {hasBenefitHistory ? (
              <div>
                <div className="flex items-center justify-between text-[11px] text-slate-300 mb-1">
                  <span>Gasto em {monthLabel(month)}: <span className="text-teal-300 font-semibold">{fmt(benefitSpentThisMonth)}</span></span>
                  <span>Saldo: <span className={`font-semibold ${benefitBalance >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{fmt(benefitBalance)}</span></span>
                </div>
                <div className="h-2.5 bg-slate-700 rounded-full overflow-hidden mb-1">
                  <div
                    className={`h-full rounded-full transition-all ${benefitPct <= 15 ? 'bg-red-500' : benefitPct <= 40 ? 'bg-amber-500' : 'bg-teal-500'}`}
                    style={{ width: `${benefitPct}%` }}
                  />
                </div>
                <div className="text-[10px] text-slate-400 text-right">{benefitPct.toFixed(0)}% de uma recarga em saldo</div>
              </div>
            ) : (
              <div className="text-center py-2">
                <div className="text-slate-400 text-sm">Nenhuma recarga confirmada ainda</div>
                <div className="text-[11px] text-slate-500 mt-0.5">Confirme na aba Gastos</div>
              </div>
            )}
          </div>

          {/* Gastos por semana */}
          <div className="rounded-3xl p-4" style={{ background: 'rgba(217,70,239,0.08)', border: '1px solid rgba(217,70,239,0.2)' }}>
            <h2 className="font-bold text-[13px] text-slate-100 mb-1">Gastos no cartão por semana — {monthLabel(cardMonth)}</h2>
            <p className="text-[11px] text-slate-400 mb-3">{CARDS.map((c) => c.label).join(' + ')} · meta ÷ 4 ({fmt(limit / 4)}/semana)</p>
            <ResponsiveContainer width="100%" height={170}>
              <LineChart data={weeklySpending}>
                <XAxis dataKey="name" tick={{ fill: '#948bc7', fontSize: 11 }} />
                <YAxis tick={{ fill: '#948bc7', fontSize: 11 }} tickFormatter={(v) => `R$${(v / 1000).toFixed(1)}k`} domain={[0, Math.max(limit / 4 * 1.3, ...weeklySpending.map((w) => w.gasto))]} />
                <Tooltip formatter={(v, name) => [fmt(v as number), name === 'gasto' ? 'Gasto' : 'Meta/semana']} contentStyle={{ background: '#241e42', border: '1px solid #413764', borderRadius: 12 }} />
                <Legend formatter={(v) => v === 'gasto' ? 'Gasto real' : 'Meta/semana'} wrapperStyle={{ fontSize: 11, color: '#948bc7' }} />
                <ReferenceLine x={`Sem ${todayWeek}`} stroke="#60a5fa" strokeDasharray="4 4" strokeWidth={1.5} label={{ value: 'Hoje', position: 'top', fill: '#60a5fa', fontSize: 10 }} />
                <Line type="monotone" dataKey="meta" name="meta" stroke="#f59e0b" strokeWidth={1.5} strokeDasharray="5 3" dot={{ fill: '#f59e0b', r: 3 }} activeDot={{ r: 5 }} />
                <Line type="monotone" dataKey="gasto" name="gasto" stroke="#d946ef" strokeWidth={2.5} dot={{ fill: '#d946ef', r: 4 }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
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

          {/* Fecho da página */}
          <div className="flex items-center justify-center gap-2 pb-1 pt-1">
            <span className="w-6 h-6 rounded-full brand-gradient-bg flex items-center justify-center">
              <IconCheck size={13} color="#fff" />
            </span>
            <span className="text-[11px] font-bold text-slate-300">Tudo em dia por aqui</span>
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

function BenchmarkCard({ label, value, pct }: { label: string; value: string; pct: string }) {
  return (
    <div className="bg-slate-700/60 rounded-2xl p-2.5">
      <div className="text-[10px] text-slate-400 mb-1">{label}</div>
      <div className="text-emerald-400 font-bold text-sm">{value}</div>
      <div className="text-[10px] text-slate-400">{pct}</div>
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
