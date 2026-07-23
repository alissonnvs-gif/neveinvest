import { useState } from 'react'
import type { Expense, PaymentMethod } from '../types'
import { CARD_METHODS, cardIdFromMethod, getFaturaMonth } from '../utils'
import { IconX } from '@tabler/icons-react'

interface Props {
  expense: Expense
  methods: { value: PaymentMethod; label: string; icon: string }[]
  categories: string[]
  onClose: () => void
  onSave: (id: string, patch: Partial<Omit<Expense, 'id'>>) => void
  onDelete: (id: string) => void
}

export default function ExpenseEditModal({ expense, methods, categories, onClose, onSave, onDelete }: Props) {
  const isEstorno = !!expense.isEstorno
  const [form, setForm] = useState({
    date: expense.date,
    description: expense.description,
    amount: String(Math.abs(expense.amount)),
    method: expense.method,
    category: expense.category,
  })

  function methodLabel(m: string) {
    return methods.find((x) => x.value === m)?.label ?? m
  }
  function methodIcon(m: string) {
    return methods.find((x) => x.value === m)?.icon ?? '💰'
  }

  function handleSubmit(ev: React.FormEvent) {
    ev.preventDefault()
    const amount = parseFloat(form.amount.replace(',', '.'))
    if (isNaN(amount) || amount <= 0) return
    const isCard = CARD_METHODS.includes(form.method as any)
    const month = isCard ? getFaturaMonth(form.date, cardIdFromMethod(form.method)) : form.date.slice(0, 7)
    onSave(expense.id, {
      date: form.date,
      description: form.description,
      amount: isEstorno ? -amount : amount,
      method: form.method,
      category: isEstorno ? expense.category : form.category,
      month,
    })
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-end sm:items-center justify-center z-50 p-4">
      <div className="bg-slate-800 rounded-3xl p-5 w-full max-w-sm max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-slate-200">{isEstorno ? 'Editar estorno' : 'Editar lançamento'}</h3>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300"><IconX size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-400 block mb-1">Data</label>
              <input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                className="w-full bg-slate-700 rounded px-3 py-2 text-sm text-slate-200 border border-slate-600" />
            </div>
            <div>
              <label className="text-xs text-slate-400 block mb-1">Valor (R$)</label>
              <input type="number" step="0.01" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                className="w-full bg-slate-700 rounded px-3 py-2 text-sm text-slate-200 border border-slate-600" />
            </div>
          </div>
          <div>
            <label className="text-xs text-slate-400 block mb-1">Descrição</label>
            <input type="text" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              className="w-full bg-slate-700 rounded px-3 py-2 text-sm text-slate-200 border border-slate-600" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-400 block mb-1">Categoria</label>
              {isEstorno ? (
                <div className="w-full bg-slate-700/50 rounded px-3 py-2 text-sm text-emerald-400 border border-slate-600">↩️ Estorno</div>
              ) : (
                <select value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                  className="w-full bg-slate-700 rounded px-3 py-2 text-sm text-slate-200 border border-slate-600">
                  {categories.map((c) => <option key={c}>{c}</option>)}
                </select>
              )}
            </div>
            <div>
              <label className="text-xs text-slate-400 block mb-1">Forma de pagamento</label>
              {isEstorno ? (
                <div className="w-full bg-slate-700/50 rounded px-3 py-2 text-sm text-slate-300 border border-slate-600">{methodIcon(form.method)} {methodLabel(form.method)}</div>
              ) : (
                <select value={form.method} onChange={(e) => setForm((f) => ({ ...f, method: e.target.value as PaymentMethod }))}
                  className="w-full bg-slate-700 rounded px-3 py-2 text-sm text-slate-200 border border-slate-600">
                  {methods.map((m) => <option key={m.value} value={m.value}>{m.icon} {m.label}</option>)}
                </select>
              )}
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <button type="submit" className="flex-1 bg-emerald-600 hover:bg-emerald-500 py-2.5 rounded-full text-sm font-medium">Salvar</button>
            <button type="button" onClick={onClose} className="flex-1 bg-slate-700 hover:bg-slate-600 py-2.5 rounded-full text-sm">Cancelar</button>
          </div>
          <button type="button" onClick={() => onDelete(expense.id)} className="w-full text-red-400 hover:text-red-300 text-xs py-1">
            Excluir lançamento
          </button>
        </form>
      </div>
    </div>
  )
}
