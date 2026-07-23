import { useEffect, useState } from 'react'
import { useStore } from '../store'
import { fetchPendingDrafts, resolveDraft, supabase, type TelegramDraft } from '../lib/supabase'
import { getFaturaMonth, addMonths, CARD_METHODS, cardIdFromMethod } from '../utils'
import { CATEGORIES, METHODS } from './Gastos'
import type { Expense, PaymentMethod } from '../types'
import { showSuccessToast, showErrorToast } from '../lib/toast'
import {
  IconBuildingBank, IconLogout, IconInbox, IconCheck, IconX,
} from '@tabler/icons-react'

const PAGE_GRADIENT = 'linear-gradient(160deg, #f43f5e, #a855f7)'

const POLL_MS = 15000

interface DraftForm {
  date: string
  description: string
  amount: string
  method: PaymentMethod
  category: string
  installments: string
}

function toForm(d: TelegramDraft): DraftForm {
  return {
    date: d.guessed_date,
    description: d.guessed_description,
    amount: String(d.guessed_amount),
    method: (d.guessed_method as PaymentMethod) || 'pix',
    category: d.guessed_category || 'Outros',
    installments: String(d.guessed_installments ?? 1),
  }
}

// Lança um rascunho confirmado como Expense(s) — parcela em N lançamentos ligados por
// installmentGroup quando for cartão e installments > 1, senão um único lançamento.
// Mesma lógica de divisão usada no formulário manual (Gastos.tsx).
function launchExpense(addExpense: (e: Omit<Expense, 'id'>) => void, form: DraftForm, amount: number) {
  const isCard = CARD_METHODS.includes(form.method as any)
  const card = cardIdFromMethod(form.method)
  const numInstallments = isCard ? Math.max(1, parseInt(form.installments) || 1) : 1

  if (isCard && numInstallments > 1) {
    const parcela = parseFloat((amount / numInstallments).toFixed(2))
    const firstFatura = getFaturaMonth(form.date, card)
    const groupId = crypto.randomUUID()
    for (let i = 0; i < numInstallments; i++) {
      addExpense({
        date: form.date,
        description: `${form.description} (${i + 1}/${numInstallments})`,
        amount: parcela,
        method: form.method,
        category: form.category,
        month: addMonths(firstFatura, i),
        installments: numInstallments,
        installmentNumber: i + 1,
        installmentGroup: groupId,
      })
    }
  } else {
    const month = isCard ? getFaturaMonth(form.date, card) : form.date.slice(0, 7)
    addExpense({ date: form.date, description: form.description, amount, method: form.method, category: form.category, month })
  }
}

function methodInfo(m: string) {
  return METHODS.find((x) => x.value === m) ?? { label: m, icon: '💰' }
}

function fmtBRL(v: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
}

