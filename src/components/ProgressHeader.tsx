import { usd, type Stats } from '../catalog'
import type { SyncStatus } from '../useCollection'

interface Props {
  stats: Stats
  status: SyncStatus
  localOnly: boolean
  onSearch: () => void
}

const statusText: Record<SyncStatus, string> = {
  loading: 'Loading…',
  synced: 'Synced',
  saving: 'Saving…',
  offline: 'Offline',
  error: 'Sync error',
}

export function ProgressHeader({ stats, status, localOnly, onSearch }: Props) {
  const pct = stats.slotsWithCard ? stats.collected / stats.slotsWithCard : 0
  const pctAll = stats.collected / stats.slotsTotal
  const complete = stats.ownedValue + stats.costToComplete

  return (
    <header className="header">
      <div className="header-top">
        <h1>Gen 1 Binder</h1>
        <span className={`sync sync-${localOnly ? 'local' : status}`} title={localOnly ? 'Saved on this device only' : statusText[status]}>
          {localOnly ? 'This device only' : statusText[status]}
        </span>
        <button className="icon-btn" onClick={onSearch} aria-label="Jump to a Pokémon">
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
            <circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" strokeWidth="2" />
            <path d="M15.5 15.5 21 21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      <div className="progress" aria-label={`${stats.collected} of ${stats.slotsWithCard} slots collected`}>
        <div className="progress-text">
          <span>
            <strong>{stats.collected}</strong>/{stats.slotsWithCard} slots · {Math.round(pct * 100)}%
          </span>
          <span className="muted">
            {Math.round(pctAll * 100)}% of all 151
          </span>
        </div>
        <div className="bar" role="progressbar" aria-valuemin={0} aria-valuemax={stats.slotsWithCard} aria-valuenow={stats.collected}>
          <div className="bar-fill" style={{ width: `${pct * 100}%` }} />
        </div>
      </div>

      <dl className="tiles">
        <div>
          <dt>Owned value</dt>
          <dd>{usd(stats.ownedValue)}</dd>
        </div>
        <div>
          <dt>To complete</dt>
          <dd>{usd(stats.costToComplete)}</dd>
        </div>
        <div>
          <dt>Full binder</dt>
          <dd>{usd(complete)}</dd>
        </div>
      </dl>
      {(stats.paidCount > 0 || stats.unbuyable > 0) && (
        <p className="header-note muted">
          {stats.paidCount > 0 && (
            <>
              Paid {usd(stats.paidTotal)} for {stats.paidCount} card{stats.paidCount === 1 ? '' : 's'}
            </>
          )}
          {stats.paidCount > 0 && stats.unbuyable > 0 && ' · '}
          {stats.unbuyable > 0 && `${stats.unbuyable} missing slot${stats.unbuyable === 1 ? ' has' : 's have'} no priced English card`}
        </p>
      )}
    </header>
  )
}
