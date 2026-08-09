import { useMemo } from 'react'
import type { Card, Filters } from '../types'
import { type Facets, selectCards } from '../lib/cards'
import { useCollection } from '../lib/collection'
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
  tapMode: 'details' | 'add'
  onTapMode: (m: 'details' | 'add') => void
  onOpen: (card: Card) => void
}

export function BrowseView({
  cards,
  index,
  facets,
  filters,
  onFilters,
  layout,
  onLayout,
  tapMode,
  onTapMode,
  onOpen,
}: Props) {
  const collection = useCollection()
  // Filtering 1200 cards is sub-millisecond, so re-running it whenever the
  // collection changes costs nothing and keeps the ownership filters honest.
  const results = useMemo(
    () => selectCards(cards, index, collection, filters),
    [cards, index, collection, filters],
  )

  return (
    <>
      <FilterBar filters={filters} facets={facets} onChange={onFilters} />

      <div className="row" style={{ marginTop: 10, justifyContent: 'space-between' }}>
        <span className="faint" style={{ fontSize: 13 }}>
          {results.length.toLocaleString()} card{results.length === 1 ? '' : 's'}
        </span>
        <div className="row" style={{ gap: 6 }}>
          <button
            type="button"
            className="chip"
            aria-pressed={tapMode === 'add'}
            onClick={() => onTapMode(tapMode === 'add' ? 'details' : 'add')}
          >
            {tapMode === 'add' ? 'Tap: +1' : 'Tap: info'}
          </button>
          <button
            type="button"
            className="chip"
            onClick={() => onLayout(layout === 'grid' ? 'rows' : 'grid')}
            aria-label={`Switch to ${layout === 'grid' ? 'list' : 'grid'} view`}
          >
            {layout === 'grid' ? '▦' : '☰'}
          </button>
        </div>
      </div>

      <CardList cards={results} layout={layout} tapMode={tapMode} onOpen={onOpen} />
    </>
  )
}