export default function Rascunhos() {
  const addExpense = useStore((s) => s.addExpense)
  const [drafts, setDrafts] = useState<TelegramDraft[]>([])
  const [forms, setForms] = useState<Record<string, DraftForm>>({})
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [bulkBusy, setBulkBusy] = useState(false)

  async function refresh() {
    const list = await fetchPendingDrafts()
    setDrafts(list)
    setForms((prev) => {
      const next = { ...prev }
      list.forEach((d) => { if (!next[d.id]) next[d.id] = toForm(d) })
      return next
    })
    setLoading(false)
  }

  useEffect(() => {
    refresh()
    const timer = setInterval(refresh, POLL_MS)
    return () => clearInterval(timer)
  }, [])

  function updateForm(id: string, partial: Partial<DraftForm>) {
    setForms((prev) => ({ ...prev, [id]: { ...prev[id], ...partial } }))
  }

  async function handleConfirm(draft: TelegramDraft) {
    const form = forms[draft.id]
    const amount = parseFloat(form.amount.replace(',', '.'))
    if (isNaN(amount) || amount <= 0) {
      showErrorToast('Valor inválido — revise o rascunho antes de confirmar.')
      return
    }
    setBusyId(draft.id)
    launchExpense(addExpense, form, amount)
    await resolveDraft(draft.id, 'confirmed')
    showSuccessToast(`Rascunho "${form.description}" lançado.`)
    setDrafts((prev) => prev.filter((d) => d.id !== draft.id))
    setBusyId(null)
    setOpenId(null)
  }

  async function handleDiscard(draft: TelegramDraft) {
    setBusyId(draft.id)
    await resolveDraft(draft.id, 'discarded')
    showSuccessToast('Rascunho descartado.')
    setDrafts((prev) => prev.filter((d) => d.id !== draft.id))
    setBusyId(null)
    setOpenId(null)
  }

  async function handleConfirmAll() {
    if (sorted.length === 0) return
    if (!confirm(`Confirmar e lançar todos os ${sorted.length} rascunhos pendentes?`)) return
    setBulkBusy(true)
    let lancados = 0
    for (const d of sorted) {
      const form = forms[d.id]
      const amount = parseFloat(form.amount.replace(',', '.'))
      if (isNaN(amount) || amount <= 0) continue
      launchExpense(addExpense, form, amount)
      await resolveDraft(d.id, 'confirmed')
      lancados++
    }
    showSuccessToast(`${lancados} rascunho${lancados === 1 ? '' : 's'} lançado${lancados === 1 ? '' : 's'}.`)
    setDrafts([])
    setBulkBusy(false)
    setOpenId(null)
  }

  async function handleDiscardAll() {
    if (sorted.length === 0) return
    if (!confirm(`Descartar todos os ${sorted.length} rascunhos pendentes?`)) return
    setBulkBusy(true)
    for (const d of sorted) {
      await resolveDraft(d.id, 'discarded')
    }
    showSuccessToast(`${sorted.length} rascunho${sorted.length === 1 ? '' : 's'} descartado${sorted.length === 1 ? '' : 's'}.`)
    setDrafts([])
    setBulkBusy(false)
    setOpenId(null)
  }

  const sorted = [...drafts].sort((a, b) => {
    if (a.guessed_date !== b.guessed_date) return b.guessed_date.localeCompare(a.guessed_date)
    return b.created_at.localeCompare(a.created_at)
  })

  const openDraft = sorted.find((d) => d.id === openId) ?? null
  const openForm = openDraft ? forms[openDraft.id] : null
  const isCardMethod = openForm ? CARD_METHODS.includes(openForm.method as any) : false
  const busy = openDraft ? busyId === openDraft.id : false

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
          <div className="text-[11px] text-white/75">Rascunhos do Telegram pendentes</div>
          <div className="text-3xl font-extrabold text-white">{loading ? '—' : sorted.length}</div>
          <div className="text-[11px] text-white/70 mt-1">Gastos enviados pelo Telegram ficam aqui até você revisar e confirmar. Nada é lançado sem sua confirmação.</div>
        </div>
        <div className="h-16" />
        <svg viewBox="0 0 320 74" className="absolute left-0 right-0 bottom-0 w-full block pointer-events-none" style={{ height: 74 }} preserveAspectRatio="none">
          <path d="M0,8 C 70,8 95,58 175,52 C 255,47 260,4 320,10 L320,74 L0,74 Z" fill="#18132e" />
        </svg>
      </div>

      {/* Corpo com leve degradê sutil */}
      <div className="-mx-4 px-4" style={{ background: 'linear-gradient(180deg, #18132e 0%, rgba(52,43,84,0.55) 22%, #18132e 100%)' }}>
      <div className="space-y-4 pt-1">

      {loading ? (
        <p className="text-slate-500 text-sm text-center py-6">Carregando...</p>
      ) : sorted.length === 0 ? (
        <div className="flex items-center justify-center gap-2 py-8">
          <span className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: PAGE_GRADIENT }}>
            <IconInbox size={16} color="#fff" />
          </span>
          <span className="text-slate-300 text-sm">Nenhum rascunho pendente</span>
        </div>
      ) : (
        <>
          <div className="flex gap-2">
            <button disabled={bulkBusy} onClick={handleConfirmAll}
              className="flex-1 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 py-2 rounded-full text-xs font-medium flex items-center justify-center gap-1">
              <IconCheck size={13} />Confirmar todos ({sorted.length})
            </button>
            <button disabled={bulkBusy} onClick={handleDiscardAll}
              className="flex-1 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 py-2 rounded-full text-xs flex items-center justify-center gap-1">
              <IconX size={13} />Descartar todos ({sorted.length})
            </button>
          </div>

          <div className="rounded-3xl overflow-hidden" style={{ background: 'rgba(168,85,247,0.08)', border: '1px solid rgba(168,85,247,0.2)' }}>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-slate-500 border-b border-slate-700">
                  <th className="text-left font-medium px-3 py-2">Data</th>
                  <th className="text-left font-medium px-3 py-2">Descrição</th>
                  <th className="text-left font-medium px-3 py-2">Usuário</th>
                  <th className="text-left font-medium px-3 py-2">Categoria</th>
                  <th className="text-left font-medium px-3 py-2">Forma</th>
                  <th className="text-right font-medium px-3 py-2">Valor</th>
                  <th className="text-center font-medium px-3 py-2">Ação</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((d) => {
                  const info = methodInfo(d.guessed_method)
                  const rowBusy = busyId === d.id || bulkBusy
                  return (
                    <tr key={d.id} onClick={() => setOpenId(d.id)}
                      className="border-b border-slate-700/50 last:border-0 cursor-pointer hover:bg-slate-700/50 transition-colors">
                      <td className="px-3 py-2.5 text-slate-300 whitespace-nowrap">
                        {new Date(d.guessed_date + 'T12:00:00').toLocaleDateString('pt-BR')}
                      </td>
                      <td className="px-3 py-2.5 text-slate-200 max-w-[160px] truncate" title={forms[d.id]?.description ?? d.guessed_description}>
                        {forms[d.id]?.description ?? d.guessed_description}
                      </td>
                      <td className="px-3 py-2.5 text-slate-400">{d.sender_name ?? '—'}</td>
                      <td className="px-3 py-2.5 text-slate-400">{d.guessed_category}</td>
                      <td className="px-3 py-2.5 text-slate-400 whitespace-nowrap">{info.icon} {info.label}</td>
                      <td className="px-3 py-2.5 text-right text-emerald-400 font-medium whitespace-nowrap">
                        {fmtBRL(d.guessed_amount)}
                        {parseInt(forms[d.id]?.installments ?? String(d.guessed_installments)) > 1 && (
                          <span className="ml-1 text-amber-300 text-xs">
                            {forms[d.id]?.installments ?? d.guessed_installments}x
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            disabled={rowBusy}
                            onClick={(e) => { e.stopPropagation(); handleConfirm(d) }}
                            title="Confirmar e lançar"
                            className="w-7 h-7 flex items-center justify-center rounded-full bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white">
                            <IconCheck size={13} />
                          </button>
                          <button
                            disabled={rowBusy}
                            onClick={(e) => { e.stopPropagation(); handleDiscard(d) }}
                            title="Descartar"
                            className="w-7 h-7 flex items-center justify-center rounded-full bg-slate-600 hover:bg-slate-500 disabled:opacity-50 text-white">
                            <IconX size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      </div>

      {/* Fecho da página — colina decorativa */}
      <div className="relative -mx-4 mt-2">
        <svg viewBox="0 0 320 60" className="w-full block" style={{ height: 60 }} preserveAspectRatio="none">
          <path d="M0,60 L0,30 C 70,5 110,45 180,25 C 240,8 280,35 320,20 L320,60 Z" fill="#241e42" />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-end pb-2.5">
          <span className="w-8 h-8 rounded-full flex items-center justify-center mb-1" style={{ background: PAGE_GRADIENT, boxShadow: '0 4px 14px rgba(168,85,247,0.4)' }}>
            <IconInbox size={16} color="#fff" />
          </span>
          <span className="text-[10px] font-bold text-slate-200">Tudo em dia por aqui</span>
        </div>
      </div>
      </div>

      {openDraft && openForm && (
        <div className="fixed inset-0 bg-black/70 flex items-end sm:items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-3xl p-5 w-full max-w-sm max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-1">
              <h3 className="font-bold text-slate-200">Revisar rascunho</h3>
              <button onClick={() => setOpenId(null)} className="text-slate-500 hover:text-slate-300"><IconX size={18} /></button>
            </div>
            <div className="text-xs text-slate-500 italic mb-4">
              {openDraft.sender_name && <span className="not-italic font-medium text-slate-400">{openDraft.sender_name}: </span>}
              "{openDraft.raw_text}"
            </div>

            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Data</label>
                  <input type="date" value={openForm.date} onChange={(e) => updateForm(openDraft.id, { date: e.target.value })}
                    className="w-full bg-slate-700 rounded px-3 py-2 text-sm text-slate-200 border border-slate-600" />
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Valor (R$)</label>
                  <input type="number" step="0.01" value={openForm.amount} onChange={(e) => updateForm(openDraft.id, { amount: e.target.value })}
                    className="w-full bg-slate-700 rounded px-3 py-2 text-sm text-slate-200 border border-slate-600" />
                </div>
              </div>

              <div>
                <label className="text-xs text-slate-400 block mb-1">Descrição</label>
                <input type="text" value={openForm.description} onChange={(e) => updateForm(openDraft.id, { description: e.target.value })}
                  className="w-full bg-slate-700 rounded px-3 py-2 text-sm text-slate-200 border border-slate-600" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Categoria</label>
                  <select value={openForm.category} onChange={(e) => updateForm(openDraft.id, { category: e.target.value })}
                    className="w-full bg-slate-700 rounded px-3 py-2 text-sm text-slate-200 border border-slate-600">
                    {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Forma de pagamento</label>
                  <select value={openForm.method} onChange={(e) => updateForm(openDraft.id, { method: e.target.value as PaymentMethod })}
                    className="w-full bg-slate-700 rounded px-3 py-2 text-sm text-slate-200 border border-slate-600">
                    {METHODS.map((m) => <option key={m.value} value={m.value}>{m.icon} {m.label}</option>)}
                  </select>
                </div>
              </div>

              {isCardMethod && (
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Parcelas</label>
                  <div className="flex gap-1 flex-wrap">
                    {['1','2','3','4','5','6','7','8','9','10','11','12'].map((n) => (
                      <button key={n} type="button" onClick={() => updateForm(openDraft.id, { installments: n })}
                        className={`px-2.5 py-1 rounded text-xs font-medium transition-colors
                          ${openForm.installments === n ? 'bg-amber-600 text-white' : 'bg-slate-700 text-slate-400 hover:bg-slate-600'}`}>
                        {n}x
                      </button>
                    ))}
                  </div>
                  {parseInt(openForm.installments) > 1 && openForm.amount && (
                    <div className="mt-1 text-xs text-amber-300">
                      {openForm.installments}x de {fmtBRL(parseFloat(openForm.amount.replace(',', '.')) / parseInt(openForm.installments))}
                    </div>
                  )}
                </div>
              )}

              {isCardMethod && (
                <div className="text-xs text-amber-300 bg-amber-900/30 border border-amber-700/50 rounded-lg px-3 py-2">
                  Vai para a fatura de {getFaturaMonth(openForm.date, cardIdFromMethod(openForm.method))}.
                </div>
              )}

              <div className="flex gap-2 pt-1">
                <button disabled={busy} onClick={() => handleConfirm(openDraft)}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 py-2.5 rounded-full text-sm font-medium">
                  Confirmar e lançar
                </button>
                <button disabled={busy} onClick={() => handleDiscard(openDraft)}
                  className="flex-1 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 py-2.5 rounded-full text-sm">
                  Descartar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
