/// <reference types="node" />
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

const CODE_TTL_MS = 5 * 60 * 1000 // 5 minutos

async function sendTelegramMessage(chatId: string, text: string) {
  try {
    const token = process.env.TELEGRAM_BOT_TOKEN
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text }),
    })
    if (!response.ok) {
      const body = await response.text()
      console.error(`[auth] falha ao enviar código (${response.status}):`, body)
    }
  } catch (err) {
    console.error('[auth] erro de rede ao enviar código:', err)
  }
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.status(405).send('Method Not Allowed')
    return
  }

  const { email, password } = req.body ?? {}
  if (!email || !password) {
    res.status(400).json({ error: 'Informe e-mail e senha.' })
    return
  }

  // Valida a senha contra o Supabase Auth sem devolver a sessão ainda — o login só
  // se completa depois de confirmar o código do Telegram em /api/auth-verify-code.
  const authClient = createClient(process.env.VITE_SUPABASE_URL as string, process.env.VITE_SUPABASE_ANON_KEY as string)
  const { error: authError } = await authClient.auth.signInWithPassword({ email, password })

  if (authError) {
    // Mensagem genérica de propósito — não revela se foi o e-mail ou a senha que errou.
    res.status(401).json({ error: 'E-mail ou senha inválidos.' })
    return
  }

  const code = crypto.randomInt(100000, 999999).toString()
  const expiresAt = new Date(Date.now() + CODE_TTL_MS).toISOString()

  const adminClient = createClient(process.env.VITE_SUPABASE_URL as string, process.env.SUPABASE_SERVICE_ROLE_KEY as string)

  // Invalida qualquer código pendente anterior — só o mais recente vale.
  await adminClient.from('login_otp').update({ consumed: true }).eq('consumed', false)

  const { error: insertError } = await adminClient.from('login_otp').insert({ code, expires_at: expiresAt })
  if (insertError) {
    console.error('[auth] erro ao salvar código:', insertError)
    res.status(500).json({ error: 'Erro ao gerar código. Tenta de novo.' })
    return
  }

  const chatId = process.env.TELEGRAM_LOGIN_CHAT_ID as string
  await sendTelegramMessage(chatId, `🔐 Código de acesso ao NeveInvest: ${code}\n\nVálido por 5 minutos.`)

  res.status(200).json({ ok: true })
}
