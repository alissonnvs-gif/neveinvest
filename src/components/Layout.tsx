import type { ReactNode } from 'react'
import {
  IconHome, IconCreditCard, IconClipboardList, IconChartLine, IconInbox, IconSettings,
} from '@tabler/icons-react'

type Tab = 'dashboard' | 'gastos' | 'custos-fixos' | 'investimentos' | 'rascunhos' | 'configuracoes'

interface Props {
  active: Tab
  onChange: (t: Tab) => void
  children: ReactNode
  draftsCount?: number
  onLogout?: () => void
}

const tabs: { id: Tab; label: string; icon: typeof IconHome; color: string }[] = [
  { id: 'dashboard', label: 'Geral', icon: IconHome, color: '#fff' },
  { id: 'gastos', label: 'Gastos', icon: IconCreditCard, color: '#ed93b1' },
  { id: 'custos-fixos', label: 'Fixos', icon: IconClipboardList, color: '#85b7eb' },
  { id: 'investimentos', label: 'Investimentos', icon: IconChartLine, color: '#5dcaa5' },
  { id: 'rascunhos', label: 'Rascunhos', icon: IconInbox, color: '#fac775' },
  { id: 'configuracoes', label: 'Config', icon: IconSettings, color: '#948bc7' },
]

export default function Layout({ active, onChange, children, draftsCount = 0 }: Props) {
  return (
    <div className="min-h-screen flex flex-col">
      <main className="flex-1 px-4 pb-28 max-w-5xl mx-auto w-full">
        {children}
      </main>

      <nav className="fixed bottom-0 left-0 right-0 flex justify-center px-3 pb-3 pt-1 pointer-events-none z-40">
        <div className="pointer-events-auto flex gap-0.5 bg-slate-900/90 backdrop-blur border border-slate-700/60 rounded-full px-1.5 py-1.5 shadow-2xl shadow-black/40 max-w-full overflow-x-auto">
          {tabs.map((t) => {
            const Icon = t.icon
            const isActive = active === t.id
            return (
              <button
                key={t.id}
                onClick={() => onChange(t.id)}
                title={t.label}
                className={`relative flex-shrink-0 w-11 h-11 sm:w-auto sm:px-4 rounded-full text-base font-medium transition-all flex items-center justify-center gap-1.5
                  ${isActive ? 'brand-gradient-bg shadow-lg shadow-fuchsia-900/40' : 'hover:bg-slate-800'}`}
              >
                <span className="relative flex items-center justify-center">
                  <Icon size={17} color={isActive ? '#fff' : t.color} />
                  {t.id === 'rascunhos' && draftsCount > 0 && (
                    <span className="absolute -top-2 -right-2.5 bg-red-500 text-white text-[10px] leading-none rounded-full min-w-[16px] h-4 flex items-center justify-center px-1">
                      {draftsCount}
                    </span>
                  )}
                </span>
                <span className="hidden sm:block text-sm" style={{ color: isActive ? '#fff' : t.color }}>{t.label}</span>
              </button>
            )
          })}
        </div>
      </nav>
    </div>
  )
}
