import { useEffect } from 'react'
import type { Card } from '../types'
import { collectionStore, useEntry } from '../lib/collection'
import { domainColor, shortNumber } from '../lib/cards'
import { Stepper } from './Stepper'
import { RulesText } from './RulesText'

interface Props {
  card: Card
  onClose: () => void
}

export function CardSheet({ card, onClose }: Props) {
  const entry = useEntry(card.cardCode)

  // The sheet scrolls itself; the page behind it must not.
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  const setSize = card.cardNumber.split('-')[1] ?? ''
  const stats = [
    card.energy != null && { label: 'Energy', value: card.energy },
    card.might != null && { label: 'Might', value: card.might },
    card.power != null && { label: 'Power', value: card.power },
  ].filter(Boolean) as { label: string; value: number }[]

  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} />
      <div className="sheet" role="dialog" aria-modal="true" aria-label={card.name}>
        <div className="sheet__grab" />

        <div className="row" style={{ alignItems: 'flex-start', gap: 14 }}>
          {card.imageUrl && (
            <img
              src={card.imageUrl}
              alt={card.name}
              style={{ width: 132, borderRadius: 10, flex: 'none', background: 'var(--bg-raised)' }}
            />
          )}
          <div className="grow">
            <h2 style={{ margin: '2px 0 4px', fontSize: 19, letterSpacing: '-0.01em' }}>
              {card.name}
            </h2>
            <p className="muted" style={{ margin: '0 0 10px', fontSize: 13 }}>
              {card.cardSet} · <span className="mono">{shortNumber(card)}</span>
              {/* Tokens and runes print no "of N" denominator. */}
              {setSize && <span className="mono"> / {setSize}</span>}
            </p>
            <div className="row row--wrap" style={{ gap: 6 }}>
              <span className="tag" style={{ color: domainColor(card.domain), borderColor: domainColor(card.domain) }}>
                {card.domain}
              </span>
              <span className="tag">{card.cardType}</span>
              <span className="tag">{card.rarity}</span>
            </div>
            {stats.length > 0 && (
              <div className="row row--wrap" style={{ gap: 6, marginTop: 6 }}>
                {stats.map((s) => (
                  <span key={s.label} className="tag">
                    {s.label} {s.value}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="card-panel" style={{ marginTop: 14 }}>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <div>
              <div className="stat__label">Copies</div>
              <div className="faint" style={{ fontSize: 12 }}>
                Regular
              </div>
            </div>
            <Stepper
              size="lg"
              value={entry.n}
              label="copies"
              onChange={(n) => collectionStore.set(card.cardCode, { n, f: entry.f })}
            />
          </div>
          <div className="row" style={{ justifyContent: 'space-between', marginTop: 12 }}>
            <div>
              <div className="stat__label">Foil</div>
              <div className="faint" style={{ fontSize: 12 }}>
                Tracked separately
              </div>
            </div>
            <Stepper
              value={entry.f}
              label="foil copies"
              onChange={(f) => collectionStore.set(card.cardCode, { n: entry.n, f })}
            />
          </div>
        </div>

        {card.abilityEffective && (
          <div className="card-panel" style={{ marginTop: 12, fontSize: 14.5 }}>
            <RulesText text={card.abilityEffective} />
          </div>
        )}

        {(card.tags?.length || card.artist) && (
          <div style={{ marginTop: 12 }}>
            <div className="row row--wrap" style={{ gap: 6 }}>
              {card.tags?.map((t) => (
                <span key={t} className="tag">
                  {t}
                </span>
              ))}
            </div>
            {card.artist && (
              <p className="faint" style={{ fontSize: 12, marginTop: 10 }}>
                Art by {card.artist} · <span className="mono">{card.cardCode}</span>
              </p>
            )}
          </div>
        )}

        <button type="button" className="btn btn--block" style={{ marginTop: 16 }} onClick={onClose}>
          Close
        </button>
      </div>
    </>
  )
}
