import { useState } from 'react'
import { useStore } from '../store'
import { fmt, fmtPct, currentMonth, monthLabel, CDI_MONTHLY, POUPANCA_MONTHLY, monthsRemaining } from '../utils'
import type { Investment, AporteSource } from '../types'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, BarChart, Bar, Legend } from 'recharts'
import { showSuccessToast, showErrorToast } from '../lib/toast'
import {
  IconChartLine, IconTrendingUp, IconCheck, IconX, IconWallet,
} from '@tabler/icons-react'

const PAGE_GRADIENT = 'linear-gradient(160deg, #10b981, #06b6d4)'

const TYPES: Investment['type'][] = ['CDB', 'Tesouro Direto', 'LCI', 'LCA', 'Poupança', 'Ações', 'FII', 'Outro']

const SOURCES: { value: AporteSource; label: string; icon: string }[] = [
  { value: 'salario', label: 'Salário', icon: '💼' },
  { value: 'bonus', label: 'Bônus', icon: '🎯' },
  { value: 'fgts', label: 'FGTS', icon: '🏦' },
  { value: 'ferias', label: 'Férias', icon: '🌴' },
  { value: '13salario', label: '13º', icon: '📅' },
  { value: 'judicial', label: 'Judicial', icon: '⚖️' },
  { value: 'outro', label: 'Outro', icon: '💰' },
]

const TYPE_COLORS: Record<string, string> = {
  'CDB': '#7c3aed', 'Tesouro Direto': '#3b82f6', 'LCI': '#f59e0b',
  'LCA': '#d946ef', 'Poupança': '#06b6d4', 'Ações': '#ef4444',
  'FII': '#f97316', 'Outro': '#6b7280',
}

type ActivePanel = null | { type: 'rendimento' | 'aporte'; invId: string }

