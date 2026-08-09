import type { Card, Collection } from '../types'
import { entryTotal } from './collection'
import { RARITY_ORDER } from './cards'

export interface Bucket {
  key: string
  owned: number
  total: number
}

export interface Stats {
  uniqueOwned: number
  uniqueTotal: number
  copies: number
  foils: number
  sets: (Bucket & { name: string })[]
  rarities: Bucket[]
  domains: Bucket[]
}

export function computeStats(cards: Card[], collection: Collection): Stats {
  const sets = new Map<string, Bucket & { name: string }>()
  const rarities = new Map<string, Bucket>()
  const domains = new Map<string, Bucket>()

  let uniqueOwned = 0
  let copies = 0
  let foils = 0

  const bump = <T extends Bucket>(map: Map<string, T>, key: string, make: () => T, has: boolean) => {
    let b = map.get(key)
    if (!b) {
      b = make()
      map.set(key, b)
    }
    b.total++
    if (has) b.owned++
  }

  for (const c of cards) {
    const entry = collection[c.cardCode]
    const t = entryTotal(entry)
    const has = t > 0
    if (has) {
      uniqueOwned++
      copies += t
      foils += entry?.f ?? 0
    }
    bump(
      sets,
      c.setCode,
      () => ({ key: c.setCode, name: c.cardSet || c.setCode, owned: 0, total: 0 }),
      has,
    )
    bump(rarities, c.rarity, () => ({ key: c.rarity, owned: 0, total: 0 }), has)
    bump(domains, c.domain, () => ({ key: c.domain, owned: 0, total: 0 }), has)
  }

  const rarityRank = (r: string) => {
    const i = RARITY_ORDER.indexOf(r)
    return i < 0 ? 99 : i
  }

  return {
    uniqueOwned,
    uniqueTotal: cards.length,
    copies,
    foils,
    sets: [...sets.values()].sort((a, b) => b.total - a.total),
    rarities: [...rarities.values()].sort((a, b) => rarityRank(a.key) - rarityRank(b.key)),
    domains: [...domains.values()].sort((a, b) => b.total - a.total),
  }
}

export function pct(owned: number, total: number): number {
  return total ? Math.round((owned / total) * 100) : 0
}

/** Rounding one owned card out of 1,180 down to a flat "0%" reads as broken. */
export function pctLabel(owned: number, total: number): string {
  const p = pct(owned, total)
  if (p === 0 && owned > 0) return '<1%'
  if (p === 100 && owned < total) return '99%'
  return `${p}%`
}
