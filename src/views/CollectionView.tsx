import { useMemo } from 'react'
import type { Card, Filters } from '../types'
import { type Facets, selectCards } from '../lib/cards'
import { useCollection } from '../lib/collection'
import { computeStats, pctLabel } from '../lib/stats'
import { FilterBar } from '../components/FilterBar'
import { CardList } from '../components/CardList'

interface Props {
  cards: Card[]
  index: Map<string, string>
  facets: Facets
  filters: Filters
  onFilters: (patch: Partial<Filters>) => void
  layout: 'grid' | 'rows'
  onLayout: (l: 'grid' | 'rows') => void
  onOpen: (card: Card) => void
  onGoAdd: () => void
}

export function CollectionView({
  cards,
  index,
  facets,
  filters,
  onFilters,
  layout,
  onLayout,
  onOpen,
  onGoAdd,
}: Props) {
  const collection = useCollection()
  const stats = useMemo(() => computeStats(cards, collection), [cards, collection])
  const results = useMemo(
    () => selectCards(cards, index, collection, { ...filters, ownership: 'owned' }),
    [cards, index, collection, filters],
  )

  if (stats.uniqueOwned === 0) {
    return (
      <div className="empty">
        <p style={{ fontSize: 16, marginBottom: 18 }}>Nothing in the collection yet.</p>
        <button type="button" className="btn btn--primary" onClick={onGoAdd}>
          Start adding cards
        </button>
      </div>
    )
  }

  return (
    <>
      <div className="statgrid" style={{ marginTop: 12 }}>
        <div className="stat">
          <div className="stat__value">{stats.copies.toLocaleString()}</div>
          <div className="stat__label">Copies</div>
        </div>
        <div className="stat">
          <div className="stat__value">{stats.uniqueOwned.toLocaleString()}</div>
          <div className="stat__label">Unique</div>
        </div>
        <div className="stat">
          <div className="stat__value">{pctLabel(stats.uniqueOwned, stats.uniqueTotal)}</div>
          <div className="stat__label">Complete</div>
        </div>
        <div className="stat">
          <div className="stat__value">{stats.foils.toLocaleString()}</div>
          <div className="stat__label">Foils</div>
        </div>
      </div>

      <FilterBar filters={filters} facets={facets} onChange={onFilters} showOwnership={false} />

      <div className="row" style={{ marginTop: 10, justifyContent: 'space-between' }}>
        <span className="faint" style={{ fontSize: 13 }}>
          {results.length.toLocaleString()} shown
        </span>
        <button
          type="button"
          className="chip"
          onClick={() => onLayout(layout === 'grid' ? 'rows' : 'grid')}
          aria-label={`Switch to ${layout === 'grid' ? 'list' : 'grid'} view`}
        >
          {layout === 'grid' ? '▦' : '☰'}
        </button>
      </div>

      <CardList
        cards={results}
        layout={layout}
        tapMode="details"
        onOpen={onOpen}
        emptyMessage="Nothing owned matches those filters."
      />
    </>
  )
}
