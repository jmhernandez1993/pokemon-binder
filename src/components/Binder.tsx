import { useEffect, useRef } from 'react'
import { PAGE_COUNT, POCKETS_PER_PAGE, pageRange, type Slot } from '../catalog'
import { Pocket } from './Pocket'

interface Props {
  slots: Slot[]
  page: number
  /** Changing `seq` scrolls to `page` (used for jump-to, arrows and dots). */
  target: { page: number; seq: number; smooth: boolean }
  flashDex: number | null
  onPageChange: (page: number) => void
  onOpen: (dex: number) => void
}

export function Binder({ slots, page, target, flashDex, onPageChange, onOpen }: Props) {
  const scroller = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = scroller.current
    if (!el) return
    el.scrollTo({ left: target.page * el.clientWidth, behavior: target.smooth ? 'smooth' : 'instant' })
  }, [target])

  // Keep the current page in view when the width changes (rotation, Mac window resize).
  const pageRef = useRef(page)
  useEffect(() => {
    pageRef.current = page
  }, [page])
  useEffect(() => {
    const el = scroller.current
    if (!el) return
    let width = el.clientWidth
    const ro = new ResizeObserver(() => {
      if (el.clientWidth === width) return
      width = el.clientWidth
      el.scrollTo({ left: pageRef.current * width, behavior: 'instant' })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const onScroll = () => {
    const el = scroller.current
    if (!el) return
    const p = Math.round(el.scrollLeft / el.clientWidth)
    if (p !== page && p >= 0 && p < PAGE_COUNT) onPageChange(p)
  }

  return (
    <div className="binder" ref={scroller} onScroll={onScroll}>
      {Array.from({ length: PAGE_COUNT }, (_, i) => {
        const { first, last } = pageRange(i)
        const pageSlots = slots.slice(i * POCKETS_PER_PAGE, (i + 1) * POCKETS_PER_PAGE)
        // Only mount images on nearby pages; far pages render empty sleeves until approached.
        const near = Math.abs(i - page) <= 1
        return (
          <section className="page" key={i} aria-label={`Page ${i + 1}, #${first} to #${last}`} aria-hidden={i !== page}>
            <div className="grid">
              {pageSlots.map((s) =>
                near ? (
                  <Pocket key={s.pokemon.dex} slot={s} flash={flashDex === s.pokemon.dex} onOpen={onOpen} />
                ) : (
                  <div key={s.pokemon.dex} className="pocket pocket-placeholder">
                    <div className="sleeve" />
                    <div className="pocket-label" />
                  </div>
                ),
              )}
            </div>
          </section>
        )
      })}
    </div>
  )
}
