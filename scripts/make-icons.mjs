// Generates the app icons (a 3×3 binder page, some pockets filled) into public/.
import { writeFile } from 'node:fs/promises'
import sharp from 'sharp'

const filled = new Set([0, 1, 2, 4, 6])
function svg({ pad = 0, bg = '#171a20' } = {}) {
  const size = 512
  const inner = size - pad * 2
  const gap = inner * 0.035
  const cw = (inner * 0.7 - 2 * gap) / 3
  const ch = (cw * 88) / 63
  const gw = 3 * cw + 2 * gap
  const gh = 3 * ch + 2 * gap
  const x0 = (size - gw) / 2
  const y0 = (size - gh) / 2
  const colors = ['#7aa2ff', '#f2c14e', '#4cc282', '#f07ab3', '#ff8a5b']
  let cells = ''
  for (let i = 0; i < 9; i++) {
    const x = x0 + (i % 3) * (cw + gap)
    const y = y0 + Math.floor(i / 3) * (ch + gap)
    const fill = filled.has(i) ? colors[[...filled].indexOf(i)] : '#2a2f39'
    cells += `<rect x="${x}" y="${y}" width="${cw}" height="${ch}" rx="${cw * 0.1}" fill="${fill}"/>`
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}"><rect width="${size}" height="${size}" rx="${pad ? 0 : 96}" fill="${bg}"/>${cells}</svg>`
}

const pub = new URL('../public/', import.meta.url)
await writeFile(new URL('favicon.svg', pub), svg())
const out = (name, s, w) => sharp(Buffer.from(s)).resize(w, w).png().toFile(new URL(name, pub).pathname)
await out('pwa-192.png', svg(), 192)
await out('pwa-512.png', svg(), 512)
await out('maskable-512.png', svg({ pad: 60 }), 512)
// iOS rounds corners itself and dislikes transparency: full-bleed square.
await out('apple-touch-icon.png', svg({ pad: 30 }), 180)
console.log('icons written')