export default function Investimentos() {
  const {
    investments, investmentRecords, aportes, annualGoal, extraordinaryIncomes,
    addInvestment, updateInvestment, removeInvestment,
    addInvestmentRecord, addAporte, removeAporte, clearAportes,
    updateAnnualGoal, markExtraordinaryReceived,
  } = useStore()

  const month = currentMonth()

  const [activePanel, setActivePanel] = useState<ActivePanel>(null)
  const [showAddInv, setShowAddInv] = useState(false)
  const [showAporteNew, setShowAporteNew] = useState(false) // aporte em investimento novo
  const [editMeta, setEditMeta] = useState(false)
  const [newMeta, setNewMeta] = useState(String(annualGoal.targetValue))
  const [selectedInv, setSelectedInv] = useState<string | null>(null)
  const [receiveModal, setReceiveModal] = useState<string | null>(null)
  const [receiveDate, setReceiveDate] = useState(new Date().toISOString().slice(0, 10))

  // Formulário: lançar rendimento
  const [rendForm, setRendForm] = useState({ currentValue: '' })

  // Formulário: fazer aporte em investimento existente
  const [aporteForm, setAporteForm] = useState({
    amount: '',
    source: 'salario' as AporteSource,
    date: new Date().toISOString().slice(0, 10),
    description: '',
  })

  // Formulário: novo investimento + aporte inicial
  const [newInvForm, setNewInvForm] = useState({
    name: '', type: 'CDB' as Investment['type'],
    startDate: new Date().toISOString().slice(0, 10),
    amount: '', source: 'salario' as AporteSource, description: '',
  })

  const totalInvested = investments.reduce((s, i) => s + i.currentValue, 0)
  const months = monthsRemaining()
  const judicialWeighted = (extraordinaryIncomes ?? [])
    .filter((e) => !e.received)
    .reduce((s, e) => s + e.amount * (e.probability / 100), 0)
  const gap = annualGoal.targetValue - totalInvested
  const monthlyNeeded = Math.max(0, (gap - judicialWeighted) / months)

  // Histórico consolidado
  const allMonths = [...new Set(investmentRecords.map((r) => r.month))].sort()
  const portfolioHistory = allMonths.map((m) => {
    const recs = investmentRecords.filter((r) => r.month === m)
    const total = recs.reduce((s, r) => s + r.currentValue, 0)
    const rendimento = recs.reduce((s, r) => s + (r.currentValue - r.previousValue), 0)
    const totalAportes = (aportes ?? [])
      .filter((a) => a.date.slice(0, 7) === m)
      .reduce((s, a) => s + a.amount, 0)
    return { name: monthLabel(m), total, rendimento, aporte: totalAportes }
  })
  if (portfolioHistory.length === 0)
    portfolioHistory.push({ name: monthLabel(month), total: totalInvested, rendimento: 0, aporte: 0 })

  function submitRendimento(invId: string) {
    const inv = investments.find((i) => i.id === invId)!
    const currentValue = parseFloat(rendForm.currentValue)
    if (isNaN(currentValue)) {
      showErrorToast('Valor inválido para o rendimento.')
      return
    }
    addInvestmentRecord({ investmentId: invId, month, previousValue: inv.currentValue, currentValue })
    updateInvestment(invId, { currentValue })
    showSuccessToast(`Rendimento de ${inv.name} lançado.`)
    setActivePanel(null)
    setRendForm({ currentValue: '' })
  }

  function submitAporte(invId: string) {
    const amount = parseFloat(aporteForm.amount)
    if (isNaN(amount) || amount <= 0) {
      showErrorToast('Valor de aporte inválido.')
      return
    }
    const inv = investments.find((i) => i.id === invId)
    addAporte({
      investmentId: invId,
      date: aporteForm.date,
      amount,
      source: aporteForm.source,
      description: aporteForm.description,
    })
    showSuccessToast(`Aporte de ${fmt(amount)} em ${inv?.name ?? 'investimento'} confirmado.`)
    setActivePanel(null)
    setAporteForm({ amount: '', source: 'salario', date: new Date().toISOString().slice(0, 10), description: '' })
  }

  function submitNewInvestment(ev: React.FormEvent) {
    ev.preventDefault()
    const amount = parseFloat(newInvForm.amount)
    if (!newInvForm.name || isNaN(amount)) {
      showErrorToast('Preencha nome e valor do investimento.')
      return
    }
    const newId = crypto.randomUUID()
    const fromSalary = newInvForm.source === 'salario'
    // Se a origem é salário, o dinheiro sai da conta → cria aporte (que debita o saldo)
    // Outras origens (FGTS, bônus, judicial...) não passam pela conta corrente
    addInvestment({ id: newId, name: newInvForm.name, type: newInvForm.type, currentValue: fromSalary ? 0 : amount, initialValue: amount, startDate: newInvForm.startDate } as any)
    if (fromSalary) {
      addAporte({ investmentId: newId, date: newInvForm.startDate, amount, source: newInvForm.source, description: newInvForm.description || `Aporte inicial — ${newInvForm.name}` })
    }
    showSuccessToast(`Investimento "${newInvForm.name}" criado.`)
    setShowAporteNew(false)
    setNewInvForm({ name: '', type: 'CDB', startDate: new Date().toISOString().slice(0, 10), amount: '', source: 'salario', description: '' })
  }

  // Histórico de aportes de um ativo
  const aportesByInv = (invId: string) =>
    (aportes ?? []).filter((a) => a.investmentId === invId).sort((a, b) => b.date.localeCompare(a.date))

  // Histórico de rendimento de um ativo
  const recordsByInv = (invId: string) =>
    investmentRecords.filter((r) => r.investmentId === invId).sort((a, b) => a.month.localeCompare(b.month))

  const selectedChartData = selectedInv
    ? recordsByInv(selectedInv).map((r) => ({
        name: monthLabel(r.month),
        rendimento: r.currentValue - r.previousValue,
        cdi: r.previousValue * CDI_MONTHLY,
      }))
    : []

  const alreadyLancedThisMonth = (invId: string) =>
    investmentRecords.some((r) => r.investmentId === invId && r.month === month)

  const goalPct = annualGoal.targetValue > 0 ? Math.min(100, (totalInvested / annualGoal.targetValue) * 100) : 0
  const ringR = 49
  const ringC = 2 * Math.PI * ringR
  const ringOffset = ringC - (goalPct / 100) * ringC

  return (
    <div className="space-y-4">
      {/* Cabeçalho colorido com onda */}
      <div className="relative -mx-4 -mt-2 px-4 pt-4 overflow-hidden" style={{ background: PAGE_GRADIENT }}>
        <div className="relative flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <span className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
              <IconChartLine size={17} color="#fff" />
            </span>
            <span className="font-bold text-sm text-white">Investimentos</span>
          </div>
          <button onClick={() => setEditMeta(!editMeta)} className="text-[11px] text-white/85 underline">
            {editMeta ? 'cancelar' : 'editar meta'}
          </button>
        </div>

        {editMeta && (
          <div className="relative flex gap-2 mb-4">
            <input type="number" value={newMeta} onChange={(e) => setNewMeta(e.target.value)}
              className="flex-1 bg-white/15 rounded-xl px-3 py-1.5 text-sm text-white placeholder-white/50 border border-white/25" />
            <button onClick={() => {
              const v = parseFloat(newMeta)
              if (isNaN(v) || v <= 0) {
                showErrorToast('Valor de meta inválido.')
                return
              }
              updateAnnualGoal({ targetValue: v })
              showSuccessToast(`Meta anual atualizada para ${fmt(v)}.`)
              setEditMeta(false)
            }}
              className="bg-white text-emerald-700 px-3 py-1.5 rounded-full text-sm font-bold">Salvar</button>
          </div>
        )}

        <div className="relative text-center mb-1">
          <div className="text-[11px] text-white/80">Meta {annualGoal.year}</div>
          <div className="text-2xl font-extrabold text-white">{fmt(annualGoal.targetValue)}</div>
        </div>

        <div className="relative flex justify-center my-3">
          <svg width={128} height={128} viewBox="0 0 128 128">
            <circle cx={64} cy={64} r={ringR} fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth={10} />
            <circle cx={64} cy={64} r={ringR} fill="none" stroke="#fff" strokeWidth={10} strokeLinecap="round" strokeDasharray={ringC} strokeDashoffset={ringOffset} transform="rotate(-90 64 64)" />
            <text x="50%" y="47%" textAnchor="middle" dominantBaseline="central" className="fill-white font-extrabold" style={{ fontSize: 22 }}>{goalPct.toFixed(0)}%</text>
            <text x="50%" y="63%" textAnchor="middle" dominantBaseline="central" className="fill-white/80" style={{ fontSize: 10 }}>{fmt(totalInvested)}</text>
          </svg>
        </div>

        <div className="relative grid grid-cols-2 gap-2 mb-4">
          <div className="bg-white/15 rounded-2xl p-2 text-center">
            <div className="text-[10px] text-white/75">Aporte/mês necessário</div>
            <div className="text-white font-bold text-sm">{fmt(monthlyNeeded)}</div>
          </div>
          <div className="bg-white/15 rounded-2xl p-2 text-center">
            <div className="text-[10px] text-white/75">Falta pra meta</div>
            <div className="text-white font-bold text-sm">{fmt(Math.max(0, gap))}</div>
          </div>
        </div>

        <div className="h-8" />
        <svg viewBox="0 0 320 74" className="absolute left-0 right-0 bottom-0 w-full block" style={{ height: 74 }} preserveAspectRatio="none">
          <path d="M0,8 C 70,8 95,58 175,52 C 255,47 260,4 320,10 L320,74 L0,74 Z" fill="#18132e" />
        </svg>
      </div>

      {/* Corpo com leve degradê sutil */}
      <div className="-mx-4 px-4" style={{ background: 'linear-gradient(180deg, #18132e 0%, rgba(52,43,84,0.55) 22%, #18132e 100%)' }}>
      <div className="space-y-4 pt-1">

      {/* Receitas extraordinárias pendentes */}
      {(extraordinaryIncomes ?? []).some((e) => !e.received) && (
        <div className="rounded-3xl p-4" style={{ background: 'rgba(93,202,165,0.08)', border: '1px solid rgba(93,202,165,0.2)' }}>
          <h2 className="font-bold text-[13px] text-slate-100 mb-3">Receitas extraordinárias</h2>
          <div className="space-y-2">
            {(extraordinaryIncomes ?? []).filter((e) => !e.received).map((e) => (
              <div key={e.id} className="bg-slate-800 rounded-2xl p-3">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="text-sm text-slate-200">{e.description}</div>
                    <div className="text-xs text-slate-400">{monthLabel(e.expectedDate)} · {e.probability}% chance</div>
                  </div>
                  <div className="text-right">
                    <div className="text-emerald-400 font-bold">{fmt(e.amount)}</div>
                    <div className="text-xs text-slate-400">{fmt(e.amount * e.probability / 100)} ponderado</div>
                  </div>
                </div>
                <button onClick={() => setReceiveModal(e.id)}
                  className="mt-2 w-full text-xs bg-emerald-700 hover:bg-emerald-600 py-1.5 rounded-full font-medium">
                  Marcar como recebido
                </button>
                {receiveModal === e.id && (
                  <div className="mt-2 flex gap-2">
                    <input type="date" value={receiveDate} onChange={(ev) => setReceiveDate(ev.target.value)}
                      className="flex-1 bg-slate-600 rounded px-2 py-1.5 text-sm text-slate-200" />
                    <button onClick={() => { markExtraordinaryReceived(e.id, receiveDate); showSuccessToast(`${e.description} marcado como recebido.`); setReceiveModal(null) }}
                      className="bg-emerald-600 hover:bg-emerald-500 px-3 rounded-full text-sm font-medium">OK</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Gráfico evolução */}
      {portfolioHistory.length > 1 && (
        <div className="rounded-3xl p-4" style={{ background: 'rgba(6,182,212,0.08)', border: '1px solid rgba(6,182,212,0.2)' }}>
          <h2 className="font-bold text-[13px] text-slate-100 mb-3">Evolução da carteira</h2>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={portfolioHistory}>
              <XAxis dataKey="name" tick={{ fill: '#948bc7', fontSize: 11 }} />
              <YAxis tick={{ fill: '#948bc7', fontSize: 11 }} tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(v) => fmt(v as number)} contentStyle={{ background: '#241e42', border: '1px solid #413764', borderRadius: 12 }} />
              <ReferenceLine y={annualGoal.targetValue} stroke="#f59e0b" strokeDasharray="4 4" />
              <Line type="monotone" dataKey="total" stroke="#10b981" strokeWidth={2} dot={{ fill: '#10b981' }} name="Carteira" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Carteira */}
      <div className="rounded-3xl p-4" style={{ background: 'rgba(124,58,237,0.08)', border: '1px solid rgba(124,58,237,0.2)' }}>
        <div className="flex justify-between items-center mb-3">
          <h2 className="font-bold text-[13px] text-slate-100">Carteira</h2>
          <div className="flex gap-2">
            {(aportes ?? []).length > 0 && (
              <button onClick={() => { if (confirm('Zerar todos os aportes registrados? Os valores dos investimentos não serão alterados.')) { clearAportes(); showSuccessToast('Aportes zerados.') } }}
                className="text-xs text-amber-400 hover:text-amber-300 px-2 py-1.5 rounded border border-amber-700 hover:border-amber-500">
                Zerar aportes
              </button>
            )}
            <button onClick={() => setShowAporteNew(!showAporteNew)}
              className="text-xs brand-gradient-bg text-white hover:opacity-90 transition-opacity px-3 py-1.5 rounded-full font-medium">
              + Novo investimento
            </button>
          </div>
        </div>

        {/* Formulário novo investimento */}
        {showAporteNew && (
          <form onSubmit={submitNewInvestment} className="bg-slate-700 rounded-lg p-3 mb-4 space-y-3">
            <div className="text-xs font-medium text-blue-300 mb-1">Novo investimento + aporte inicial</div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-slate-400 block mb-1">Nome</label>
                <input value={newInvForm.name} onChange={(e) => setNewInvForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Ex: LCI Banco Inter" className="w-full bg-slate-600 rounded px-2 py-1.5 text-sm text-slate-200" />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Tipo</label>
                <select value={newInvForm.type} onChange={(e) => setNewInvForm((f) => ({ ...f, type: e.target.value as Investment['type'] }))}
                  className="w-full bg-slate-600 rounded px-2 py-1.5 text-sm text-slate-200">
                  {TYPES.map((t) => <option key={t}>{t}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-slate-400 block mb-1">Valor aplicado (R$)</label>
                <input type="number" value={newInvForm.amount} onChange={(e) => setNewInvForm((f) => ({ ...f, amount: e.target.value }))}
                  placeholder="0,00" className="w-full bg-slate-600 rounded px-2 py-1.5 text-sm text-slate-200" />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Data</label>
                <input type="date" value={newInvForm.startDate} onChange={(e) => setNewInvForm((f) => ({ ...f, startDate: e.target.value }))}
                  className="w-full bg-slate-600 rounded px-2 py-1.5 text-sm text-slate-200" />
              </div>
            </div>
            <div>
              <label className="text-xs text-slate-400 block mb-1">Origem do dinheiro</label>
              <div className="grid grid-cols-4 gap-1">
                {SOURCES.map((s) => (
                  <button key={s.value} type="button" onClick={() => setNewInvForm((f) => ({ ...f, source: s.value }))}
                    className={`py-1.5 rounded text-xs font-medium transition-colors
                      ${newInvForm.source === s.value ? 'bg-blue-600 text-white' : 'bg-slate-600 text-slate-400 hover:bg-slate-500'}`}>
                    {s.icon} {s.label}
                  </button>
                ))}
              </div>
            </div>
            <button type="submit" className="w-full brand-gradient-bg text-white hover:opacity-90 transition-opacity py-2 rounded-full text-sm font-medium">
              Criar e aplicar
            </button>
          </form>
        )}

        {/* Lista de investimentos */}
        <div className="space-y-3">
          {investments.map((inv) => {
            const records = recordsByInv(inv.id)
            const lastRecord = records[records.length - 1]
            const rendimento = lastRecord ? lastRecord.currentValue - lastRecord.previousValue : null
            const rendimentoPct = rendimento !== null && lastRecord && lastRecord.previousValue > 0
              ? (rendimento / lastRecord.previousValue) * 100 : null
            const cdiRef = (lastRecord?.previousValue ?? inv.currentValue) * CDI_MONTHLY
            const vsBenchmark = rendimento !== null ? rendimento - cdiRef : null
            const share = totalInvested > 0 ? (inv.currentValue / totalInvested) * 100 : 0
            const invAportes = aportesByInv(inv.id)
            const totalAportado = invAportes.reduce((s, a) => s + a.amount, 0)
            const jaLancouMes = alreadyLancedThisMonth(inv.id)

            const mesesAbaixoCdi = (() => {
              const rev = [...records].reverse()
              const idx = rev.findIndex((r) => (r.currentValue - r.previousValue) >= r.previousValue * CDI_MONTHLY)
              return idx === -1 ? rev.length : idx
            })()

            const isActive = activePanel?.invId === inv.id

            return (
              <div key={inv.id} className="bg-slate-800 rounded-2xl p-3">
                {/* Cabeçalho */}
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full mt-1 flex-shrink-0" style={{ background: TYPE_COLORS[inv.type] ?? '#6b7280' }} />
                    <div>
                      <div className="font-medium text-slate-200">{inv.name}</div>
                      <div className="text-xs text-slate-400">{inv.type} · {share.toFixed(1)}% da carteira</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-emerald-400 font-bold text-lg">{fmt(inv.currentValue)}</div>
                    {rendimentoPct !== null && (
                      <div className={`text-xs ${rendimento! >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {fmtPct(rendimentoPct)} último mês
                      </div>
                    )}
                  </div>
                </div>

                {/* Badges resumo */}
                <div className="mt-2 flex flex-wrap gap-2 text-xs">
                  {lastRecord && (
                    <>
                      <span className="bg-slate-700 rounded-full px-2 py-1">
                        Rendimento: <span className={rendimento! >= 0 ? 'text-emerald-400' : 'text-red-400'}>{fmt(rendimento!)}</span>
                      </span>
                      <span className={`rounded px-2 py-1 ${vsBenchmark! >= 0 ? 'bg-emerald-900/50 text-emerald-400' : 'bg-amber-900/50 text-amber-400'}`}>
                        vs CDI: {vsBenchmark! >= 0 ? '+' : ''}{fmt(vsBenchmark!)}
                      </span>
                    </>
                  )}
                  {totalAportado > 0 && (
                    <span className="bg-blue-900/50 text-blue-400 rounded px-2 py-1">
                      Total aportado: {fmt(totalAportado)}
                    </span>
                  )}
                </div>

                {/* Alerta CDI */}
                {mesesAbaixoCdi >= 2 && lastRecord && (
                  <div className="mt-2 text-xs bg-amber-900/40 border border-amber-700 text-amber-200 rounded-xl px-2 py-1.5">
                    {mesesAbaixoCdi} meses consecutivos abaixo do CDI ({fmt(cdiRef)} seria o esperado). Avalie resgatar.
                  </div>
                )}

                {/* Botões de ação */}
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={() => setActivePanel(isActive && activePanel?.type === 'rendimento' ? null : { type: 'rendimento', invId: inv.id })}
                    className={`flex-1 text-xs py-2 rounded-full font-medium transition-colors flex items-center justify-center gap-1
                      ${jaLancouMes ? 'bg-emerald-900/50 text-emerald-400 border border-emerald-700' : 'bg-emerald-700 hover:bg-emerald-600 text-white'}`}
                  >
                    {jaLancouMes ? <><IconCheck size={13} />Rendimento lançado</> : <><IconTrendingUp size={13} />Lançar rendimento</>}
                  </button>
                  <button
                    onClick={() => setActivePanel(isActive && activePanel?.type === 'aporte' ? null : { type: 'aporte', invId: inv.id })}
                    className="flex-1 text-xs bg-blue-700 hover:bg-blue-600 py-2 rounded-full font-medium flex items-center justify-center gap-1"
                  >
                    <IconWallet size={13} />Fazer aporte
                  </button>
                  <button onClick={() => setSelectedInv(selectedInv === inv.id ? null : inv.id)}
                    className="text-xs bg-slate-700 hover:bg-slate-600 px-3 py-2 rounded-full font-medium">
                    <IconChartLine size={13} />
                  </button>
                  <button onClick={() => { removeInvestment(inv.id); showSuccessToast(`${inv.name} removido.`) }} className="text-xs text-slate-500 hover:text-red-400 px-2"><IconX size={13} /></button>
                </div>

                {/* Painel: lançar rendimento */}
                {isActive && activePanel?.type === 'rendimento' && (
                  <div className="mt-3 bg-slate-700 rounded-2xl p-3 space-y-3">
                    <div className="text-xs font-medium text-emerald-300 flex items-center gap-1">
                      <IconTrendingUp size={13} />Rendimento de {monthLabel(month)}
                    </div>
                    <div className="text-xs text-slate-400 bg-slate-800 rounded-xl px-3 py-2">
                      Valor anterior: <span className="text-slate-200 font-medium">{fmt(inv.currentValue)}</span>
                    </div>
                    <div>
                      <label className="text-xs text-slate-400 block mb-1">Quanto está valendo agora? (R$)</label>
                      <input
                        type="number"
                        value={rendForm.currentValue}
                        onChange={(e) => setRendForm({ currentValue: e.target.value })}
                        placeholder={String(inv.currentValue)}
                        className="w-full bg-slate-700 rounded px-3 py-2 text-sm text-slate-200 border border-slate-600"
                        autoFocus
                      />
                      {rendForm.currentValue && (
                        <div className="mt-1 text-xs">
                          {(() => {
                            const diff = parseFloat(rendForm.currentValue) - inv.currentValue
                            const pct = (diff / inv.currentValue) * 100
                            return (
                              <span className={diff >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                                {diff >= 0 ? '+' : ''}{fmt(diff)} ({fmtPct(pct)}) vs CDI esperado: {fmt(inv.currentValue * CDI_MONTHLY)}
                              </span>
                            )
                          })()}
                        </div>
                      )}
                    </div>
                    <button onClick={() => submitRendimento(inv.id)}
                      className="w-full bg-emerald-600 hover:bg-emerald-500 py-2 rounded-full text-sm font-medium">
                      Confirmar rendimento
                    </button>
                  </div>
                )}

                {/* Painel: fazer aporte */}
                {isActive && activePanel?.type === 'aporte' && (
                  <div className="mt-3 bg-slate-700 rounded-2xl p-3 space-y-3">
                    <div className="text-xs font-medium text-blue-300 flex items-center gap-1">
                      <IconWallet size={13} />Novo aporte em {inv.name}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs text-slate-400 block mb-1">Valor (R$)</label>
                        <input type="number" value={aporteForm.amount} onChange={(e) => setAporteForm((f) => ({ ...f, amount: e.target.value }))}
                          placeholder="0,00" className="w-full bg-slate-700 rounded px-3 py-2 text-sm text-slate-200 border border-slate-600" autoFocus />
                      </div>
                      <div>
                        <label className="text-xs text-slate-400 block mb-1">Data</label>
                        <input type="date" value={aporteForm.date} onChange={(e) => setAporteForm((f) => ({ ...f, date: e.target.value }))}
                          className="w-full bg-slate-700 rounded px-3 py-2 text-sm text-slate-200 border border-slate-600" />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs text-slate-400 block mb-1">Origem do dinheiro</label>
                      <div className="grid grid-cols-4 gap-1">
                        {SOURCES.map((s) => (
                          <button key={s.value} type="button" onClick={() => setAporteForm((f) => ({ ...f, source: s.value }))}
                            className={`py-1.5 rounded text-xs font-medium transition-colors
                              ${aporteForm.source === s.value ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-400 hover:bg-slate-600'}`}>
                            {s.icon} {s.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <input value={aporteForm.description} onChange={(e) => setAporteForm((f) => ({ ...f, description: e.target.value }))}
                      placeholder="Observação (opcional)" className="w-full bg-slate-700 rounded px-3 py-2 text-sm text-slate-200 border border-slate-600" />
                    <button onClick={() => submitAporte(inv.id)}
                      className="w-full bg-blue-600 hover:bg-blue-500 py-2 rounded-full text-sm font-medium">
                      Confirmar aporte
                    </button>

                    {/* Histórico de aportes */}
                    {invAportes.length > 0 && (
                      <div>
                        <div className="text-xs text-slate-400 mb-1">Aportes anteriores</div>
                        <div className="space-y-1 max-h-36 overflow-y-auto">
                          {invAportes.map((a) => (
                            <div key={a.id} className="flex justify-between items-center bg-slate-700 rounded px-2 py-1.5 text-xs">
                              <div>
                                <span className="text-slate-300">{new Date(a.date + 'T12:00:00').toLocaleDateString('pt-BR')}</span>
                                <span className="text-slate-500 ml-2">{SOURCES.find((s) => s.value === a.source)?.icon} {SOURCES.find((s) => s.value === a.source)?.label}</span>
                                {a.description && <span className="text-slate-500 ml-1">— {a.description}</span>}
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-blue-400 font-medium">{fmt(a.amount)}</span>
                                <button onClick={() => { removeAporte(a.id); showSuccessToast('Aporte removido.') }} className="text-slate-600 hover:text-red-400">✕</button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Gráfico histórico individual */}
                {selectedInv === inv.id && selectedChartData.length > 0 && (
                  <div className="mt-3">
                    <div className="text-xs text-slate-400 mb-2">Rendimento mensal vs CDI</div>
                    <ResponsiveContainer width="100%" height={140}>
                      <BarChart data={selectedChartData}>
                        <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 10 }} />
                        <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} tickFormatter={(v) => `R$${(v / 1000).toFixed(1)}k`} />
                        <Tooltip formatter={(v) => fmt(v as number)} contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }} />
                        <Legend wrapperStyle={{ fontSize: 10, color: '#94a3b8' }} />
                        <Bar dataKey="rendimento" fill="#10b981" radius={[2, 2, 0, 0]} name="Rendimento" />
                        <Bar dataKey="cdi" fill="#475569" radius={[2, 2, 0, 0]} name="CDI Ref." />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      </div>

      {/* Fecho da página — colina decorativa */}
      <div className="relative -mx-4 mt-2">
        <svg viewBox="0 0 320 60" className="w-full block" style={{ height: 60 }} preserveAspectRatio="none">
          <path d="M0,60 L0,30 C 70,5 110,45 180,25 C 240,8 280,35 320,20 L320,60 Z" fill="#241e42" />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-end pb-2.5">
          <span className="w-8 h-8 rounded-full flex items-center justify-center mb-1" style={{ background: PAGE_GRADIENT, boxShadow: '0 4px 14px rgba(16,185,129,0.4)' }}>
            <IconChartLine size={16} color="#fff" />
          </span>
          <span className="text-[10px] font-bold text-slate-200">Tudo em dia por aqui</span>
        </div>
      </div>
      </div>
    </div>
  )
}
