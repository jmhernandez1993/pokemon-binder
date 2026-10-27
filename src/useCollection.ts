import { useCallback, useEffect, useRef, useState } from 'react'
import { seedOwnership, type Ownership, type Prices } from './catalog'
import { readCache, writeCache, type Backend } from './store'

export type SyncStatus = 'loading' | 'synced' | 'saving' | 'offline' | 'error'

export function useCollection(backend: Backend) {
  const cached = backend.kind === 'supabase' ? readCache() : null
  const [own, setOwn] = useState<Ownership>(cached?.own ?? seedOwnership())
  const [prices, setPrices] = useState<Prices | null>(cached?.prices ?? null)
  const [status, setStatus] = useState<SyncStatus>('loading')
  const [error, setError] = useState<string | null>(null)
  const pending = useRef(0)

  const reload = useCallback(async () => {
    if (pending.current > 0) return // don't clobber optimistic edits mid-save
    try {
      const data = await backend.load()
      setOwn(data.own)
      setPrices(data.prices)
      setStatus('synced')
      setError(null)
    } catch (e) {
      setStatus(navigator.onLine ? 'error' : 'offline')
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [backend])

  useEffect(() => {
    void reload()
    // Pick up edits made on the other device when the app comes back to the foreground.
    const onVisible = () => document.visibilityState === 'visible' && void reload()
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('online', reload)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('online', reload)
    }
  }, [reload])

  // Mirror of `own` so a failed save can roll back to exactly what was on screen before it.
  const ownRef = useRef(own)
  useEffect(() => {
    ownRef.current = own
  }, [own])

  useEffect(() => {
    if (backend.kind === 'supabase' && status === 'synced') writeCache({ own, prices })
  }, [backend, own, prices, status])

  /** Apply locally first, then persist; roll back if the save fails. */
  const mutate = useCallback(
    async (apply: (o: Ownership) => Ownership, save: () => Promise<void>) => {
      const before = ownRef.current
      const next = apply(before)
      ownRef.current = next
      setOwn(next)
      pending.current++
      setStatus('saving')
      try {
        await save()
        setStatus('synced')
        setError(null)
      } catch (e) {
        ownRef.current = before
        setOwn(before)
        setStatus('error')
        setError(`Couldn't save: ${e instanceof Error ? e.message : String(e)}`)
      } finally {
        pending.current--
      }
    },
    [],
  )

  const setOwned = (id: string, owned: boolean) =>
    mutate(
      (o) => {
        const next = { ...o.owned }
        if (owned) next[id] = true
        else delete next[id]
        return { ...o, owned: next }
      },
      () => backend.setOwned(id, owned),
    )

  const setPaid = (id: string, paid: number | null) =>
    mutate(
      (o) => {
        const next = { ...o.paid }
        if (paid == null) delete next[id]
        else next[id] = paid
        return { ...o, paid: next }
      },
      () => backend.setPaid(id, paid),
    )

  const setPick = (dex: number, id: string | null) =>
    mutate(
      (o) => {
        const next = { ...o.picks }
        if (id) next[dex] = id
        else delete next[dex]
        return { ...o, picks: next }
      },
      () => backend.setPick(dex, id),
    )

  return { own, prices, status, error, dismissError: () => setError(null), setOwned, setPaid, setPick }
}
