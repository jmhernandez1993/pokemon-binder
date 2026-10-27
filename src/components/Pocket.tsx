import { useRef, useState } from 'react'
import { buyUrl, dexLabel, imageUrl, usd, type Slot } from '../catalog'

interface Props {
  slot: Slot
  flash: boolean
  onOpen: (dex: number) => void
}

const LONG_PRESS_MS = 450

/**
 * The sheet opens while the finger is still down, so the click a browser may send on release
 * would land on whatever is now under it (e.g. the "I own this" switch). Swallow that one click,
 * wherever it lands.
 */
function swallowClickAfterRelease() {
  let t = 0
  const swallow = (e: Event) => {
    e.preventDefault()
    e.stopPropagation()
    cleanup()
  }
  const release = () => (t = window.setTimeout(cleanup, 350))
  const cleanup = () => {
    window.clearTimeout(t)
    window.removeEventListener('click', swallow, true)
    window.removeEventListener('pointerup', release, true)
    window.removeEventListener('pointercancel', cleanup, true)
  }
  window.addEventListener('click', swallow, true)
  // Listen on window: once the sheet covers the pocket, the release may not reach the pocket.
  window.addEventListener('pointerup', release, { capture: true, once: true })
  window.addEventListener('pointercancel', cleanup, { capture: true, once: true })
}

/** Long-press detection that cancels on scroll/swipe and swallows the click that follows the press. */
function useLongPress(onLongPress: () => void) {
  const timer = useRef<number | null>(null)
  const start = useRef<{ x: number; y: number } | null>(null)
  const clear = () => {
    if (timer.current) window.clearTimeout(timer.current)
    timer.current = null
  }
  return {
    onPointerDown(e: React.PointerEvent) {
      start.current = { x: e.clientX, y: e.clientY }
      clear()
      timer.current = window.setTimeout(() => {
        swallowClickAfterRelease()
        navigator.vibrate?.(10)
        onLongPress()
      }, LONG_PRESS_MS)
    },
    onPointerMove(e: React.PointerEvent) {
      if (start.current && Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) > 10) clear()
    },
    onPointerUp: clear,
    onPointerCancel: clear,
    onPointerLeave: clear,
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  }
}

function CardImage({ id, alt }: { id: string; alt: string }) {
  const [failed, setFailed] = useState(false)
  if (failed) return <span className="img-fallback">{alt}</span>
  return <img src={imageUrl(id, 'sm')} alt={alt} loading="lazy" decoding="async" draggable={false} onError={() => setFailed(true)} />
}

export function Pocket({ slot, flash, onOpen }: Props) {
  const { pokemon: p, state, shown } = slot
  const longPress = useLongPress(() => onOpen(p.dex))
  const label = (
    <div className="pocket-label">
      <span className="dex">{dexLabel(p.dex)}</span> <span className="name">{p.name}</span>
    </div>
  )
  const cls = `pocket pocket-${state}${flash ? ' flash' : ''}`

  if (state === 'empty' || !shown) {
    return (
      <div className={cls}>
        <div className="sleeve" aria-label={`${p.name}: no eligible card yet`} />
        {label}
      </div>
    )
  }

  if (state === 'collected') {
    return (
      <div className={cls}>
        <button className="sleeve" onClick={() => onOpen(p.dex)} aria-label={`${p.name}: collected, ${shown.card}. Show details`}>
          <CardImage id={shown.id} alt={shown.card} />
        </button>
        {label}
      </div>
    )
  }

  // Missing: tap goes straight to the store listing; long-press or ⓘ opens the detail sheet.
  const buy = buyUrl(shown)
  return (
    <div className={cls}>
      <a
        className="sleeve"
        href={buy.href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`${p.name}: missing. Cheapest ${shown.card}, ${usd(shown.price_usd)}. ${buy.label}`}
        {...longPress}
      >
        <CardImage id={shown.id} alt={shown.card} />
        <span className="price-chip">{usd(shown.price_usd, shown.price_usd! >= 100 ? 0 : 2)}</span>
      </a>
      <button className="info-btn" onClick={() => onOpen(p.dex)} aria-label={`${p.name} details`}>
        i
      </button>
      {label}
    </div>
  )
}
