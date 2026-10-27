import { useEffect, useMemo, useRef, useState } from 'react'
import { dexLabel, type Slot } from '../catalog'

interface Props {
  open: boolean
  slots: Slot[]
  onClose: () => void
  onPick: (dex: number) => void
}

const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // Nidoran♀ / Flabébé-style accents
    .replace(/[^a-z0-9]/g, '')

export function JumpTo({ open, slots, onClose, onPick }: Props) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [q, setQ] = useState('')

  useEffect(() => {
    const d = dialog.current
    if (!d) return
    if (open && !d.open) {
      setQ('')
      d.showModal()
    }
    if (!open && d.open) d.close()
  }, [open])

  const results = useMemo(() => {
    const raw = q.trim().replace(/^#/, '')
    if (!raw) return []
    if (/^\d+$/.test(raw)) {
      const n = Number(raw)
      return slots.filter((s) => s.pokemon.dex === n || String(s.pokemon.dex).startsWith(raw)).slice(0, 12)
    }
    const nq = normalize(raw)
    const starts = slots.filter((s) => normalize(s.pokemon.name).startsWith(nq))
    const contains = slots.filter((s) => !starts.includes(s) && normalize(s.pokemon.name).includes(nq))
    return [...starts, ...contains].slice(0, 12)
  }, [q, slots])

  const choose = (dex: number) => {
    onPick(dex)
    dialog.current?.close()
  }

  return (
    <dialog ref={dialog} className="jump" onClose={onClose} onClick={(e) => e.target === dialog.current && dialog.current.close()}>
      <form
        method="dialog"
        onSubmit={(e) => {
          e.preventDefault()
          if (results[0]) choose(results[0].pokemon.dex)
        }}
      >
        <input
          type="search"
          autoFocus
          placeholder="Name or number, e.g. Pikachu or 25"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Jump to a Pokémon"
          enterKeyHint="go"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
        />
      </form>
      <ul className="jump-results">
        {results.map((s) => (
          <li key={s.pokemon.dex}>
            <button onClick={() => choose(s.pokemon.dex)}>
              <span className="dex">{dexLabel(s.pokemon.dex)}</span>
              <span className="name">{s.pokemon.name}</span>
              <span className={`badge state-${s.state}`}>{s.state === 'collected' ? 'Collected' : s.state === 'missing' ? 'Missing' : 'None yet'}</span>
            </button>
          </li>
        ))}
        {q.trim() && results.length === 0 && <li className="muted jump-empty">No match</li>}
      </ul>
    </dialog>
  )
}
