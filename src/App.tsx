import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import Layout from './components/Layout'
import Login from './components/Login'
import Dashboard from './components/Dashboard'
import Gastos from './components/Gastos'
import CustosFixos from './components/CustosFixos'
import Investimentos from './components/Investimentos'
import Configuracoes from './components/Configuracoes'
import Rascunhos from './components/Rascunhos'
import ToastContainer from './components/ToastContainer'
import { useStore, enableSync } from './store'
import { supabase, loadFromSupabase, fetchPendingDraftsCount } from './lib/supabase'

type Tab = 'dashboard' | 'gastos' | 'custos-fixos' | 'investimentos' | 'rascunhos' | 'configuracoes'

const DRAFTS_POLL_MS = 15000

export default function App() {
  const [tab, setTab] = useState<Tab>('dashboard')
  const [draftsCount, setDraftsCount] = useState(0)
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const hydrate = useStore((s) => s.hydrate)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session) return
    loadFromSupabase().then((remote) => {
      if (remote && Object.keys(remote).length > 0) {
        hydrate(remote as any)
      }
      enableSync()
    })
  }, [session])

  useEffect(() => {
    if (!session) return
    fetchPendingDraftsCount().then(setDraftsCount)
    const timer = setInterval(() => { fetchPendingDraftsCount().then(setDraftsCount) }, DRAFTS_POLL_MS)
    return () => clearInterval(timer)
  }, [session])

  if (session === undefined) return null // evita piscar a tela de login antes de saber se já tem sessão
  if (!session) return <Login />

  return (
    <>
      <ToastContainer />
      <Layout active={tab} onChange={setTab} draftsCount={draftsCount} onLogout={() => supabase.auth.signOut()}>
        {tab === 'dashboard' && <Dashboard />}
        {tab === 'gastos' && <Gastos />}
        {tab === 'custos-fixos' && <CustosFixos />}
        {tab === 'investimentos' && <Investimentos />}
        {tab === 'rascunhos' && <Rascunhos />}
        {tab === 'configuracoes' && <Configuracoes />}
      </Layout>
    </>
  )
}
