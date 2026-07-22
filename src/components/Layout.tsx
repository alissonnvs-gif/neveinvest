import type { ReactNode } from 'react'

type Tab = 'dashboard' | 'gastos' | 'custos-fixos' | 'investimentos' | 'rascunhos' | 'configuracoes'

interface Props {
  active: Tab
  onChange: (t: Tab) => void
  children: ReactNode
  draftsCount?: number
  onLogout?: () => void
}

const tabs: { id: Tab; label: string; icon: string }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: '📊' },
  { id: 'gastos', label: 'Gastos', icon: '💳' },
  { id: 'custos-fixos', label: 'Fixos', icon: '📋' },
  { id: 'investimentos', label: 'Investimentos', icon: '📈' },
  { id: 'rascunhos', label: 'Rascunhos', icon: '📥' },
  { id: 'configuracoes', label: 'Config', icon: '⚙️' },
]

export default function Layout({ active, onChange, children, draftsCount = 0, onLogout }: Props) {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-slate-900/80 backdrop-blur border-b border-slate-700/60 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-2xl">🏦</span>
          <span className="font-bold text-lg brand-gradient-text">NeveInvest</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-400">
            {new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
          </span>
          {onLogout && (
            <button onClick={onLogout} className="text-xs text-slate-500 hover:text-red-400" title="Sair">
              🚪 Sair
            </button>
          )}
        </div>
      </header>

      <nav className="bg-slate-900/60 border-b border-slate-700/60 flex gap-1 px-2 py-2 overflow-x-auto">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => onChange(t.id)}
            className={`relative flex-1 min-w-[64px] py-2.5 text-sm font-medium transition-all flex flex-col items-center gap-1 rounded-2xl
              ${active === t.id
                ? 'text-white brand-gradient-bg shadow-lg shadow-fuchsia-900/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'}`}
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
