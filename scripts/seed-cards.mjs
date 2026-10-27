// Seeds the Supabase `cards` table from src/data/catalog.json.
// Insert-only: cards that already exist are left untouched (prices belong to the refresh job),
// and this script never reads or writes ownership. Your owned/paid records are seeded by the app
// itself on first sign-in, also insert-only.
//
// Usage: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run seed

import { readFile } from 'node:fs/promises'
import { createClient } from '@supabase/supabase-js'

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (Project Settings → API).')
  process.exit(1)
}

const catalog = JSON.parse(await readFile(new URL('../src/data/catalog.json', import.meta.url), 'utf8'))
const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const cardColumns = [
  'id', 'dex', 'pokemon', 'card', 'set_name', 'set_code', 'number', 'tier', 'language', 'pickable',
  'price_usd', 'price_source', 'price_date', 'tcgplayer_url', 'tcgplayer_product_id', 'limitless_url',
]
const rows = catalog.options.map((o) => Object.fromEntries(cardColumns.map((k) => [k, o[k]])))

const { error, count } = await db
  .from('cards')
  .upsert(rows, { onConflict: 'id', ignoreDuplicates: true, count: 'exact' })
if (error) throw error

const history = rows
  .filter((r) => r.price_usd != null && r.price_date)
  .map((r) => ({ card_id: r.id, price_date: r.price_date, price_usd: r.price_usd }))
const h = await db.from('price_history').upsert(history, { onConflict: 'card_id,price_date', ignoreDuplicates: true })
if (h.error) throw h.error

console.log(`Inserted ${count ?? 0} new cards (of ${rows.length}); seeded ${history.length} price-history points.`)
