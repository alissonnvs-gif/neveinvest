import { useState } from 'react'
import { supabase } from '../lib/supabase'

type Step = 'credentials' | 'code'

export default function Login() {
  const [step, setStep] = useState<Step>('credentials')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleCredentials(ev: React.FormEvent) {
    ev.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const res = await fetch('/api/auth-request-code', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Erro ao entrar.')
        return
      }
      setStep('code')
    } catch {
      setError('Erro de conexão. Tenta de novo.')
    } finally {
      setLoading(false)
    }
  }

  async function handleCode(ev: React.FormEvent) {
    ev.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const res = await fetch('/api/auth-verify-code', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password, code }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Código inválido.')
        return
      }
      const { error: sessionError } = await supabase.auth.setSession({
        access_token: data.access_token,
        refresh_token: data.refresh_token,
      })
      if (sessionError) setError('Erro ao confirmar sessão. Tenta de novo.')
      // Sucesso: onAuthStateChange no App.tsx detecta a sessão e troca a tela sozinho.
    } catch {
      setError('Erro de conexão. Tenta de novo.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-slate-800 rounded-xl p-6">
        <div className="text-center mb-6">
          <div className="text-3xl mb-1">🏦</div>
          <div className="font-bold text-lg text-emerald-400">NeveInvest</div>
        </div>

        {step === 'credentials' ? (
          <form onSubmit={handleCredentials} className="space-y-3">
            <div>
              <label className="text-xs text-slate-400 block mb-1">E-mail</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-slate-700 rounded px-3 py-2 text-sm text-slate-200 border border-slate-600"
                autoFocus
              />
            </div>
            <div>
              <label className="text-xs text-slate-400 block mb-1">Senha</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-slate-700 rounded px-3 py-2 text-sm text-slate-200 border border-slate-600"
              />
            </div>
            {error && <div className="text-xs text-red-400 bg-red-900/30 border border-red-800/50 rounded px-3 py-2">{error}</div>}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 py-2.5 rounded-lg text-sm font-medium"
            >
              {loading ? 'Entrando...' : 'Entrar'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleCode} className="space-y-3">
            <div className="text-xs text-slate-400 bg-slate-700/50 rounded px-3 py-2">
              📱 Mandamos um código de 6 dígitos no grupo do Telegram da família. Confirme abaixo.
            </div>
            <div>
              <label className="text-xs text-slate-400 block mb-1">Código</label>
              <input
                type="text"
                inputMode="numeric"
                required
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="w-full bg-slate-700 rounded px-3 py-2 text-sm text-slate-200 border border-slate-600 tracking-widest text-center text-lg"
                autoFocus
                maxLength={6}
              />
            </div>
            {error && <div className="text-xs text-red-400 bg-red-900/30 border border-red-800/50 rounded px-3 py-2">{error}</div>}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 py-2.5 rounded-lg text-sm font-medium"
            >
              {loading ? 'Confirmando...' : 'Confirmar código'}
            </button>
            <button
              type="button"
              onClick={() => { setStep('credentials'); setCode(''); setError(null) }}
              className="w-full text-xs text-slate-400 hover:text-slate-300"
            >
              Voltar
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
