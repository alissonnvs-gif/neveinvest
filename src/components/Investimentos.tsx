import { useState } from 'react'
import { useStore } from '../store'
import { fmt, fmtPct, currentMonth, monthLabel, CDI_MONTHLY, POUPANCA_MONTHLY, monthsRemaining } from '../utils'
import type { Investment, AporteSource } from '../types'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, BarChart, Bar, Legend } from 'recharts'
import { showSuccessToast, showErrorToast } from '../lib/toast'

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
  'CDB': '#10b981', 'Tesouro Direto': '#3b82f6', 'LCI': '#f59e0b',
  'LCA': '#8b5cf6', 'Poupança': '#06b6d4', 'Ações': '#ef4444',
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

  return (
    <div className="space-y-5">

      {/* Meta */}
      <div className="bg-slate-800 rounded-xl p-4">
        <div className="flex justify-between items-center mb-2">
          <h2 className="font-semibold text-slate-200">Meta {annualGoal.year}: {fmt(annualGoal.targetValue)}</h2>
          <button onClick={() => setEditMeta(!editMeta)} className="text-xs text-emerald-400 hover:text-emerald-300">
            {editMeta ? 'Cancelar' : 'Editar'}
          </button>
        </div>
        {editMeta && (
          <div className="flex gap-2 mb-3">
            <input type="number" value={newMeta} onChange={(e) => setNewMeta(e.target.value)}
              className="flex-1 bg-slate-700 rounded px-3 py-1.5 text-sm text-slate-200 border border-slate-600" />
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
              className="bg-emerald-600 hover:bg-emerald-500 px-3 py-1.5 rounded text-sm font-medium">Salvar</button>
          </div>
        )}
        <div className="h-4 bg-slate-700 rounded-full overflow-hidden mb-3">
          <div className="h-full bg-emerald-500 transition-all" style={{ width: `${annualGoal.targetValue > 0 ? Math.min((totalInvested / annualGoal.targetValue) * 100, 100) : 0}%` }} />
        </div>
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div className="bg-slate-700 rounded p-2 text-center">
            <div className="text-slate-400">Atual</div>
            <div className="text-emerald-400 font-bold">{fmt(totalInvested)}</div>
          </div>
          <div className="bg-slate-700 rounded p-2 text-center">
            <div className="text-slate-400">Aporte mensal</div>
            <div className="text-blue-400 font-bold">{fmt(monthlyNeeded)}</div>
          </div>
          <div className="bg-slate-700 rounded p-2 text-center">
            <div className="text-slate-400">Falta</div>
            <div className="text-amber-400 font-bold">{fmt(Math.max(0, gap))}</div>
          </div>
        </div>
      </div>

      {/* Receitas extraordinárias pendentes */}
      {(extraordinaryIncomes ?? []).some((e) => !e.received) && (
        <div className="bg-slate-800 rounded-xl p-4">
          <h2 className="font-semibold mb-3 text-slate-200">Receitas Extraordinárias</h2>
          <div className="space-y-2">
            {(extraordinaryIncomes ?? []).filter((e) => !e.received).map((e) => (
              <div key={e.id} className="bg-slate-700 rounded-lg p-3">
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
                  className="mt-2 w-full text-xs bg-emerald-700 hover:bg-emerald-600 py-1.5 rounded font-medium">
                  Marcar como recebido
                </button>
                {receiveModal === e.id && (
                  <div className="mt-2 flex gap-2">
                    <input type="date" value={receiveDate} onChange={(ev) => setReceiveDate(ev.target.value)}
                      className="flex-1 bg-slate-600 rounded px-2 py-1.5 text-sm text-slate-200" />
                    <button onClick={() => { markExtraordinaryReceived(e.id, receiveDate); showSuccessToast(`${e.description} marcado como recebido.`); setReceiveModal(null) }}
                      className="bg-emerald-600 hover:bg-emerald-500 px-3 rounded text-sm font-medium">OK</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Gráfico evolução */}
      {portfolioHistory.length > 1 && (
        <div className="bg-slate-800 rounded-xl p-4">
          <h2 className="font-semibold mb-3 text-slate-200">Evolução da carteira</h2>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={portfolioHistory}>
              <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11 }} />
              <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(v) => fmt(v as number)} contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }} />
              <ReferenceLine y={annualGoal.targetValue} stroke="#f59e0b" strokeDasharray="4 4" />
              <Line type="monotone" dataKey="total" stroke="#10b981" strokeWidth={2} dot={{ fill: '#10b981' }} name="Carteira" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Carteira */}
      <div className="bg-slate-800 rounded-xl p-4">
        <div className="flex justify-between items-center mb-3">
          <h2 className="font-semibold text-slate-200">Carteira</h2>
          <div className="flex gap-2">
            {(aportes ?? []).length > 0 && (
              <button onClick={() => { if (confirm('Zerar todos os aportes registrados? Os valores dos investimentos não serão alterados.')) { clearAportes(); showSuccessToast('Aportes zerados.') } }}
                className="text-xs text-amber-400 hover:text-amber-300 px-2 py-1.5 rounded border border-amber-700 hover:border-amber-500">
                Zerar aportes
              </button>
            )}
            <button onClick={() => setShowAporteNew(!showAporteNew)}
              className="text-xs bg-blue-700 hover:bg-blue-600 px-3 py-1.5 rounded font-medium">
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
            <button type="submit" className="w-full bg-blue-600 hover:bg-blue-500 py-2 rounded text-sm font-medium">
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
              <div key={inv.id} className="bg-slate-700 rounded-lg p-3">
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
                      <span className="bg-slate-600 rounded px-2 py-1">
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
                  <div className="mt-2 text-xs bg-amber-900/40 border border-amber-700 text-amber-200 rounded px-2 py-1.5">
                    ⚠️ {mesesAbaixoCdi} meses consecutivos abaixo do CDI ({fmt(cdiRef)} seria o esperado). Avalie resgatar.
                  </div>
                )}

                {/* Botões de ação */}
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={() => setActivePanel(isActive && activePanel?.type === 'rendimento' ? null : { type: 'rendimento', invId: inv.id })}
                    className={`flex-1 text-xs py-2 rounded font-medium transition-colors
                      ${jaLancouMes ? 'bg-emerald-900/50 text-emerald-400 border border-emerald-700' : 'bg-emerald-700 hover:bg-emerald-600 text-white'}`}
                  >
                    {jaLancouMes ? '✓ Rendimento lançado' : '📊 Lançar rendimento'}
                  </button>
                  <button
                    onClick={() => setActivePanel(isActive && activePanel?.type === 'aporte' ? null : { type: 'aporte', invId: inv.id })}
                    className="flex-1 text-xs bg-blue-700 hover:bg-blue-600 py-2 rounded font-medium"
                  >
                    💰 Fazer aporte
                  </button>
                  <button onClick={() => setSelectedInv(selectedInv === inv.id ? null : inv.id)}
                    className="text-xs bg-slate-600 hover:bg-slate-500 px-3 py-2 rounded font-medium">
                    📈
                  </button>
                  <button onClick={() => { removeInvestment(inv.id); showSuccessToast(`${inv.name} removido.`) }} className="text-xs text-slate-500 hover:text-red-400 px-2">✕</button>
                </div>

                {/* Painel: lançar rendimento */}
                {isActive && activePanel?.type === 'rendimento' && (
                  <div className="mt-3 bg-slate-600 rounded-lg p-3 space-y-3">
                    <div className="text-xs font-medium text-emerald-300">
                      📊 Rendimento de {monthLabel(month)}
                    </div>
                    <div className="text-xs text-slate-400 bg-slate-700 rounded px-3 py-2">
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
                      className="w-full bg-emerald-600 hover:bg-emerald-500 py-2 rounded text-sm font-medium">
                      Confirmar rendimento
                    </button>
                  </div>
                )}

                {/* Painel: fazer aporte */}
                {isActive && activePanel?.type === 'aporte' && (
                  <div className="mt-3 bg-slate-600 rounded-lg p-3 space-y-3">
                    <div className="text-xs font-medium text-blue-300">
                      💰 Novo aporte em {inv.name}
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
                      className="w-full bg-blue-600 hover:bg-blue-500 py-2 rounded text-sm font-medium">
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
  )
}
