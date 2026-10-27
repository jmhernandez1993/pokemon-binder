import seed from './data/catalog.json'

export interface Card {
  id: string
  dex: number
  pokemon: string
  card: string
  set_name: string
  set_code: string
  number: string
  tier: string
  language: 'EN' | 'JP'
  price_usd: number | null
  price_source: string | null
  price_date: string | null
  tcgplayer_url: string | null
  tcgplayer_product_id: number | null
  limitless_url: string | null
  pickable: boolean
}

export interface Pokemon {
  dex: number
  name: string
  option_ids: string[]
}

/** The user's own records. Never derived from, or overwritten by, catalog/price data. */
export interface Ownership {
  owned: Record<string, boolean>
  paid: Record<string, number | null>
  /** dex → card id chosen for the binder when several options are owned */
  picks: Record<number, string>
}

export type Prices = Record<string, { price_usd: number | null; price_date: string | null }>

export const POCKETS_PER_PAGE = 9
export const PAGE_COUNT = Math.ceil(151 / POCKETS_PER_PAGE)

export const pokemon: Pokemon[] = seed.pokemon
export const seedCards: Card[] = seed.options as Card[]

/** Owned/paid exactly as recorded in the seed export, used once to initialise a fresh store. */
export function seedOwnership(): Ownership {
  const owned: Record<string, boolean> = {}
  const paid: Record<string, number | null> = {}
  for (const c of seed.options) {
    if (c.owned) owned[c.id] = true
    if (c.paid_usd != null) paid[c.id] = c.paid_usd
  }
  return { owned, paid, picks: {} }
}

/** Seed cards with any fresher prices laid over them. Only price fields are taken from `prices`. */
export function withPrices(prices: Prices | null): Map<string, Card> {
  const map = new Map<string, Card>()
  for (const c of seedCards) {
    const p = prices?.[c.id]
    map.set(c.id, p ? { ...c, price_usd: p.price_usd, price_date: p.price_date } : c)
  }
  return map
}

export type SlotState = 'collected' | 'missing' | 'empty'

export interface Slot {
  pokemon: Pokemon
  options: Card[]
  state: SlotState
  /** Card shown in the pocket: the binder card when collected, the cheapest buyable option when missing. */
  shown: Card | null
  ownedCards: Card[]
}

const price = (c: Card) => c.price_usd ?? 0

/** Cheapest pickable option with a known price. Ties keep catalog order. */
export function cheapestPickable(options: Card[]): Card | null {
  let best: Card | null = null
  for (const c of options) {
    if (!c.pickable || c.price_usd == null) continue
    if (!best || c.price_usd < best.price_usd!) best = c
  }
  return best
}

export function buildSlots(cards: Map<string, Card>, own: Ownership): Slot[] {
  return pokemon.map((p) => {
    const options = p.option_ids.map((id) => cards.get(id)!).filter(Boolean)
    const ownedCards = options.filter((c) => own.owned[c.id])
    if (options.length === 0) return { pokemon: p, options, state: 'empty', shown: null, ownedCards }
    if (ownedCards.length > 0) {
      const pick = ownedCards.find((c) => c.id === own.picks[p.dex])
      const shown = pick ?? ownedCards.reduce((a, b) => (price(b) > price(a) ? b : a))
      return { pokemon: p, options, state: 'collected', shown, ownedCards }
    }
    return { pokemon: p, options, state: 'missing', shown: cheapestPickable(options), ownedCards }
  })
}

export interface Stats {
  slotsTotal: number
  slotsWithCard: number
  collected: number
  ownedValue: number
  costToComplete: number
  /** missing slots that have no buyable (pickable, priced) option */
  unbuyable: number
  paidTotal: number
  paidCount: number
}

export function computeStats(slots: Slot[], cards: Map<string, Card>, own: Ownership): Stats {
  let ownedValue = 0
  let paidTotal = 0
  let paidCount = 0
  for (const [id, isOwned] of Object.entries(own.owned)) {
    const c = cards.get(id)
    if (!isOwned || !c) continue
    ownedValue += price(c)
    const paid = own.paid[id]
    if (paid != null) {
      paidTotal += paid
      paidCount++
    }
  }
  let costToComplete = 0
  let unbuyable = 0
  for (const s of slots) {
    if (s.state !== 'missing') continue
    if (s.shown?.price_usd != null) costToComplete += s.shown.price_usd
    else unbuyable++
  }
  return {
    slotsTotal: slots.length,
    slotsWithCard: slots.filter((s) => s.state !== 'empty').length,
    collected: slots.filter((s) => s.state === 'collected').length,
    ownedValue: round2(ownedValue),
    costToComplete: round2(costToComplete),
    unbuyable,
    paidTotal: round2(paidTotal),
    paidCount,
  }
}

const round2 = (n: number) => Math.round(n * 100) / 100

export const usd = (n: number | null | undefined, digits = 2) =>
  n == null
    ? '—'
    : n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: digits, maximumFractionDigits: digits })

export const dexLabel = (dex: number) => `#${String(dex).padStart(3, '0')}`

export function pageRange(page: number) {
  const first = page * POCKETS_PER_PAGE + 1
  return { first, last: Math.min(first + POCKETS_PER_PAGE - 1, 151) }
}

export const pageOfDex = (dex: number) => Math.floor((dex - 1) / POCKETS_PER_PAGE)

/** Where tapping "buy" goes. JP prints have no TCGplayer listing, so they go to Limitless. */
export function buyUrl(c: Card): { href: string; label: string } {
  if (c.tcgplayer_url) return { href: c.tcgplayer_url, label: 'Buy on TCGplayer' }
  if (c.language === 'JP' && c.limitless_url) return { href: c.limitless_url, label: 'View on Limitless' }
  const q = encodeURIComponent(`${c.card.replace(/\s*\(Japanese\)$/, '')} ${c.number}`)
  return { href: `https://www.tcgplayer.com/search/pokemon/product?q=${q}`, label: 'Search TCGplayer' }
}

export const imageUrl = (id: string, size: 'sm' | 'lg') => `${import.meta.env.BASE_URL}cards/${size}/${encodeURIComponent(id)}.webp`
