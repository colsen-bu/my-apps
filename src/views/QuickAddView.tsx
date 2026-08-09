import { useEffect, useMemo, useState } from 'react'
import type { Card } from '../types'
import { type Facets, shortNumber, domainColor } from '../lib/cards'
import { digitWidth, indexSet } from '../lib/printed'
import { collectionStore, useEntry } from '../lib/collection'

interface Props {
  cards: Card[]
  facets: Facets
  setCode: string
  onSetCode: (code: string) => void
  onToast: (message: string) => void
}

interface Recent {
  key: number
  card: Card
  foil: boolean
}

const PREFIX_LABEL: Record<string, string> = {
  '': 'Cards',
  T: 'Tokens',
  R: 'Runes',
  SP: 'Special',
}

/**
 * Sit with a physical stack, read the number off each card, punch it in. Once
 * the number is complete the card is already in the collection — no scrolling,
 * no searching, eyes never leave the pile.
 */
export function QuickAddView({ cards, facets, setCode, onSetCode, onToast }: Props) {
  const [digits, setDigits] = useState('')
  const [prefix, setPrefix] = useState('')
  const [foil, setFoil] = useState(false)
  const [auto, setAuto] = useState(true)
  const [recent, setRecent] = useState<Recent[]>([])

  const index = useMemo(() => indexSet(cards, setCode), [cards, setCode])
  const max = index.maxByPrefix.get(prefix)
  const width = digitWidth(max)

  // Switching sets can strand you on a letter run the new set doesn't print.
  useEffect(() => {
    if (!index.prefixes.includes(prefix)) setPrefix(index.prefixes[0] ?? '')
  }, [index, prefix])

  const candidates = digits ? (index.groups.get(`${prefix}${Number(digits)}`) ?? []) : []
  const only = candidates.length === 1 ? candidates[0] : undefined

  const add = (card: Card) => {
    collectionStore.adjust(card.cardCode, foil ? 0 : 1, foil ? 1 : 0)
    navigator.vibrate?.(10)
    setRecent((r) => [{ key: Date.now() + Math.random(), card, foil }, ...r].slice(0, 12))
    setDigits('')
  }

  const submit = () => {
    if (only) return add(only)
    if (candidates.length > 1) return onToast('Pick which printing below')
    onToast(`No ${prefix}${digits} in this set`)
    navigator.vibrate?.([12, 40, 12])
    setDigits('')
  }

  // A full-width number identifies one printing in almost every case, so the
  // "Add" press is ceremony. Anything ambiguous waits for you to choose.
  useEffect(() => {
    if (!auto || digits.length < width || !only) return
    const t = setTimeout(() => add(only), 130)
    return () => clearTimeout(t)
    // `add` is deliberately not a dependency: it closes over the same state
    // this effect already watches, and including it would re-arm the timer.
  }, [digits, auto, width, only, foil])

  const press = (key: string) => {
    if (key === 'del') return setDigits((d) => d.slice(0, -1))
    if (key === 'go') return submit()
    setDigits((d) => (d.length >= width ? key : d + key))
  }

  const undo = (item: Recent) => {
    collectionStore.adjust(item.card.cardCode, item.foil ? 0 : -1, item.foil ? -1 : 0)
    setRecent((r) => r.filter((x) => x.key !== item.key))
  }

  const setName = facets.sets.find((s) => s.code === setCode)?.name ?? setCode

  return (
    <div style={{ paddingTop: 12 }}>
      <div className="chips">
        {facets.sets.map((s) => (
          <button
            key={s.code}
            type="button"
            className="chip"
            aria-pressed={setCode === s.code}
            onClick={() => {
              onSetCode(s.code)
              setDigits('')
            }}
          >
            {s.name}
          </button>
        ))}
      </div>

      {index.prefixes.length > 1 && (
        <div className="chips" style={{ marginTop: 8 }}>
          {index.prefixes.map((p) => (
            <button
              key={p || 'main'}
              type="button"
              className="chip"
              aria-pressed={prefix === p}
              onClick={() => {
                setPrefix(p)
                setDigits('')
              }}
            >
              {PREFIX_LABEL[p] ?? `${p}-numbers`}
            </button>
          ))}
        </div>
      )}

      <div className="quickadd__display mono" style={{ marginTop: 10 }} aria-live="polite">
        {prefix && <span style={{ color: 'var(--text-faint)' }}>{prefix}</span>}
        {digits || <span style={{ color: 'var(--text-faint)', fontSize: 20 }}>tap a number</span>}
      </div>

      <div className="quickadd__preview">
        {only ? (
          <Preview card={only} />
        ) : candidates.length > 1 ? (
          <div className="grow">
            <p className="faint" style={{ margin: '0 0 8px', fontSize: 13 }}>
              {candidates.length} printings of {prefix}
              {digits} — pick one:
            </p>
            <div style={{ display: 'grid', gap: 6 }}>
              {candidates.map((c) => (
                <button
                  key={c.cardCode}
                  type="button"
                  className="btn"
                  style={{ justifyContent: 'flex-start', gap: 10 }}
                  onClick={() => add(c)}
                >
                  <span className="mono">{shortNumber(c)}</span>
                  <span className="grow" style={{ textAlign: 'left' }}>
                    {c.name}
                  </span>
                  <span className="tag">{c.rarity}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <p className="faint" style={{ margin: 0, fontSize: 14 }}>
            {digits
              ? `Nothing numbered ${prefix}${digits} in ${setName}.`
              : `${setName} — ${prefix || 'cards'} 1 to ${max ?? '…'}.`}
          </p>
        )}
      </div>

      <div className="row" style={{ gap: 8, marginTop: 4 }}>
        <button
          type="button"
          className="chip grow"
          style={{ justifyContent: 'center', height: 38 }}
          aria-pressed={foil}
          onClick={() => setFoil((v) => !v)}
        >
          {foil ? '✦ Adding foils' : 'Adding regular'}
        </button>
        <button
          type="button"
          className="chip grow"
          style={{ justifyContent: 'center', height: 38 }}
          aria-pressed={auto}
          onClick={() => setAuto((v) => !v)}
        >
          {auto ? `Auto-add at ${width} digits` : 'Manual add'}
        </button>
      </div>

      <div className="keypad">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((k) => (
          <button key={k} type="button" className="mono" onClick={() => press(k)}>
            {k}
          </button>
        ))}
        <button type="button" onClick={() => press('del')} aria-label="Delete last digit">
          ⌫
        </button>
        <button type="button" className="mono" onClick={() => press('0')}>
          0
        </button>
        <button type="button" className="keypad--go" onClick={() => press('go')} disabled={!digits}>
          Add
        </button>
      </div>

      {recent.length > 0 && (
        <>
          <div className="row" style={{ justifyContent: 'space-between', marginTop: 22 }}>
            <span className="section-title" style={{ margin: 0 }}>
              Just added · {recent.length}
            </span>
            <button
              type="button"
              className="chip"
              style={{ height: 30 }}
              onClick={() => setRecent([])}
            >
              Clear list
            </button>
          </div>
          <div className="rows" style={{ marginTop: 8 }}>
            {recent.map((item) => (
              <div key={item.key} className="rowitem rowitem--owned">
                {item.card.imageUrl && (
                  <img className="rowitem__thumb" src={item.card.imageUrl} alt="" loading="lazy" />
                )}
                <div className="rowitem__main">
                  <div className="rowitem__name">{item.card.name}</div>
                  <div className="rowitem__meta">
                    <span className="mono">{shortNumber(item.card)}</span>
                    {item.foil ? ' · ✦ foil' : ''}
                  </div>
                </div>
                <button type="button" className="btn" onClick={() => undo(item)}>
                  Undo
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function Preview({ card }: { card: Card }) {
  const entry = useEntry(card.cardCode)
  const total = entry.n + entry.f
  return (
    <>
      {card.imageUrl && <img src={card.imageUrl} alt="" />}
      <div className="grow" style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 16 }}>{card.name}</div>
        <div className="faint" style={{ fontSize: 12.5 }}>
          <span style={{ color: domainColor(card.domain) }}>{card.domain}</span> · {card.cardType} ·{' '}
          {card.rarity}
        </div>
        <div
          style={{ fontSize: 12.5, marginTop: 3, color: total ? 'var(--good)' : 'var(--text-faint)' }}
        >
          {total
            ? `${total} in collection${entry.f ? ` (${entry.f} foil)` : ''}`
            : 'Not in collection yet'}
        </div>
      </div>
    </>
  )
}
