import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store'
import { generateDailyInsights } from '../services/insightsService'
import type { InsightSlide } from '../types'

const SLIDE_DURATION = 8000

const SLIDE_STYLES: Record<string, { bg: string; accent: string; badge: string }> = {
  frase: {
    bg: 'from-violet-900/80 to-indigo-900/80',
    accent: 'text-violet-300',
    badge: 'bg-violet-500/20 text-violet-300 border-violet-500/30',
  },
  gastos: {
    bg: 'from-rose-900/80 to-pink-900/80',
    accent: 'text-rose-300',
    badge: 'bg-rose-500/20 text-rose-300 border-rose-500/30',
  },
  investimentos: {
    bg: 'from-emerald-900/80 to-teal-900/80',
    accent: 'text-emerald-300',
    badge: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  },
  ideia: {
    bg: 'from-amber-900/80 to-orange-900/80',
    accent: 'text-amber-300',
    badge: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  },
}

function Slide({ slide, active }: { slide: InsightSlide; active: boolean }) {
  const style = SLIDE_STYLES[slide.type] ?? SLIDE_STYLES.frase
  return (
    <div
      className={`
        absolute inset-0 flex flex-col justify-between p-6
        bg-gradient-to-br ${style.bg}
        transition-opacity duration-700
        ${active ? 'opacity-100' : 'opacity-0 pointer-events-none'}
      `}
    >
      <div className="flex items-center gap-3">
        <span className="text-3xl">{slide.emoji}</span>
        <span className={`text-xs font-semibold uppercase tracking-widest px-3 py-1 rounded-full border ${style.badge}`}>
          {slide.title}
        </span>
      </div>
      <div className="flex-1 flex flex-col justify-center py-4">
        {slide.highlight && (
          <div className={`text-3xl sm:text-4xl font-black mb-3 ${style.accent}`}>
            {slide.highlight}
          </div>
        )}
        <p className={`text-base sm:text-lg leading-relaxed text-slate-100 ${slide.type === 'frase' ? 'italic text-lg sm:text-xl font-medium' : ''}`}>
          {slide.content}
        </p>
      </div>
    </div>
  )
}

function ErrorSlide({ msg }: { msg: string }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 bg-gradient-to-br from-slate-800 to-slate-900">
      <span className="text-3xl">🤖</span>
      <p className="text-slate-400 text-sm text-center">{msg}</p>
    </div>
  )
}

function LoadingSlide() {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6 bg-gradient-to-br from-slate-800 to-slate-900">
      <div className="flex gap-2">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="w-2 h-2 bg-violet-400 rounded-full animate-bounce"
            style={{ animationDelay: `${i * 0.15}s` }}
          />
        ))}
      </div>
      <p className="text-slate-400 text-sm">Gerando insights do dia...</p>
    </div>
  )
}

const ATTEMPT_KEY = 'neveinvest-insights-attempt'
const COLLAPSED_KEY = 'neveinvest-insights-collapsed'

export default function InsightsCard() {
  const state = useStore()
  const { dailyInsights, setDailyInsights } = state
  const [active, setActive] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(COLLAPSED_KEY) === 'true')
  const [isPaused, setIsPaused] = useState(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const today = new Date().toISOString().slice(0, 10)
  const slides: InsightSlide[] = dailyInsights?.slides ?? []
  const isStale = !dailyInsights || dailyInsights.date !== today

  const fetchInsights = (force = false) => {
    if (!force && localStorage.getItem(ATTEMPT_KEY) === today) return
    localStorage.setItem(ATTEMPT_KEY, today)
    setLoading(true)
    setError(null)
    generateDailyInsights(state)
      .then((ins) => {
        setDailyInsights(ins)
        setLoading(false)
      })
      .catch((e) => {
        console.error('[insights] erro:', e)
        setError('Não foi possível gerar os insights. Tente clicar em Atualizar.')
        setLoading(false)
        localStorage.removeItem(ATTEMPT_KEY)
      })
  }

  useEffect(() => {
    if (isStale) fetchInsights()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (slides.length === 0 || isPaused) return
    timerRef.current = setInterval(() => {
      setActive((a) => (a + 1) % slides.length)
    }, SLIDE_DURATION)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [slides.length, isPaused])

  const goTo = (i: number) => {
    setActive(i)
    if (timerRef.current) clearInterval(timerRef.current)
    if (!isPaused) {
      timerRef.current = setInterval(() => {
        setActive((a) => (a + 1) % slides.length)
      }, SLIDE_DURATION)
    }
  }

  const toggleCollapsed = () => {
    setCollapsed((c) => {
      localStorage.setItem(COLLAPSED_KEY, String(!c))
      return !c
    })
  }

  return (
    <div className="bg-slate-800/60 rounded-xl overflow-hidden">
      {/* Header — clicável para colapsar */}
      <div
        className={`flex items-center justify-between px-5 py-3 cursor-pointer select-none ${!collapsed ? 'border-b border-slate-700/50' : ''}`}
        onClick={toggleCollapsed}
      >
        <div className="flex items-center gap-2">
          <span className="text-base">✨</span>
          <span className="text-sm font-semibold text-slate-200">Insights do Dia</span>
          {dailyInsights && !collapsed && (
            <span className="text-xs text-slate-500 ml-1">
              {new Date(dailyInsights.generatedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {!collapsed && (
            <button
              onClick={(e) => { e.stopPropagation(); fetchInsights(true) }}
              disabled={loading}
              className="text-xs text-slate-400 hover:text-slate-200 transition-colors disabled:opacity-40 flex items-center gap-1"
              title="Regenerar insights"
            >
              <span className={loading ? 'animate-spin' : ''}>↻</span>
              <span>Atualizar</span>
            </button>
          )}
          <span
            className="text-slate-400 text-xs transition-transform duration-300"
            style={{ display: 'inline-block', transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}
          >
            ▼
          </span>
        </div>
      </div>

      {/* Conteúdo colapsável */}
      {!collapsed && (
        <>
          <div
            className="relative h-52"
            onMouseEnter={() => setIsPaused(true)}
            onMouseLeave={() => setIsPaused(false)}
          >
            {loading && <LoadingSlide />}
            {!loading && error && <ErrorSlide msg={error} />}
            {!loading && !error && slides.map((slide, i) => (
              <Slide key={i} slide={slide} active={i === active} />
            ))}
          </div>
          {slides.length > 0 && (
            <div className="flex items-center justify-center gap-2 py-3 border-t border-slate-700/50">
              {slides.map((slide, i) => (
                <button
                  key={i}
                  onClick={() => goTo(i)}
                  title={slide.title}
                  className={`transition-all duration-300 rounded-full ${
                    i === active
                      ? 'w-6 h-2 bg-violet-400'
                      : 'w-2 h-2 bg-slate-600 hover:bg-slate-400'
                  }`}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
