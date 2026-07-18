import type { ReactNode } from 'react'

type Tab = 'dashboard' | 'gastos' | 'custos-fixos' | 'investimentos' | 'rascunhos' | 'configuracoes'

interface Props {
  active: Tab
  onChange: (t: Tab) => void
  children: ReactNode
  draftsCount?: number
}

const tabs: { id: Tab; label: string; icon: string }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: '📊' },
  { id: 'gastos', label: 'Gastos', icon: '💳' },
  { id: 'custos-fixos', label: 'Fixos', icon: '📋' },
  { id: 'investimentos', label: 'Investimentos', icon: '📈' },
  { id: 'rascunhos', label: 'Rascunhos', icon: '📥' },
  { id: 'configuracoes', label: 'Config', icon: '⚙️' },
]

export default function Layout({ active, onChange, children, draftsCount = 0 }: Props) {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-slate-900 border-b border-slate-700 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-2xl">🏦</span>
          <span className="font-bold text-lg text-emerald-400">NeveInvest</span>
        </div>
        <span className="text-xs text-slate-400">
          {new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
        </span>
      </header>

      <nav className="bg-slate-800 border-b border-slate-700 flex">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => onChange(t.id)}
            className={`relative flex-1 py-3 text-sm font-medium transition-colors flex flex-col items-center gap-1
              ${active === t.id
                ? 'text-emerald-400 border-b-2 border-emerald-400 bg-slate-900'
                : 'text-slate-400 hover:text-slate-200'}`}
          >
            <span className="relative">
              {t.icon}
              {t.id === 'rascunhos' && draftsCount > 0 && (
                <span className="absolute -top-1.5 -right-2.5 bg-red-500 text-white text-[10px] leading-none rounded-full min-w-[16px] h-4 flex items-center justify-center px-1">
                  {draftsCount}
                </span>
              )}
            </span>
            <span className="hidden sm:block">{t.label}</span>
          </button>
        ))}
      </nav>

      <main className="flex-1 p-4 max-w-5xl mx-auto w-full">
        {children}
      </main>
    </div>
  )
}
