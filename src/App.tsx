import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from 'react'
import type { Card, Filters } from './types'
import { buildFacets, buildSearchIndex, loadCards } from './lib/cards'
import { BrowseView } from './views/BrowseView'
import { QuickAddView } from './views/QuickAddView'
import { CollectionView } from './views/CollectionView'
import { SetsView } from './views/SetsView'
import { DataView } from './views/DataView'
import { CardSheet } from './components/CardSheet'
import { IconBox, IconCards, IconChart, IconPlus, IconShare } from './components/Icons'

type Tab = 'cards' | 'add' | 'mine' | 'sets' | 'data'

const TABS: { key: Tab; label: string; icon: ComponentType }[] = [
  { key: 'cards', label: 'Cards', icon: IconCards },
  { key: 'add', label: 'Quick add', icon: IconPlus },
  { key: 'mine', label: 'Collection', icon: IconBox },
  { key: 'sets', label: 'Progress', icon: IconChart },
  { key: 'data', label: 'Data', icon: IconShare },
]

const BLANK: Filters = {
  q: '',
  set: '',
  domain: '',
  type: '',
  rarity: '',
  ownership: 'all',
  sort: 'number',
}

function tabFromHash(): Tab {
  const key = window.location.hash.replace('#', '') as Tab
  return TABS.some((t) => t.key === key) ? key : 'cards'
}

export default function App() {
  const [cards, setCards] = useState<Card[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>(tabFromHash)
  const [sheet, setSheet] = useState<Card | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const toastTimer = useRef<number>(0)

  const [browseFilters, setBrowseFilters] = useState<Filters>(BLANK)
  const [mineFilters, setMineFilters] = useState<Filters>({ ...BLANK, ownership: 'owned' })
  const [layout, setLayout] = useState<'grid' | 'rows'>('grid')
  const [tapMode, setTapMode] = useState<'details' | 'add'>('details')
  const [addSet, setAddSet] = useState('')

  useEffect(() => {
    loadCards()
      .then((loaded) => {
        setCards(loaded)
        setAddSet((cur) => cur || loaded[0]?.setCode || '')
      })
      .catch((e: Error) => setError(e.message))
  }, [])

  // Back-button support: each tab is a hash, so swiping back leaves the app
  // only once you are past the first tab you opened. A card sheet belongs to
  // the view that opened it, so leaving that view closes it.
  useEffect(() => {
    const onHash = () => {
      setTab(tabFromHash())
      setSheet(null)
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const go = (next: Tab) => {
    window.location.hash = next
    setTab(next)
    window.scrollTo({ top: 0 })
  }

  const say = useCallback((message: string) => {
    setToast(message)
    window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(null), 2200)
  }, [])

  const facets = useMemo(() => (cards ? buildFacets(cards) : null), [cards])
  const index = useMemo(() => (cards ? buildSearchIndex(cards) : null), [cards])

  if (error) {
    return (
      <div className="empty" style={{ paddingTop: 'calc(var(--safe-top) + 80px)' }}>
        <p style={{ color: 'var(--danger)', fontWeight: 600 }}>Couldn't load the card data.</p>
        <p style={{ fontSize: 14 }}>{error}</p>
        <button type="button" className="btn" onClick={() => window.location.reload()}>
          Try again
        </button>
      </div>
    )
  }

  if (!cards || !facets || !index) {
    return (
      <div className="empty" style={{ paddingTop: 'calc(var(--safe-top) + 100px)' }}>
        <div className="spinner" style={{ margin: '0 auto 14px' }} />
        Loading cards…
      </div>
    )
  }

  const current = TABS.find((t) => t.key === tab)!

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar__row">
          <h1>{current.label}</h1>
          <span className="topbar__sub mono">{cards.length.toLocaleString()} cards</span>
        </div>
      </header>

      <main className="app__main">
        {tab === 'cards' && (
          <BrowseView
            cards={cards}
            index={index}
            facets={facets}
            filters={browseFilters}
            onFilters={(patch) => setBrowseFilters((f) => ({ ...f, ...patch }))}
            layout={layout}
            onLayout={setLayout}
            tapMode={tapMode}
            onTapMode={setTapMode}
            onOpen={setSheet}
          />
        )}

        {tab === 'add' && (
          <QuickAddView
            cards={cards}
            facets={facets}
            setCode={addSet || facets.sets[0]?.code || ''}
            onSetCode={setAddSet}
            onToast={say}
          />
        )}

        {tab === 'mine' && (
          <CollectionView
            cards={cards}
            index={index}
            facets={facets}
            filters={mineFilters}
            onFilters={(patch) => setMineFilters((f) => ({ ...f, ...patch }))}
            layout={layout}
            onLayout={setLayout}
            onOpen={setSheet}
            onGoAdd={() => go('add')}
          />
        )}

        {tab === 'sets' && (
          <SetsView
            cards={cards}
            onPickSet={(setCode) => {
              setBrowseFilters((f) => ({ ...f, set: setCode }))
              go('cards')
            }}
          />
        )}

        {tab === 'data' && <DataView cards={cards} onToast={say} />}
      </main>

      <nav className="tabbar" aria-label="Sections">
        {TABS.map((t) => {
          const Icon = t.icon
          return (
            <button
              key={t.key}
              type="button"
              aria-current={tab === t.key ? 'page' : undefined}
              onClick={() => go(t.key)}
            >
              <Icon />
              {t.label}
            </button>
          )
        })}
      </nav>

      {sheet && <CardSheet card={sheet} onClose={() => setSheet(null)} />}
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  )
}
