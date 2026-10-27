import { PAGE_COUNT, pageRange } from '../catalog'

interface Props {
  page: number
  onGo: (page: number) => void
}

export function Pager({ page, onGo }: Props) {
  const { first, last } = pageRange(page)
  return (
    <nav className="pager" aria-label="Binder pages">
      <button className="icon-btn" onClick={() => onGo(page - 1)} disabled={page === 0} aria-label="Previous page">
        ‹
      </button>
      <div className="pager-mid">
        <div className="pager-text">
          Page {page + 1} · #{first}–{last}
        </div>
        <div className="dots">
          {Array.from({ length: PAGE_COUNT }, (_, i) => (
            <button key={i} className={`dot${i === page ? ' on' : ''}`} onClick={() => onGo(i)} aria-label={`Page ${i + 1}`} aria-current={i === page} />
          ))}
        </div>
      </div>
      <button className="icon-btn" onClick={() => onGo(page + 1)} disabled={page === PAGE_COUNT - 1} aria-label="Next page">
        ›
      </button>
    </nav>
  )
}
