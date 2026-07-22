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
      {active !== 'dashboard' && (
        <header className="px-4 pt-4 pb-2 flex items-center justify-between max-w-5xl mx-auto w-full">
          <div className="flex items-center gap-2.5">
            <span className="w-10 h-10 rounded-full brand-gradient-bg flex items-center justify-center text-lg shadow-lg shadow-fuchsia-900/30 flex-shrink-0">🏦</span>
            <div className="leading-tight">
              <div className="font-bold text-base brand-gradient-text">NeveInvest</div>
              <div className="text-[11px] text-slate-500 capitalize">
                {new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
              </div>
            </div>
          </div>
          {onLogout && (
            <button onClick={onLogout} className="w-9 h-9 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-red-400 flex items-center justify-center transition-colors" title="Sair">
              🚪
            </button>
          )}
        </header>
      )}

      <main className={`flex-1 px-4 pb-28 max-w-5xl mx-auto w-full ${active === 'dashboard' ? '' : 'pt-2'}`}>
        {children}
      </main>

      <nav className="fixed bottom-0 left-0 right-0 flex justify-center px-3 pb-3 pt-1 pointer-events-none z-40">
        <div className="pointer-events-auto flex gap-0.5 bg-slate-900/90 backdrop-blur border border-slate-700/60 rounded-full px-1.5 py-1.5 shadow-2xl shadow-black/40 max-w-full overflow-x-auto">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => onChange(t.id)}
              title={t.label}
              className={`relative flex-shrink-0 w-11 h-11 sm:w-auto sm:px-4 rounded-full text-base font-medium transition-all flex items-center justify-center gap-1.5
                ${active === t.id
                  ? 'text-white brand-gradient-bg shadow-lg shadow-fuchsia-900/40'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'}`}
            >
              <span className="relative">
                {t.icon}
                {t.id === 'rascunhos' && draftsCount > 0 && (
                  <span className="absolute -top-1.5 -right-2.5 bg-red-500 text-white text-[10px] leading-none rounded-full min-w-[16px] h-4 flex items-center justify-center px-1">
                    {draftsCount}
                  </span>
                )}
              </span>
              <span className="hidden sm:block text-sm">{t.label}</span>
            </button>
          ))}
        </div>
      </nav>
    </div>
  )
}
