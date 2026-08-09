import { memo } from 'react'
import type { Card } from '../types'
import { useEntry, collectionStore } from '../lib/collection'
import { shortNumber, domainColor } from '../lib/cards'

interface Props {
  card: Card
  /** 'details' opens the sheet; 'add' turns the whole tile into a +1 button. */
  tapMode: 'details' | 'add'
  onOpen: (card: Card) => void
}

export const CardTile = memo(function CardTile({ card, tapMode, onOpen }: Props) {
  const entry = useEntry(card.cardCode)
  const total = entry.n + entry.f

  const handle = () => {
    if (tapMode === 'add') {
      collectionStore.adjust(card.cardCode, 1)
      // A short buzz confirms the tap without the eyes leaving the next card.
      navigator.vibrate?.(8)
    } else {
      onOpen(card)
    }
  }

  return (
    <div className={`tile${total ? '' : ' tile--dim'}`}>
      <button
        type="button"
        className="tile__art"
        onClick={handle}
        aria-label={
          tapMode === 'add'
            ? `Add one ${card.name}, ${total} owned`
            : `${card.name}, ${total} owned. Open details`
        }
      >
        {card.imageUrl ? (
          <img src={card.imageUrl} alt="" loading="lazy" decoding="async" />
        ) : (
          <span className="tile__num" style={{ background: domainColor(card.domain) }}>
            {card.name}
          </span>
        )}
        {total > 0 && <span className="tile__count">{total}</span>}
        {entry.f > 0 && <span className="tile__foil">✦{entry.f}</span>}
        <span className="tile__num mono">{shortNumber(card)}</span>
      </button>

      {tapMode === 'add' && total > 0 && (
        <button
          type="button"
          className="btn"
          style={{ minHeight: 30, padding: '2px 0', fontSize: 13 }}
          onClick={() => collectionStore.adjust(card.cardCode, entry.n > 0 ? -1 : 0, entry.n > 0 ? 0 : -1)}
          aria-label={`Remove one ${card.name}`}
        >
          −1
        </button>
      )}
      {tapMode !== 'add' && <span className="tile__name">{card.name}</span>}
    </div>
  )
})
