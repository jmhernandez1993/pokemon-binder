import type { Card, Slot } from './catalog'

/**
 * Budget planner: which missing cards to buy with a given amount. One card per missing slot,
 * always that slot's cheapest option that passes the filters. Money is in whole cents so sums
 * never drift.
 */

export interface PlanFilters {
  /** Skip Alolan / Galarian / Hisuian / Paldean cards. */
  noRegional: boolean
  /** Skip standard Full Arts (tier FA). */
  noFullArt: boolean
  /** Skip Trainer Gallery / Galarian Gallery cards. */
  noGallery: boolean
}

export const NO_FILTERS: PlanFilters = { noRegional: false, noFullArt: false, noGallery: false }

export interface PlanItem {
  slot: Slot
  card: Card
  cents: number
}

export type CartKey = 'most' | 'no-gallery' | 'big'

export interface Cart {
  key: CartKey
  label: string
  blurb: string
  items: PlanItem[]
  total: number
  leftover: number
  /** Cheapest missing card left out of this cart. It always costs more than `leftover`. */
  next: PlanItem | null
}

export interface Plan {
  carts: Cart[]
  /** Every buyable missing card under the current filters, cheapest first. */
  candidates: PlanItem[]
  /** Missing slots that would have a card to buy if the filters were off. */
  filteredOut: Slot[]
}

const REGIONAL = /\b(Alolan|Galarian|Hisuian|Paldean)\b/i

export const toCents = (usd: number) => Math.round(usd * 100)

/** Japanese prints, Radiants and unpriced cards are never suggested (`pickable` / no price). */
export function allowed(c: Card, f: PlanFilters): boolean {
  if (!c.pickable || c.price_usd == null) return false
  if (f.noRegional && REGIONAL.test(c.card)) return false
  if (f.noFullArt && c.tier === 'FA') return false
  if (f.noGallery && c.tier === 'TG/GG') return false
  return true
}

const byPrice = (a: PlanItem, b: PlanItem) => a.cents - b.cents || a.slot.pokemon.dex - b.slot.pokemon.dex

export function candidates(slots: Slot[], f: PlanFilters): { items: PlanItem[]; filteredOut: Slot[] } {
  const items: PlanItem[] = []
  const filteredOut: Slot[] = []
  for (const slot of slots) {
    if (slot.state !== 'missing') continue
    let best: Card | null = null
    for (const c of slot.options) if (allowed(c, f) && (!best || c.price_usd! < best.price_usd!)) best = c
    if (best) items.push({ slot, card: best, cents: toCents(best.price_usd!) })
    else if (slot.options.some((c) => allowed(c, NO_FILTERS))) filteredOut.push(slot)
  }
  return { items: items.sort(byPrice), filteredOut }
}

/**
 * Most slots filled: take the cheapest cards first until the next one doesn't fit.
 * With one card per slot, the k cheapest are the cheapest way to fill k slots, so this is optimal.
 */
export function mostCards(sorted: PlanItem[], budget: number) {
  const items: PlanItem[] = []
  let total = 0
  for (const it of sorted) {
    if (total + it.cents > budget) break
    items.push(it)
    total += it.cents
  }
  return { items, total, leftover: budget - total, next: sorted[items.length] ?? null }
}

/** Priciest first: take the most expensive card that still fits, repeat. Fewer cards, bigger slots. */
export function bigTickets(sorted: PlanItem[], budget: number) {
  const items: PlanItem[] = []
  let total = 0
  for (let i = sorted.length - 1; i >= 0; i--) {
    if (total + sorted[i].cents > budget) continue
    items.push(sorted[i])
    total += sorted[i].cents
  }
  const taken = new Set(items)
  return { items, total, leftover: budget - total, next: sorted.find((it) => !taken.has(it)) ?? null }
}

const sameCards = (a: Cart, b: Cart) =>
  a.items.length === b.items.length && a.items.every((it) => b.items.some((o) => o.card.id === it.card.id))

export function plan(slots: Slot[], f: PlanFilters, budget: number): Plan {
  const { items, filteredOut } = candidates(slots, f)
  const carts: Cart[] = [
    { key: 'most', label: 'Most cards', blurb: 'Cheapest first: the most slots this budget can fill.', ...mostCards(items, budget) },
  ]
  if (!f.noGallery) {
    const noGallery = candidates(slots, { ...f, noGallery: true }).items
    carts.push({
      key: 'no-gallery',
      label: 'No gallery',
      blurb: 'Most slots without Trainer or Galarian Gallery cards.',
      ...mostCards(noGallery, budget),
    })
  }
  carts.push({
    key: 'big',
    label: 'Big tickets',
    blurb: 'Priciest first: knocks out expensive slots while you have the money.',
    ...bigTickets(items, budget),
  })
  // Only show alternatives that differ from a cart already listed.
  const distinct = carts.filter((c, i) => c.items.length > 0 && !carts.slice(0, i).some((p) => sameCards(p, c)))
  return { carts: distinct, candidates: items, filteredOut }
}
