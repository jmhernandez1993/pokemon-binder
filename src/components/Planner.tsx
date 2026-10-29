import { useEffect, useMemo, useRef, useState } from 'react'
import { buyUrl, dexLabel, imageUrl, usd, type Slot } from '../catalog'
import { NO_FILTERS, plan, toCents, type CartKey, type PlanFilters, type PlanItem } from '../planner'

interface Props {
  open: boolean
  slots: Slot[]
  onClose: () => void
  /** Resolves to false if the save failed (the change is rolled back). */
  onSetOwned: (ids: string[], owned: boolean) => Promise<boolean>
}

const STORE_KEY = 'gen1-binder:planner:v1'
const PRESETS = [10, 25, 50, 100]

interface Saved {
  budget: string
  filters: PlanFilters
}

function readSaved(): Saved {
  try {
    const s = JSON.parse(localStorage.getItem(STORE_KEY) ?? 'null') as Partial<Saved> | null
    return { budget: typeof s?.budget === 'string' ? s.budget : '', filters: { ...NO_FILTERS, ...s?.filters } }
  } catch {
    return { budget: '', filters: NO_FILTERS }
  }
}

/** "$18", "18.5", "1,200" → cents; anything else → null. */
function parseBudget(text: string): number | null {
  const t = text.replace(/[$,\s]/g, '')
  if (!t) return null
  const n = Number(t)
  return Number.isFinite(n) && n > 0 ? toCents(n) : null
}

const money = (cents: number) => usd(cents / 100)
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

type Done = { ids: string[]; budget: string } | { failed: true }

