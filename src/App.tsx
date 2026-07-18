import { useEffect, useState } from 'react'
import Layout from './components/Layout'
import Dashboard from './components/Dashboard'
import Gastos from './components/Gastos'
import CustosFixos from './components/CustosFixos'
import Investimentos from './components/Investimentos'
import Configuracoes from './components/Configuracoes'
import Rascunhos from './components/Rascunhos'
import ToastContainer from './components/ToastContainer'
import { useStore, enableSync } from './store'
import { loadFromSupabase, fetchPendingDraftsCount } from './lib/supabase'

type Tab = 'dashboard' | 'gastos' | 'custos-fixos' | 'investimentos' | 'rascunhos' | 'configuracoes'

const DRAFTS_POLL_MS = 15000

export default function App() {
  const [tab, setTab] = useState<Tab>('dashboard')
  const [draftsCount, setDraftsCount] = useState(0)
  const hydrate = useStore((s) => s.hydrate)

  useEffect(() => {
    loadFromSupabase().then((remote) => {
      if (remote && Object.keys(remote).length > 0) {
        hydrate(remote as any)
      }
      enableSync()
    })
  }, [])

  useEffect(() => {
    fetchPendingDraftsCount().then(setDraftsCount)
    const timer = setInterval(() => { fetchPendingDraftsCount().then(setDraftsCount) }, DRAFTS_POLL_MS)
    return () => clearInterval(timer)
  }, [])

  return (
    <>
      <ToastContainer />
      <Layout active={tab} onChange={setTab} draftsCount={draftsCount}>
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
