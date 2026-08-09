import type { Card, Collection, Filters } from '../types'

/** Rarity ordering for sorting and for the sequence the filter chips appear in. */
export const RARITY_ORDER = ['Common', 'Uncommon', 'Rare', 'Epic', 'Showcase', 'Overnumbered']

/** Riot's six domains plus the colourless bucket, in the game's own wheel order. */
export const DOMAIN_COLORS: Record<string, string> = {
  Fury: '#e2503f',
  Calm: '#3fa9c9',
  Mind: '#8f6fd6',
  Body: '#d1893f',
  Order: '#d8c76a',
  Chaos: '#c14f9a',
  Colorless: '#8b93a3',
}

export function domainColor(domain: string): string {
  return DOMAIN_COLORS[domain] ?? DOMAIN_COLORS.Colorless
}

/**
 * Cards load as a static asset rather than a bundled import: 650KB of JSON
 * inside the JS bundle would have to be parsed as source on every cold start.
 */
export async function loadCards(): Promise<Card[]> {
  const res = await fetch(`${import.meta.env.BASE_URL}cards.json`, { cache: 'no-cache' })
  if (!res.ok) throw new Error(`Could not load cards.json (HTTP ${res.status})`)
  const cards = (await res.json()) as Card[]
  if (!Array.isArray(cards) || !cards.length) throw new Error('cards.json held no cards')
  return cards
}

/** "001-298" -> "001". The denominator is the set size, identical on every card. */
export function shortNumber(card: Card): string {
  const head = card.cardNumber.split('-')[0]
  return head || String(card.collectorNumber)
}

/** The distinct values actually present in the data, so filters never offer a dead end. */
export interface Facets {
  sets: { code: string; name: string; count: number }[]
  domains: string[]
  types: string[]
  rarities: string[]
}

export function buildFacets(cards: Card[]): Facets {
  const sets = new Map<string, { code: string; name: string; count: number }>()
  const domains = new Set<string>()
  const types = new Set<string>()
  const rarities = new Set<string>()

  for (const c of cards) {
    const set = sets.get(c.setCode)
    if (set) set.count++
    else sets.set(c.setCode, { code: c.setCode, name: c.cardSet || c.setCode, count: 1 })
    if (c.domain) domains.add(c.domain)
    if (c.cardType) types.add(c.cardType)
    if (c.rarity) rarities.add(c.rarity)
  }

  const byRarity = (a: string, b: string) => {
    const ia = RARITY_ORDER.indexOf(a)
    const ib = RARITY_ORDER.indexOf(b)
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b)
  }

  return {
    sets: [...sets.values()].sort((a, b) => b.count - a.count),
    domains: [...domains].sort(),
    types: [...types].sort(),
    rarities: [...rarities].sort(byRarity),
  }
}

/** Lowercased haystack per card, built once, so typing in search stays cheap. */
export function buildSearchIndex(cards: Card[]): Map<string, string> {
  const index = new Map<string, string>()
  for (const c of cards) {
    index.set(
      c.cardCode,
      [c.name, c.cardType, c.domain, c.rarity, c.cardSet, c.artist, c.abilityEffective, (c.tags ?? []).join(' '), c.cardNumber]
        .join(' ')
        .toLowerCase(),
    )
  }
  return index
}

function total(entry: { n: number; f: number } | undefined): number {
  return entry ? entry.n + entry.f : 0
}

export function selectCards(
  cards: Card[],
  index: Map<string, string>,
  collection: Collection,
  f: Filters,
): Card[] {
  // Bare digits are almost always a collector number, so "7" should surface
  // card 007 rather than every card whose rules text mentions a 7.
  const q = f.q.trim().toLowerCase()
  const numeric = /^\d{1,3}$/.test(q) ? String(Number(q)) : null

  const out = cards.filter((c) => {
    if (f.set && c.setCode !== f.set) return false
    if (f.domain && c.domain !== f.domain) return false
    if (f.type && c.cardType !== f.type) return false
    if (f.rarity && c.rarity !== f.rarity) return false

    const entry = collection[c.cardCode]
    if (f.ownership === 'owned' && total(entry) <= 0) return false
    if (f.ownership === 'missing' && total(entry) > 0) return false
    if (f.ownership === 'foil' && !(entry && entry.f > 0)) return false

    if (!q) return true
    if (numeric && String(c.collectorNumber) === numeric) return true
    return (index.get(c.cardCode) ?? '').includes(q)
  })

  const rarityRank = (r: string) => {
    const i = RARITY_ORDER.indexOf(r)
    return i < 0 ? 99 : i
  }
  const bySetThenNumber = (a: Card, b: Card) =>
    a.setCode.localeCompare(b.setCode) || a.collectorNumber - b.collectorNumber

  switch (f.sort) {
    case 'name':
      out.sort((a, b) => a.name.localeCompare(b.name) || bySetThenNumber(a, b))
      break
    case 'rarity':
      out.sort((a, b) => rarityRank(b.rarity) - rarityRank(a.rarity) || bySetThenNumber(a, b))
      break
    case 'owned':
      out.sort(
        (a, b) =>
          total(collection[b.cardCode]) - total(collection[a.cardCode]) || bySetThenNumber(a, b),
      )
      break
    case 'energy':
      out.sort((a, b) => (a.energy ?? 99) - (b.energy ?? 99) || bySetThenNumber(a, b))
      break
    default:
      out.sort(bySetThenNumber)
  }
  return out
}
