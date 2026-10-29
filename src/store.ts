import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js'
import { seedOwnership, type Ownership, type Prices } from './catalog'

/**
 * Where the user's records live. Two implementations:
 *  - supabase: synced between phone and Mac (used when VITE_SUPABASE_URL/ANON_KEY are set)
 *  - local: this browser only, for trying the app before Supabase is set up
 * Both only ever write owned / paid / picks. Prices are read-only here.
 */
export interface Backend {
  kind: 'supabase' | 'local'
  load(): Promise<{ own: Ownership; prices: Prices | null }>
  setOwned(cardId: string, owned: boolean): Promise<void>
  setOwnedMany(cardIds: string[], owned: boolean): Promise<void>
  setPaid(cardId: string, paid: number | null): Promise<void>
  setPick(dex: number, cardId: string | null): Promise<void>
}

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
export const supabase: SupabaseClient | null = url && anonKey ? createClient(url, anonKey) : null

const LOCAL_KEY = 'gen1-binder:ownership:v1'
const CACHE_KEY = 'gen1-binder:cache:v1'

function readJSON<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}
function writeJSON(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* storage unavailable (private mode etc.): non-fatal */
  }
}

/** Last successful load, so the binder paints instantly before the network answers. */
export const readCache = () => readJSON<{ own: Ownership; prices: Prices | null }>(CACHE_KEY)
export const writeCache = (v: { own: Ownership; prices: Prices | null }) => writeJSON(CACHE_KEY, v)

export function localBackend(): Backend {
  const get = () => readJSON<Ownership>(LOCAL_KEY) ?? seedOwnership()
  const update = (fn: (o: Ownership) => void) => {
    const o = get()
    fn(o)
    writeJSON(LOCAL_KEY, o)
  }
  return {
    kind: 'local',
    async load() {
      const own = get()
      writeJSON(LOCAL_KEY, own)
      return { own, prices: null }
    },
    async setOwned(id, owned) {
      update((o) => {
        if (owned) o.owned[id] = true
        else delete o.owned[id]
      })
    },
    async setOwnedMany(ids, owned) {
      update((o) => {
        for (const id of ids) {
          if (owned) o.owned[id] = true
          else delete o.owned[id]
        }
      })
    },
    async setPaid(id, paid) {
      update((o) => {
        if (paid == null) delete o.paid[id]
        else o.paid[id] = paid
      })
    },
    async setPick(dex, id) {
      update((o) => {
        if (id) o.picks[dex] = id
        else delete o.picks[dex]
      })
    },
  }
}

export function supabaseBackend(db: SupabaseClient, session: Session): Backend {
  const user_id = session.user.id
  const check = ({ error }: { error: { message: string } | null }) => {
    if (error) throw new Error(error.message)
  }

  return {
    kind: 'supabase',
    async load() {
      const [ownRes, picksRes, cardsRes] = await Promise.all([
        db.from('ownership').select('card_id, owned, paid_usd'),
        db.from('binder_picks').select('dex, card_id'),
        db.from('cards').select('id, price_usd, price_date'),
      ])
      check(ownRes)
      check(picksRes)

      let ownRows = ownRes.data ?? []
      let pickRows = picksRes.data ?? []
      if (ownRows.length === 0) {
        // First sign-in: copy this device's "This device only" records if it has any, otherwise
        // the seed export. Insert-only, so it can never overwrite anything already recorded
        // (e.g. from another device signing in first).
        const start = readJSON<Ownership>(LOCAL_KEY) ?? seedOwnership()
        const ids = new Set([...Object.keys(start.owned), ...Object.keys(start.paid)])
        const rows = [...ids].map((card_id) => ({ user_id, card_id, owned: !!start.owned[card_id], paid_usd: start.paid[card_id] ?? null }))
        if (rows.length) check(await db.from('ownership').upsert(rows, { onConflict: 'user_id,card_id', ignoreDuplicates: true }))
        const picks = Object.entries(start.picks).map(([dex, card_id]) => ({ user_id, dex: Number(dex), card_id }))
        if (picks.length) check(await db.from('binder_picks').upsert(picks, { onConflict: 'user_id,dex', ignoreDuplicates: true }))
        const [again, againPicks] = await Promise.all([
          db.from('ownership').select('card_id, owned, paid_usd'),
          db.from('binder_picks').select('dex, card_id'),
        ])
        check(again)
        check(againPicks)
        ownRows = again.data ?? []
        pickRows = againPicks.data ?? []
      }

      const own: Ownership = { owned: {}, paid: {}, picks: {} }
      for (const r of ownRows) {
        if (r.owned) own.owned[r.card_id] = true
        if (r.paid_usd != null) own.paid[r.card_id] = Number(r.paid_usd)
      }
      for (const r of pickRows) own.picks[r.dex] = r.card_id

      // Prices: fall back to the bundled seed if the cards table isn't seeded yet.
      let prices: Prices | null = null
      if (!cardsRes.error && cardsRes.data?.length) {
        prices = {}
        for (const r of cardsRes.data) prices[r.id] = { price_usd: r.price_usd == null ? null : Number(r.price_usd), price_date: r.price_date }
      }
      return { own, prices }
    },
    // Each write names only the column it changes, so an upsert never clobbers the other field.
    async setOwned(card_id, owned) {
      check(await db.from('ownership').upsert({ user_id, card_id, owned }, { onConflict: 'user_id,card_id' }))
    },
    async setOwnedMany(ids, owned) {
      const rows = ids.map((card_id) => ({ user_id, card_id, owned }))
      if (rows.length) check(await db.from('ownership').upsert(rows, { onConflict: 'user_id,card_id' }))
    },
    async setPaid(card_id, paid_usd) {
      check(await db.from('ownership').upsert({ user_id, card_id, paid_usd }, { onConflict: 'user_id,card_id' }))
    },
    async setPick(dex, card_id) {
      if (card_id) check(await db.from('binder_picks').upsert({ user_id, dex, card_id }, { onConflict: 'user_id,dex' }))
      else check(await db.from('binder_picks').delete().eq('dex', dex))
    },
  }
}
