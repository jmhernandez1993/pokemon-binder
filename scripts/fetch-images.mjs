// One-time image download. For every card in the catalog:
//   1. Read its Limitless page (large card image + the TCGplayer product IDs it links to).
//   2. Download the TCGplayer CDN image when the catalog's product ID is confirmed by Limitless
//      (or Limitless has no TCGplayer link to compare against); otherwise use the Limitless image.
//   3. Write public/cards/sm/<id>.webp (240px, binder grid) and public/cards/lg/<id>.webp (500px, detail sheet).
// Re-running skips cards whose images already exist. Pass --force to redo them all.
// A report of product-ID mismatches and failures is written to scripts/output/images-report.json.

import { readFile, writeFile, mkdir, access } from 'node:fs/promises'
import sharp from 'sharp'

const root = new URL('..', import.meta.url)
const catalog = JSON.parse(await readFile(new URL('src/data/catalog.json', root), 'utf8'))
const force = process.argv.includes('--force')
const UA = 'Mozilla/5.0 (gen1-binder image fetch; personal use)'

const smDir = new URL('public/cards/sm/', root)
const lgDir = new URL('public/cards/lg/', root)
const outDir = new URL('scripts/output/', root)
await Promise.all([smDir, lgDir, outDir].map((d) => mkdir(d, { recursive: true })))

const exists = (u) => access(u).then(() => true, () => false)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function get(url, as = 'text') {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA } })
      if (res.status === 404) return null
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return as === 'text' ? await res.text() : Buffer.from(await res.arrayBuffer())
    } catch (err) {
      if (attempt === 3) throw new Error(`${url}: ${err.message}`)
      await sleep(1000 * attempt)
    }
  }
}

function parseLimitless(html) {
  // Prefer the _LG scan; fall back to any card scan on the page.
  const imgs = [...html.matchAll(/https:\/\/limitlesstcg\.nyc3\.cdn\.digitaloceanspaces\.com\/(?:tpci|tpc)\/[^"'\s]+?\.png/g)].map((m) => m[0])
  const image = imgs.find((u) => u.includes('_LG')) ?? imgs[0]?.replace(/_(SM|XS)\.png$/, '_LG.png') ?? null
  // TCGplayer links appear URL-encoded inside Limitless affiliate links.
  const decoded = decodeURIComponent(html)
  const productIds = new Set([...decoded.matchAll(/tcgplayer\.com\/product\/(\d+)/g)].map((m) => Number(m[1])))
  return { image, productIds }
}

const report = { generated: new Date().toISOString(), mismatches: [], failures: [], sources: {} }

async function processCard(card) {
  const sm = new URL(`${card.id}.webp`, smDir)
  const lg = new URL(`${card.id}.webp`, lgDir)
  if (!force && (await exists(sm)) && (await exists(lg))) return 'skipped'

  let limitless = { image: null, productIds: new Set() }
  if (card.limitless_url) {
    const html = await get(card.limitless_url)
    if (html) limitless = parseLimitless(html)
  }

  const pid = card.tcgplayer_product_id
  // The current card's own link is usually the first of several; any match counts as confirmed.
  const confirmed = pid && (limitless.productIds.size === 0 || limitless.productIds.has(pid))
  if (pid && !confirmed) {
    report.mismatches.push({ id: card.id, card: card.card, catalog_product_id: pid, limitless_product_ids: [...limitless.productIds] })
  }

  const candidates = []
  if (confirmed) candidates.push(['tcgplayer', `https://tcgplayer-cdn.tcgplayer.com/product/${pid}_in_1000x1000.jpg`])
  if (limitless.image) candidates.push(['limitless', limitless.image])

  for (const [source, url] of candidates) {
    const buf = await get(url, 'buffer').catch(() => null)
    if (!buf || buf.length < 2000) continue
    const img = sharp(buf)
    await img.clone().resize({ width: 240, withoutEnlargement: true }).webp({ quality: 78 }).toFile(sm.pathname)
    await img.clone().resize({ width: 500, withoutEnlargement: true }).webp({ quality: 82 }).toFile(lg.pathname)
    report.sources[card.id] = source
    return source
  }
  report.failures.push({ id: card.id, card: card.card, limitless_url: card.limitless_url, product_id: pid })
  return 'failed'
}

const queue = [...catalog.options]
const counts = {}
async function worker() {
  for (let card; (card = queue.shift()); ) {
    let result
    try {
      result = await processCard(card)
    } catch (err) {
      report.failures.push({ id: card.id, card: card.card, error: err.message })
      result = 'failed'
    }
    counts[result] = (counts[result] ?? 0) + 1
    process.stdout.write(`\r${catalog.options.length - queue.length}/${catalog.options.length} ${JSON.stringify(counts)}   `)
    await sleep(250) // be polite to Limitless
  }
}
await Promise.all(Array.from({ length: 4 }, worker))

await writeFile(new URL('images-report.json', outDir), JSON.stringify(report, null, 2))
console.log(`\nMismatched product IDs: ${report.mismatches.length}. Failures: ${report.failures.length}. Report: scripts/output/images-report.json`)
