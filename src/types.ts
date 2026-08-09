/** A card exactly as `scripts/fetch_riot_cards.py` writes it into public/cards.json. */
export interface Card {
  cardCode: string
  name: string
  fullName: string
  setCode: string
  cardSet: string
  /** Riot's public numbering, e.g. "001-298" for card 1 of 298. */
  cardNumber: string
  rarity: string
  domain: string
  cardType: string
  abilityEffective: string
  artist: string
  imageUrl: string
  collectorNumber: number
  tags?: string[]
  energy?: number
  might?: number
  power?: number
}

/** What you own of one card. Kept tiny — it is written to localStorage constantly. */
export interface Entry {
  /** Regular copies. */
  n: number
  /** Foil copies. */
  f: number
}

export type Collection = Record<string, Entry>

export type Ownership = 'all' | 'owned' | 'missing' | 'foil'

export type SortKey = 'number' | 'name' | 'rarity' | 'owned' | 'energy'

export interface Filters {
  q: string
  set: string
  domain: string
  type: string
  rarity: string
  ownership: Ownership
  sort: SortKey
}
