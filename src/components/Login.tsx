import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { IconBuildingBank, IconLock } from '@tabler/icons-react'

type Step = 'credentials' | 'code'

const BRAND_GRADIENT = 'linear-gradient(160deg, #7c3aed, #d946ef 55%, #f97316)'

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
    <div className="min-h-screen relative overflow-hidden flex items-center justify-center p-4">
      <div className="blob-accent" style={{ top: -60, left: -60, width: 220, height: 220 }} />
      <div className="blob-accent" style={{ top: 100, right: -80, width: 200, height: 200, animationDelay: '3s' }} />

      <div className="relative w-full max-w-sm flex flex-col items-center">
        <div className="w-16 h-16 rounded-[20px] flex items-center justify-center mb-4" style={{ background: BRAND_GRADIENT }}>
          <IconBuildingBank size={30} color="#fff" />
        </div>
        <div className="font-bold text-xl text-white mb-0.5">NeveInvest</div>
        <div className="text-xs text-white/55 mb-8">Entre para continuar</div>

        {step === 'credentials' ? (
          <form onSubmit={handleCredentials} className="w-full space-y-3.5">
            <div>
              <label className="text-[11px] text-white/55 block mb-1.5">E-mail</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-white/[0.06] rounded-2xl px-3.5 py-2.5 text-sm text-white/85 border border-white/10 placeholder:text-white/30"
                placeholder="voce@email.com"
                autoFocus
              />
            </div>
            <div>
              <label className="text-[11px] text-white/55 block mb-1.5">Senha</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-white/[0.06] rounded-2xl px-3.5 py-2.5 text-sm text-white/85 border border-white/10"
              />
            </div>
            {error && <div className="text-xs text-red-400 bg-red-900/30 border border-red-800/50 rounded-xl px-3 py-2">{error}</div>}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 mt-1.5 rounded-full text-sm font-medium text-white disabled:opacity-50 transition-opacity hover:opacity-90"
              style={{ background: BRAND_GRADIENT }}
            >
              {loading ? 'Entrando...' : 'Entrar'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleCode} className="w-full space-y-3.5">
            <div className="text-xs text-white/55 bg-white/[0.06] border border-white/10 rounded-2xl px-3.5 py-2.5">
              Mandamos um código de 6 dígitos no grupo do Telegram da família. Confirme abaixo.
            </div>
            <div>
              <label className="text-[11px] text-white/55 block mb-1.5">Código</label>
              <input
                type="text"
                inputMode="numeric"
                required
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="w-full bg-white/[0.06] rounded-2xl px-3.5 py-2.5 text-sm text-white/85 border border-white/10 tracking-widest text-center text-lg"
                autoFocus
                maxLength={6}
              />
            </div>
            {error && <div className="text-xs text-red-400 bg-red-900/30 border border-red-800/50 rounded-xl px-3 py-2">{error}</div>}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 mt-1.5 rounded-full text-sm font-medium text-white disabled:opacity-50 transition-opacity hover:opacity-90"
              style={{ background: BRAND_GRADIENT }}
            >
              {loading ? 'Confirmando...' : 'Confirmar código'}
            </button>
            <button
              type="button"
              onClick={() => { setStep('credentials'); setCode(''); setError(null) }}
              className="w-full text-xs text-white/50 hover:text-white/70"
            >
              Voltar
            </button>
          </form>
        )}

        <div className="mt-7 flex items-center gap-1.5 text-[11px] text-white/40">
          <IconLock size={13} />
          código de confirmação enviado no Telegram da família
        </div>
      </div>
    </div>
  )
}
