import { useMemo } from 'react'
import type { Card } from '../types'
import { useCollection } from '../lib/collection'
import { computeStats, pct, pctLabel, type Bucket } from '../lib/stats'
import { domainColor } from '../lib/cards'

interface Props {
  cards: Card[]
  onPickSet: (setCode: string) => void
}

export function SetsView({ cards, onPickSet }: Props) {
  const collection = useCollection()
  const stats = useMemo(() => computeStats(cards, collection), [cards, collection])

  return (
    <div style={{ paddingTop: 12 }}>
      <div className="card-panel">
        <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
          <strong>Every card</strong>
          <span className="mono muted">
            {stats.uniqueOwned} / {stats.uniqueTotal}
          </span>
        </div>
        <div className="bar">
          <div
            className="bar__fill"
            style={{ width: `${pct(stats.uniqueOwned, stats.uniqueTotal)}%` }}
          />
        </div>
      </div>

      <div className="section-title">Sets</div>
      <div style={{ display: 'grid', gap: 8 }}>
        {stats.sets.map((s) => (
          <button
            key={s.key}
            type="button"
            className="card-panel"
            style={{ textAlign: 'left', display: 'block', width: '100%' }}
            onClick={() => onPickSet(s.key)}
          >
            <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontWeight: 600 }}>{s.name}</span>
              <span className="mono muted" style={{ fontSize: 13 }}>
                {s.owned} / {s.total} · {pctLabel(s.owned, s.total)}
              </span>
            </div>
            <div className="bar">
              <div className="bar__fill" style={{ width: `${pct(s.owned, s.total)}%` }} />
            </div>
          </button>
        ))}
      </div>

      <div className="section-title">By domain</div>
      <BucketList buckets={stats.domains} colorFor={domainColor} />

      <div className="section-title">By rarity</div>
      <BucketList buckets={stats.rarities} />
    </div>
  )
}

function BucketList({
  buckets,
  colorFor,
}: {
  buckets: Bucket[]
  colorFor?: (key: string) => string
}) {
  return (
    <div className="card-panel" style={{ display: 'grid', gap: 12 }}>
      {buckets.map((b) => (
        <div key={b.key}>
          <div className="row" style={{ justifyContent: 'space-between', marginBottom: 5 }}>
            <span style={{ fontSize: 14, color: colorFor?.(b.key) }}>{b.key}</span>
            <span className="mono faint" style={{ fontSize: 12.5 }}>
              {b.owned} / {b.total}
            </span>
          </div>
          <div className="bar" style={{ height: 5 }}>
            <div
              className="bar__fill"
              style={{
                width: `${pct(b.owned, b.total)}%`,
                background: colorFor?.(b.key) ?? 'var(--accent)',
              }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}
