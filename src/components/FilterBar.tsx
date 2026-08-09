import { useState } from 'react'
import type { Filters, Ownership, SortKey } from '../types'
import { type Facets, domainColor } from '../lib/cards'

interface Props {
  filters: Filters
  facets: Facets
  onChange: (patch: Partial<Filters>) => void
  /** The Collection view pins ownership to "owned", so it hides that row. */
  showOwnership?: boolean
}

const OWNERSHIP: { key: Ownership; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'owned', label: 'Owned' },
  { key: 'missing', label: 'Missing' },
  { key: 'foil', label: 'Foil' },
]

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'number', label: 'Set order' },
  { key: 'name', label: 'Name' },
  { key: 'rarity', label: 'Rarity' },
  { key: 'owned', label: 'Most owned' },
  { key: 'energy', label: 'Energy' },
]

export function FilterBar({ filters, facets, onChange, showOwnership = true }: Props) {
  const [open, setOpen] = useState(false)
  const extras =
    (filters.domain ? 1 : 0) + (filters.type ? 1 : 0) + (filters.rarity ? 1 : 0) + (filters.sort !== 'number' ? 1 : 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 10 }}>
      <div className="search">
        <input
          className="field"
          type="search"
          inputMode="search"
          placeholder="Name, number, ability, tag…"
          value={filters.q}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="none"
          spellCheck={false}
          onChange={(e) => onChange({ q: e.target.value })}
        />
        {filters.q && (
          <button
            type="button"
            className="search__clear"
            aria-label="Clear search"
            onClick={() => onChange({ q: '' })}
          >
            ✕
          </button>
        )}
      </div>

      {showOwnership && (
        <div className="chips">
          {OWNERSHIP.map((o) => (
            <button
              key={o.key}
              type="button"
              className="chip"
              aria-pressed={filters.ownership === o.key}
              onClick={() => onChange({ ownership: o.key })}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}

      <div className="chips">
        <button
          type="button"
          className="chip"
          aria-pressed={!filters.set}
          onClick={() => onChange({ set: '' })}
        >
          All sets
        </button>
        {facets.sets.map((s) => (
          <button
            key={s.code}
            type="button"
            className="chip"
            aria-pressed={filters.set === s.code}
            onClick={() => onChange({ set: filters.set === s.code ? '' : s.code })}
          >
            {s.name}
          </button>
        ))}
      </div>

      <div className="row">
        <button
          type="button"
          className="chip"
          aria-pressed={open || extras > 0}
          onClick={() => setOpen((v) => !v)}
          style={{ height: 36 }}
        >
          Filters{extras ? ` · ${extras}` : ''} {open ? '▴' : '▾'}
        </button>
        {extras > 0 && (
          <button
            type="button"
            className="chip"
            style={{ height: 36 }}
            onClick={() => onChange({ domain: '', type: '', rarity: '', sort: 'number' })}
          >
            Reset
          </button>
        )}
      </div>

      {open && (
        <div style={{ display: 'grid', gap: 8 }}>
          <div className="chips">
            <button
              type="button"
              className="chip"
              aria-pressed={!filters.domain}
              onClick={() => onChange({ domain: '' })}
            >
              Any domain
            </button>
            {facets.domains.map((d) => (
              <button
                key={d}
                type="button"
                className="chip"
                aria-pressed={filters.domain === d}
                onClick={() => onChange({ domain: filters.domain === d ? '' : d })}
              >
                <span className="chip__dot" style={{ background: domainColor(d) }} />
                {d}
              </button>
            ))}
          </div>
          <div className="row" style={{ gap: 8 }}>
            <select
              className="field grow"
              value={filters.type}
              onChange={(e) => onChange({ type: e.target.value })}
              aria-label="Card type"
            >
              <option value="">All types</option>
              {facets.types.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <select
              className="field grow"
              value={filters.rarity}
              onChange={(e) => onChange({ rarity: e.target.value })}
              aria-label="Rarity"
            >
              <option value="">All rarities</option>
              {facets.rarities.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
          <select
            className="field"
            value={filters.sort}
            onChange={(e) => onChange({ sort: e.target.value as SortKey })}
            aria-label="Sort order"
          >
            {SORTS.map((s) => (
              <option key={s.key} value={s.key}>
                Sort: {s.label}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  )
}
