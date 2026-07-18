/// <reference types="node" />
import { createClient } from '@supabase/supabase-js'

const MAX_ATTEMPTS = 5

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.status(405).send('Method Not Allowed')
    return
  }

  const { email, password, code } = req.body ?? {}
  if (!email || !password || !code) {
    res.status(400).json({ error: 'Informe e-mail, senha e código.' })
    return
  }

  const adminClient = createClient(process.env.VITE_SUPABASE_URL as string, process.env.SUPABASE_SERVICE_ROLE_KEY as string)

  const { data: pending, error: fetchError } = await adminClient
    .from('login_otp')
    .select('*')
    .eq('consumed', false)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (fetchError || !pending) {
    res.status(400).json({ error: 'Nenhum código pendente. Solicite um novo login.' })
    return
  }

  if (new Date(pending.expires_at).getTime() < Date.now()) {
    await adminClient.from('login_otp').update({ consumed: true }).eq('id', pending.id)
    res.status(400).json({ error: 'Código expirado. Solicite um novo login.' })
    return
  }

  if (pending.attempts >= MAX_ATTEMPTS) {
    await adminClient.from('login_otp').update({ consumed: true }).eq('id', pending.id)
    res.status(429).json({ error: 'Muitas tentativas erradas. Solicite um novo login.' })
    return
  }

  if (String(code).trim() !== pending.code) {
    await adminClient.from('login_otp').update({ attempts: pending.attempts + 1 }).eq('id', pending.id)
    res.status(401).json({ error: 'Código incorreto.' })
    return
  }

  await adminClient.from('login_otp').update({ consumed: true }).eq('id', pending.id)

  // Reconfirma a senha (não guardamos a sessão do primeiro passo) e devolve os tokens
  // pro navegador estabelecer a sessão real do Supabase Auth.
  const authClient = createClient(process.env.VITE_SUPABASE_URL as string, process.env.VITE_SUPABASE_ANON_KEY as string)
  const { data: signInData, error: authError } = await authClient.auth.signInWithPassword({ email, password })

  if (authError || !signInData.session) {
    res.status(401).json({ error: 'E-mail ou senha inválidos.' })
    return
  }

  res.status(200).json({
    access_token: signInData.session.access_token,
    refresh_token: signInData.session.refresh_token,
  })
}
