import { useEffect, useRef, useState } from 'react'
import type { Card } from '../types'
import { CardTile } from './CardTile'
import { CardRow } from './CardRow'

const PAGE = 120

interface Props {
  cards: Card[]
  layout: 'grid' | 'rows'
  tapMode: 'details' | 'add'
  onOpen: (card: Card) => void
  emptyMessage?: string
}

/**
 * Reveals a page at a time as the sentinel scrolls into view. 1180 tiles at
 * once is survivable on desktop but janky on a phone, and the whole point of
 * this app is that it feels instant on the phone.
 */
export function CardList({ cards, layout, tapMode, onOpen, emptyMessage }: Props) {
  const [limit, setLimit] = useState(PAGE)
  const sentinel = useRef<HTMLDivElement>(null)

  // Any change of filter or sort starts the list over from the top.
  useEffect(() => setLimit(PAGE), [cards])

  useEffect(() => {
    const node = sentinel.current
    if (!node || limit >= cards.length) return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setLimit((l) => l + PAGE)
      },
      { rootMargin: '600px 0px' },
    )
    io.observe(node)
    return () => io.disconnect()
  }, [limit, cards.length])

  if (!cards.length) {
    return <p className="empty">{emptyMessage ?? 'No cards match those filters.'}</p>
  }

  const visible = cards.slice(0, limit)

  return (
    <>
      {layout === 'grid' ? (
        <div className="grid">
          {visible.map((card) => (
            <CardTile key={card.cardCode} card={card} tapMode={tapMode} onOpen={onOpen} />
          ))}
        </div>
      ) : (
        <div className="rows">
          {visible.map((card) => (
            <CardRow key={card.cardCode} card={card} onOpen={onOpen} />
          ))}
        </div>
      )}
      {limit < cards.length && (
        <div ref={sentinel} style={{ padding: '18px 0', textAlign: 'center' }} className="faint">
          Loading {cards.length - limit} more…
        </div>
      )}
    </>
  )
}
