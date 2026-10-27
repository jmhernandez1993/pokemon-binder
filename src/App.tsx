import { useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { PAGE_COUNT, buildSlots, computeStats, pageOfDex, withPrices } from './catalog'
import { localBackend, supabase, supabaseBackend, type Backend } from './store'
import { useCollection } from './useCollection'
import { ProgressHeader } from './components/ProgressHeader'
import { Binder } from './components/Binder'
import { Pager } from './components/Pager'
import { DetailSheet } from './components/DetailSheet'
import { JumpTo } from './components/JumpTo'
import { SignIn } from './components/SignIn'

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(supabase ? undefined : null)

  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  const backend = useMemo<Backend | null>(() => {
    if (!supabase) return localBackend()
    return session ? supabaseBackend(supabase, session) : null
  }, [session?.user.id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (supabase && session === undefined) return null // restoring session
  if (supabase && !session) return <SignIn db={supabase} />
  return <BinderApp key={backend!.kind} backend={backend!} />
}

const PAGE_KEY = 'gen1-binder:page'
const savedPage = () => {
  try {
    const n = Number(localStorage.getItem(PAGE_KEY))
    return Number.isInteger(n) && n >= 0 && n < PAGE_COUNT ? n : 0
  } catch {
    return 0
  }
}

function BinderApp({ backend }: { backend: Backend }) {
  const { own, prices, status, error, dismissError, setOwned, setPaid, setPick } = useCollection(backend)
  const cards = useMemo(() => withPrices(prices), [prices])
  const slots = useMemo(() => buildSlots(cards, own), [cards, own])
  const stats = useMemo(() => computeStats(slots, cards, own), [slots, cards, own])

  const [page, setPage] = useState(savedPage)
  const [target, setTarget] = useState({ page, seq: 0, smooth: false })
  const [openDex, setOpenDex] = useState<number | null>(null)
  const [jumpOpen, setJumpOpen] = useState(false)
  const [flashDex, setFlashDex] = useState<number | null>(null)

  useEffect(() => {
    try {
      localStorage.setItem(PAGE_KEY, String(page))
    } catch {
      /* non-fatal */
    }
  }, [page])

  const goTo = (p: number, smooth = true) => {
    const clamped = Math.max(0, Math.min(PAGE_COUNT - 1, p))
    setPage(clamped)
    setTarget((t) => ({ page: clamped, seq: t.seq + 1, smooth }))
  }

  // Arrow keys page through the binder on the Mac.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (openDex != null || jumpOpen || (e.target as HTMLElement).closest('input, textarea')) return
      if (e.key === 'ArrowRight') goTo(page + 1)
      if (e.key === 'ArrowLeft') goTo(page - 1)
      if (e.key === '/') {
        e.preventDefault()
        setJumpOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const jumpTo = (dex: number) => {
    goTo(pageOfDex(dex), Math.abs(pageOfDex(dex) - page) <= 2)
    setFlashDex(dex)
    window.setTimeout(() => setFlashDex((d) => (d === dex ? null : d)), 1800)
  }

  return (
    <div className="app">
      <ProgressHeader stats={stats} status={status} localOnly={backend.kind === 'local'} onSearch={() => setJumpOpen(true)} />
      {error && (
        <div className="toast" role="alert">
          {error}
          <button className="btn btn-link" onClick={dismissError}>
            Dismiss
          </button>
        </div>
      )}
      <Binder slots={slots} page={page} target={target} flashDex={flashDex} onPageChange={setPage} onOpen={setOpenDex} />
      <Pager page={page} onGo={(p) => goTo(p)} />
      <DetailSheet
        slot={openDex == null ? null : slots[openDex - 1]}
        own={own}
        onClose={() => setOpenDex(null)}
        onOwned={setOwned}
        onPaid={setPaid}
        onPick={setPick}
      />
      <JumpTo open={jumpOpen} slots={slots} onClose={() => setJumpOpen(false)} onPick={jumpTo} />
    </div>
  )
}