export function Planner({ open, slots, onClose, onSetOwned }: Props) {
  const dialog = useRef<HTMLDialogElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const closeBtn = useRef<HTMLButtonElement>(null)
  const [saved] = useState(readSaved)
  const [budgetText, setBudgetText] = useState(saved.budget)
  const [filters, setFilters] = useState(saved.filters)
  const [cartKey, setCartKey] = useState<CartKey>('most')
  const [done, setDone] = useState<Done | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const d = dialog.current
    if (!d) return
    if (open && !d.open) {
      d.showModal()
      // Straight to typing when there's no budget yet; otherwise don't pop the keyboard over the results.
      const target = budgetText ? closeBtn.current : input.current
      target?.focus()
    }
    if (!open && d.open) d.close()
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ budget: budgetText, filters }))
    } catch {
      /* non-fatal */
    }
  }, [budgetText, filters])

  const budget = parseBudget(budgetText)
  const result = useMemo(() => plan(slots, filters, budget ?? 0), [slots, filters, budget])
  const everything = result.candidates.reduce((sum, it) => sum + it.cents, 0)
  const cart = result.carts.find((c) => c.key === cartKey) ?? result.carts[0] ?? null
  const cheapest = result.candidates[0] ?? null

  const toggle = (k: keyof PlanFilters) => setFilters((f) => ({ ...f, [k]: !f[k] }))

  const markAll = async () => {
    if (!cart || busy) return
    const ids = cart.items.map((it) => it.card.id)
    setBusy(true)
    const ok = await onSetOwned(ids, true)
    setBusy(false)
    if (!ok) return setDone({ failed: true })
    setDone({ ids, budget: budgetText })
    setBudgetText('') // that money is spent
  }

  const undo = async () => {
    if (!done || 'failed' in done || busy) return
    setBusy(true)
    const ok = await onSetOwned(done.ids, false)
    setBusy(false)
    if (!ok) return setDone({ failed: true })
    if (!budgetText) setBudgetText(done.budget)
    setDone(null)
  }

  return (
    <dialog
      ref={dialog}
      className="sheet planner"
      aria-labelledby="planner-title"
      onClose={() => {
        setDone(null)
        onClose()
      }}
      onClick={(e) => e.target === dialog.current && dialog.current.close()}
    >
      <div className="planner-body">
        <div className="sheet-head">
          <div>
            <h2 id="planner-title">Budget planner</h2>
          </div>
          <button ref={closeBtn} className="icon-btn" onClick={() => dialog.current?.close()} aria-label="Close">
            ✕
          </button>
        </div>

        <label className="budget">
          <span aria-hidden="true">$</span>
          <input
            ref={input}
            type="text"
            inputMode="decimal"
            enterKeyHint="done"
            placeholder="Budget"
            aria-label="Budget in dollars"
            autoComplete="off"
            value={budgetText}
            onChange={(e) => setBudgetText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          />
        </label>
        <div className="chips" aria-label="Quick amounts">
          {PRESETS.map((n) => (
            <button key={n} className="chip" onClick={() => setBudgetText(String(n))} aria-pressed={budget === n * 100}>
              ${n}
            </button>
          ))}
          {everything > 0 && (
            <button className="chip" onClick={() => setBudgetText((everything / 100).toFixed(2))} aria-pressed={budget === everything}>
              All · {money(everything)}
            </button>
          )}
        </div>

        <div className="chips filters" aria-label="Filters">
          <FilterChip on={filters.noRegional} onClick={() => toggle('noRegional')} label="No regional" />
          <FilterChip on={filters.noFullArt} onClick={() => toggle('noFullArt')} label="No Full Arts" />
          <FilterChip on={filters.noGallery} onClick={() => toggle('noGallery')} label="No gallery" />
        </div>
        <p className="muted tiny filter-note">
          English cards only.
          {filters.noRegional && ' Regional forms: Alolan, Galarian, Hisuian, Paldean.'}
          {result.filteredOut.length > 0 && ` Filters leave out ${names(result.filteredOut)}.`}
        </p>

        {done && 'failed' in done && (
          <p className="banner banner-error" role="alert">
            Couldn't save, so nothing changed. Check your connection and try again.
          </p>
        )}
        {done && !('failed' in done) && (
          <p className="banner banner-good" role="status">
            Marked {plural(done.ids.length, 'card')} as owned.
            <button className="btn btn-link" onClick={undo} disabled={busy}>
              Undo
            </button>
          </p>
        )}

        {budget == null ? (
          <div className="plan-empty">
            {cheapest ? (
              <>
                <p>Enter an amount to see which missing cards it buys.</p>
                <p className="muted small">
                  {plural(result.candidates.length, 'missing card')} to buy, from {money(cheapest.cents)} to{' '}
                  {money(result.candidates[result.candidates.length - 1].cents)}.
                </p>
              </>
            ) : (
              <p>Nothing left to buy with these filters.</p>
            )}
          </div>
        ) : !cart ? (
          <div className="plan-empty">
            {cheapest ? (
              <>
                <p>{money(budget)} doesn't cover any missing card yet.</p>
                <p className="muted small">The cheapest is:</p>
                <ul className="plan-list">
                  <PlanRow item={cheapest} note={`${money(cheapest.cents - budget)} more`} dashed />
                </ul>
              </>
            ) : (
              <p>Nothing left to buy with these filters.</p>
            )}
          </div>
        ) : (
          <>
            {result.carts.length > 1 && (
              <div className="carts" role="group" aria-label="Carts">
                {result.carts.map((c) => (
                  <button key={c.key} className="cart-btn" aria-pressed={c.key === cart.key} onClick={() => setCartKey(c.key)}>
                    <span className="cart-label">{c.label}</span>
                    <span className="cart-count">{plural(c.items.length, 'card')}</span>
                    <span className="muted small">{money(c.total)}</span>
                  </button>
                ))}
              </div>
            )}
            <p className="muted small cart-blurb">{cart.blurb}</p>
            <p className="cart-summary">
              <strong>{plural(cart.items.length, 'card')}</strong> for <strong>{money(cart.total)}</strong>
              <span className="muted"> · {money(cart.leftover)} left</span>
            </p>
            <ul className="plan-list">
              {cart.items.map((it) => (
                <PlanRow key={it.card.id} item={it} />
              ))}
            </ul>
            {cart.next ? (
              <>
                <p className="muted small next-label">Next card you can't afford yet</p>
                <ul className="plan-list">
                  <PlanRow item={cart.next} note={`${money(cart.next.cents - cart.leftover)} more`} dashed />
                </ul>
              </>
            ) : (
              <p className="muted small next-label">This fills every missing slot you can buy with these filters.</p>
            )}
          </>
        )}
      </div>

      {cart && budget != null && (
        <div className="planner-foot">
          <button className="btn btn-primary" onClick={markAll} disabled={busy}>
            {busy ? 'Saving…' : cart.items.length === 1 ? 'Mark as bought' : `Mark all ${cart.items.length} as bought`}
          </button>
        </div>
      )}
    </dialog>
  )
}

function FilterChip({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button className="chip chip-filter" aria-pressed={on} onClick={onClick}>
      <span className="chip-check" aria-hidden="true">
        {on ? '✓' : ''}
      </span>
      {label}
    </button>
  )
}

function PlanRow({ item: { card: c, slot, cents }, note, dashed }: { item: PlanItem; note?: string; dashed?: boolean }) {
  const buy = buyUrl(c)
  return (
    <li>
      <a className={`plan-row${dashed ? ' plan-row-next' : ''}`} href={buy.href} target="_blank" rel="noopener noreferrer">
        <img src={imageUrl(c.id, 'sm')} alt="" loading="lazy" />
        <span className="plan-info">
          <span className="plan-name">
            <span className="muted">{dexLabel(slot.pokemon.dex)}</span> {slot.pokemon.name}
          </span>
          <span className="muted small">
            <span className="tag">{c.tier}</span>
            {c.set_name} · {c.number}
          </span>
        </span>
        <span className="plan-price">
          <span className="price">{money(cents)}</span>
          <span className="muted tiny">{note ?? buy.label.replace(/^Buy on /, '')} ↗</span>
        </span>
      </a>
    </li>
  )
}

function names(slots: Slot[]) {
  const shown = slots.slice(0, 4).map((s) => s.pokemon.name)
  const rest = slots.length - shown.length
  return rest > 0 ? `${shown.join(', ')} and ${rest} more` : shown.join(slots.length === 2 ? ' and ' : ', ')
}
