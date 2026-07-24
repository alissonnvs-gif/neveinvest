import type { ReactNode } from 'react'
import { useRef } from 'react'
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

const SWIPE_THRESHOLD = 70

// Não conta como "trocar de página" se o toque começou dentro de algo que já rola de lado
// sozinho (a fileira de caixinhas, a barra de abas), dentro de um modal (fixed) ou num campo
// de formulário — nesses casos o gesto é pra outra coisa, não pra navegar.
function shouldIgnoreSwipe(target: EventTarget | null): boolean {
  let node = target as HTMLElement | null
  while (node && node !== document.body) {
    const tag = node.tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
    const style = getComputedStyle(node)
    if (style.position === 'fixed') return true
    const scrollableX = (style.overflowX === 'auto' || style.overflowX === 'scroll') && node.scrollWidth > node.clientWidth
    if (scrollableX) return true
    node = node.parentElement
  }
  return false
}

export default function Layout({ active, onChange, children, draftsCount = 0 }: Props) {
  const touchStart = useRef<{ x: number; y: number } | null>(null)

  function handleTouchStart(e: React.TouchEvent) {
    if (shouldIgnoreSwipe(e.target)) {
      touchStart.current = null
      return
    }
    const t = e.touches[0]
    touchStart.current = { x: t.clientX, y: t.clientY }
  }

  function handleTouchEnd(e: React.TouchEvent) {
    const start = touchStart.current
    touchStart.current = null
    if (!start) return
    const t = e.changedTouches[0]
    const dx = t.clientX - start.x
    const dy = t.clientY - start.y
    if (Math.abs(dx) < SWIPE_THRESHOLD) return
    if (Math.abs(dx) < Math.abs(dy) * 1.5) return // gesto majoritariamente vertical (rolando a página) — ignora

    const currentIndex = tabs.findIndex((tb) => tb.id === active)
    if (currentIndex === -1) return
    if (dx < 0) {
      const next = tabs[Math.min(currentIndex + 1, tabs.length - 1)]
      if (next.id !== active) onChange(next.id)
    } else {
      const prev = tabs[Math.max(currentIndex - 1, 0)]
      if (prev.id !== active) onChange(prev.id)
    }
  }

  return (
    <div className="min-h-screen flex flex-col">
      <main
        className="flex-1 px-4 pb-28 max-w-5xl mx-auto w-full"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
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
