import { memo } from 'react'
import type { Card } from '../types'
import { useEntry, collectionStore } from '../lib/collection'
import { shortNumber, domainColor } from '../lib/cards'
import { Stepper } from './Stepper'

interface Props {
  card: Card
  onOpen: (card: Card) => void
}

export const CardRow = memo(function CardRow({ card, onOpen }: Props) {
  const entry = useEntry(card.cardCode)
  const total = entry.n + entry.f

  return (
    <div className={`rowitem${total ? ' rowitem--owned' : ''}`}>
      <button
        type="button"
        className="row grow"
        style={{ textAlign: 'left', minWidth: 0 }}
        onClick={() => onOpen(card)}
      >
        {card.imageUrl && (
          <img className="rowitem__thumb" src={card.imageUrl} alt="" loading="lazy" decoding="async" />
        )}
        <span className="rowitem__main">
          <span className="rowitem__name">{card.name}</span>
          <span className="rowitem__meta">
            <span className="mono">{shortNumber(card)}</span>
            {' · '}
            <span style={{ color: domainColor(card.domain) }}>{card.domain}</span>
            {' · '}
            {card.cardType}
            {' · '}
            {card.rarity}
          </span>
        </span>
      </button>
      <Stepper
        value={entry.n}
        label={`copies of ${card.name}`}
        onChange={(n) => collectionStore.set(card.cardCode, { n, f: entry.f })}
      />
    </div>
  )
})
