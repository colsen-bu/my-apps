import type { Card } from '../types'
import { shortNumber } from './cards'

/**
 * The number printed on the card is not unique as a plain integer. Origins
 * prints both `007` and the Showcase `007a`; tokens and runes restart their own
 * runs as `T03`, `R01`, `SP1`. Quick Add has to key off the printed string,
 * or a Showcase variant quietly shadows the card it varies.
 */
export interface Printed {
  /** Letter run the number belongs to: '' for the main set, 'T', 'R', 'SP'… */
  prefix: string
  /** Numeric part, or null if the number is unparseable. */
  num: number | null
  /** Variant letter after the digits, e.g. the 'a' of 007a. */
  suffix: string
  /** Exactly what is printed, e.g. '007a'. */
  text: string
}

const SHAPE = /^([A-Z]*)(\d+)([A-Z]*)$/i

export function parsePrinted(card: Card): Printed {
  const text = shortNumber(card)
  const m = SHAPE.exec(text)
  if (!m) return { prefix: '', num: null, suffix: '', text }
  return {
    prefix: m[1].toUpperCase(),
    num: Number(m[2]),
    suffix: m[3].toLowerCase(),
    text,
  }
}

export interface NumberIndex {
  /** `${prefix}${num}` -> every printing that carries that number. */
  groups: Map<string, Card[]>
  /** Letter runs present in the set, main run ('') first. */
  prefixes: string[]
  /** Highest number seen per prefix, which sets the keypad's digit width. */
  maxByPrefix: Map<string, number>
}

export function indexSet(cards: Card[], setCode: string): NumberIndex {
  const groups = new Map<string, Card[]>()
  const maxByPrefix = new Map<string, number>()

  for (const card of cards) {
    if (card.setCode !== setCode) continue
    const p = parsePrinted(card)
    if (p.num === null) continue
    const key = `${p.prefix}${p.num}`
    const bucket = groups.get(key)
    if (bucket) bucket.push(card)
    else groups.set(key, [card])
    maxByPrefix.set(p.prefix, Math.max(maxByPrefix.get(p.prefix) ?? 0, p.num))
  }

  // Plain-number printings come first, then letter runs alphabetically.
  for (const bucket of groups.values()) {
    bucket.sort((a, b) => parsePrinted(a).suffix.localeCompare(parsePrinted(b).suffix))
  }

  const prefixes = [...maxByPrefix.keys()].sort((a, b) =>
    a === '' ? -1 : b === '' ? 1 : a.localeCompare(b),
  )

  return { groups, prefixes, maxByPrefix }
}

export function digitWidth(max: number | undefined): number {
  return String(max ?? 999).length
}
