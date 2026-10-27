import { useEffect, useRef, useState } from 'react'
import { buyUrl, dexLabel, imageUrl, usd, type Card, type Ownership, type Slot } from '../catalog'

interface Props {
  slot: Slot | null
  own: Ownership
  onClose: () => void
  onOwned: (id: string, owned: boolean) => void
  onPaid: (id: string, paid: number | null) => void
  onPick: (dex: number, id: string | null) => void
}

export function DetailSheet({ slot, own, onClose, onOwned, onPaid, onPick }: Props) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [previewId, setPreviewId] = useState<string | null>(null)

  useEffect(() => {
    const d = dialog.current
    if (!d) return
    if (slot && !d.open) d.showModal()
    if (!slot && d.open) d.close()
    setPreviewId(null)
  }, [slot?.pokemon.dex]) // eslint-disable-line react-hooks/exhaustive-deps

  const preview = slot ? (slot.options.find((c) => c.id === previewId) ?? slot.shown ?? slot.options[0] ?? null) : null
  const multiOwned = (slot?.ownedCards.length ?? 0) > 1

  return (
    <dialog
      ref={dialog}
      className="sheet"
      onClose={onClose}
      onClick={(e) => e.target === dialog.current && dialog.current.close()} // tap backdrop
    >
      {slot && (
        <div className="sheet-body">
          <div className="sheet-head">
            <div>
              <div className="muted small">{dexLabel(slot.pokemon.dex)}</div>
              <h2>{slot.pokemon.name}</h2>
            </div>
            <span className={`badge state-${slot.state}`}>
              {slot.state === 'collected' ? 'Collected' : slot.state === 'missing' ? 'Missing' : 'No eligible card'}
            </span>
            <button className="icon-btn" onClick={() => dialog.current?.close()} aria-label="Close" autoFocus>
              ✕
            </button>
          </div>

          {preview && (
            <figure className="sheet-image">
              <img key={preview.id} src={imageUrl(preview.id, 'lg')} alt={preview.card} className={own.owned[preview.id] ? '' : 'unowned'} />
              <figcaption className="muted small">
                {preview.card} · {preview.set_name} {preview.number}
              </figcaption>
            </figure>
          )}

          {slot.options.length === 0 ? (
            <p className="muted">No eligible full-art card exists for {slot.pokemon.name} yet.</p>
          ) : (
            <ul className="options">
              {slot.options.map((c) => (
                <OptionRow
                  key={c.id}
                  card={c}
                  owned={!!own.owned[c.id]}
                  paid={own.paid[c.id] ?? null}
                  isCheapest={slot.state === 'missing' && slot.shown?.id === c.id}
                  isBinderCard={slot.state === 'collected' && slot.shown?.id === c.id}
                  showPick={multiOwned && !!own.owned[c.id]}
                  isPreview={preview?.id === c.id}
                  onPreview={() => setPreviewId(c.id)}
                  onOwned={(v) => onOwned(c.id, v)}
                  onPaid={(v) => onPaid(c.id, v)}
                  onPick={() => onPick(slot.pokemon.dex, c.id)}
                />
              ))}
            </ul>
          )}
        </div>
      )}
    </dialog>
  )
}

interface RowProps {
  card: Card
  owned: boolean
  paid: number | null
  isCheapest: boolean
  isBinderCard: boolean
  showPick: boolean
  isPreview: boolean
  onPreview: () => void
  onOwned: (owned: boolean) => void
  onPaid: (paid: number | null) => void
  onPick: () => void
}

function OptionRow({ card: c, owned, paid, isCheapest, isBinderCard, showPick, isPreview, onPreview, onOwned, onPaid, onPick }: RowProps) {
  const buy = buyUrl(c)
  const notPickable = !c.pickable ? (c.language === 'JP' ? 'Japanese, never suggested' : `${c.tier}, never suggested`) : null

  return (
    <li className={`option${isPreview ? ' previewing' : ''}`}>
      <button className="option-main" onClick={onPreview} aria-label={`Preview ${c.card}`}>
        <img src={imageUrl(c.id, 'sm')} alt="" loading="lazy" className={owned ? '' : 'unowned'} />
        <div className="option-info">
          <div className="option-title">
            {c.card}
            {isCheapest && <span className="tag tag-accent">Cheapest</span>}
            {isBinderCard && <span className="tag tag-good">In binder</span>}
          </div>
          <div className="muted small">
            <span className="tag">{c.tier}</span>
            {c.language === 'JP' && <span className="tag tag-jp">JP</span>} {c.set_name} · {c.number}
          </div>
          {notPickable && <div className="muted small">{notPickable}</div>}
        </div>
        <div className="option-price">
          <div className="price">{usd(c.price_usd)}</div>
          <div className="muted tiny">{c.price_date ? fmtDate(c.price_date) : c.price_usd != null ? 'date unknown' : 'no price'}</div>
        </div>
      </button>

      <div className="option-actions">
        <label className="switch">
          <input type="checkbox" checked={owned} onChange={(e) => onOwned(e.target.checked)} />
          <span className="switch-track" aria-hidden="true" />
          I own this
        </label>
        {owned && <PaidField key={paid ?? 'none'} value={paid} onCommit={onPaid} />}
        <a className="btn btn-buy" href={buy.href} target="_blank" rel="noopener noreferrer">
          {buy.label}
        </a>
      </div>
      {showPick && (
        <label className="pick">
          <input type="radio" name="binder-pick" checked={isBinderCard} onChange={onPick} />
          Use in binder
        </label>
      )}
    </li>
  )
}

function PaidField({ value, onCommit }: { value: number | null; onCommit: (v: number | null) => void }) {
  const [text, setText] = useState(value == null ? '' : value.toFixed(2))

  const commit = () => {
    const trimmed = text.replace(/[$,\s]/g, '')
    if (trimmed === '') return value != null && onCommit(null)
    const n = Number(trimmed)
    if (!Number.isFinite(n) || n < 0) return setText(value == null ? '' : value.toFixed(2))
    const rounded = Math.round(n * 100) / 100
    if (rounded !== value) onCommit(rounded)
    setText(rounded.toFixed(2))
  }

  return (
    <label className="paid">
      Paid $
      <input
        type="text"
        inputMode="decimal"
        placeholder="0.00"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      />
    </label>
  )
}

const fmtDate = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
