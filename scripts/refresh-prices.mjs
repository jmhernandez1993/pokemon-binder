// Refreshes English card prices from limitlesstcg.com card search (list view, USD = TCGplayer market).
//
// Writes ONLY cards.price_usd / price_date / price_source, plus a price_history row per card.
// It never reads or writes the ownership or binder_picks tables, so owned/paid records are untouched.
//
// With SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY set: updates Supabase.
// Without them (or with --dry-run): compares against src/data/catalog.json and only prints a report.
// Japanese prices (PriceCharting) are not refreshed here.

import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { createClient } from '@supabase/supabase-js'

const QUERY = 'dex<=151 lang:en o:pokedex d:l show:all'
const UA = 'Mozilla/5.0 (gen1-binder price refresh; personal use, weekly)'
const MIN_COVERAGE = 0.8 // abort without writing if Limitless suddenly matches far fewer cards
const today = new Date().toISOString().slice(0, 10)

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env
const dryRun = process.argv.includes('--dry-run') || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY

/**
 * Normalises set code + number to Limitless's form:
 * no leading zeros (TG3, 44), SWSH promos (SP) drop "SWSH", XY promos (XYP) drop "XY".
 */
export function limitlessKey(setCode, number) {
  let n = String(number).trim().toUpperCase()
  if (setCode === 'SP') n = n.replace(/^SWSH/, '')
  if (setCode === 'XYP') n = n.replace(/^XY/, '')
  n = n.replace(/^([A-Z]*)0+(?=\d)/, '$1')
  return `${setCode}|${n}`
}

async function fetchPage(page) {
  const url = new URL('https://limitlesstcg.com/cards')
  url.searchParams.set('q', QUERY)
  if (page > 1) url.searchParams.set('page', String(page))
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA } })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return await res.text()
    } catch (err) {
      if (attempt >= 3) throw new Error(`Limitless page ${page}: ${err.message}`)
      await new Promise((r) => setTimeout(r, 2000 * attempt))
    }
  }
}

function parsePage(html, prices) {
  const table = html.slice(html.indexOf('card-list'))
  for (const row of table.split('<tr').slice(1)) {
    const link = row.match(/href="\/cards\/en\/([^/"]+)\/([^"]+)"/)
    const usd = row.match(/class="card-price usd"[^>]*>\s*\$([\d,]+\.\d{2})/)
    if (!link || !usd) continue // no USD price listed: keep the last known price
    prices.set(limitlessKey(link[1], decodeURIComponent(link[2])), Number(usd[1].replace(/,/g, '')))
  }
  const max = html.match(/class="pagination"[^>]*data-max="(\d+)"/)
  return max ? Number(max[1]) : 1
}

async function scrape() {
  const prices = new Map()
  const pages = parsePage(await fetchPage(1), prices)
  for (let p = 2; p <= pages; p++) {
    await new Promise((r) => setTimeout(r, 1500))
    parsePage(await fetchPage(p), prices)
  }
  console.log(`Limitless: ${prices.size} priced English cards across ${pages} page(s).`)
  return prices
}

async function loadCards(db) {
  if (!db) {
    const catalog = JSON.parse(await readFile(new URL('../src/data/catalog.json', import.meta.url), 'utf8'))
    return catalog.options
  }
  const { data, error } = await db.from('cards').select('id, card, set_code, number, language, price_usd')
  if (error) throw new Error(`Reading cards: ${error.message}`)
  return data
}

const db = dryRun ? null : createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const cards = (await loadCards(db)).filter((c) => c.language === 'EN')
const prices = await scrape()

const changes = []
const missing = []
for (const c of cards) {
  const price = prices.get(limitlessKey(c.set_code, c.number))
  if (price == null) missing.push(c.id)
  else changes.push({ id: c.id, card: c.card, old: c.price_usd == null ? null : Number(c.price_usd), price })
}

const coverage = changes.length / cards.length
console.log(`Matched ${changes.length}/${cards.length} English cards (${Math.round(coverage * 100)}%).`)
if (missing.length) console.log(`No Limitless price (left unchanged): ${missing.join(', ')}`)

const moved = changes.filter((c) => c.old != null && c.old !== c.price)
const big = moved.filter((c) => Math.abs(c.price - c.old) / c.old >= 0.25).sort((a, b) => Math.abs(b.price - b.old) - Math.abs(a.price - a.old))
console.log(`${moved.length} prices changed; ${big.length} moved 25% or more:`)
for (const c of big.slice(0, 15)) console.log(`  ${c.id.padEnd(12)} ${c.card.slice(0, 28).padEnd(28)} $${c.old.toFixed(2)} → $${c.price.toFixed(2)}`)

await mkdir(new URL('output/', import.meta.url), { recursive: true })
await writeFile(new URL(`output/prices-${today}.json`, import.meta.url), JSON.stringify({ date: today, coverage, missing, changes }, null, 2))

if (coverage < MIN_COVERAGE) {
  console.error(`Coverage below ${MIN_COVERAGE * 100}%: Limitless may have changed its page layout. Nothing written.`)
  process.exit(1)
}

if (dryRun) {
  console.log('Dry run: nothing written. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to update Supabase.')
  process.exit(0)
}

// Price fields only. Row-by-row update() never inserts and never touches any other column.
const source = 'TCGplayer market via Limitless'
for (let i = 0; i < changes.length; i += 20) {
  const batch = changes.slice(i, i + 20)
  const results = await Promise.all(
    batch.map((c) => db.from('cards').update({ price_usd: c.price, price_date: today, price_source: source }).eq('id', c.id)),
  )
  const failed = results.find((r) => r.error)
  if (failed) throw new Error(`Updating prices: ${failed.error.message}`)
}
const history = changes.map((c) => ({ card_id: c.id, price_date: today, price_usd: c.price }))
const { error } = await db.from('price_history').upsert(history, { onConflict: 'card_id,price_date' })
if (error) throw new Error(`Writing price history: ${error.message}`)
console.log(`Updated ${changes.length} prices in Supabase (dated ${today}).`)
