import { useSyncExternalStore } from 'react'
import type { Collection, Entry } from '../types'

const KEY = 'riftbound.collection.v1'
const EMPTY: Entry = { n: 0, f: 0 }

type Listener = () => void

function read(): Collection {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    return normalize(parsed)
  } catch {
    return {}
  }
}

/**
 * Accepts both the current `{code: {n, f}}` shape and the legacy single-file
 * app's `{code: <count>}`, so an old export imports without a conversion step.
 */
export function normalize(input: unknown): Collection {
  const out: Collection = {}
  if (!input || typeof input !== 'object') return out

  // An export file wraps the map; a raw map is also accepted.
  const source =
    'cards' in (input as Record<string, unknown>)
      ? (input as { cards: unknown }).cards
      : 'collection' in (input as Record<string, unknown>)
        ? (input as { collection: unknown }).collection
        : input
  if (!source || typeof source !== 'object') return out

  for (const [code, value] of Object.entries(source as Record<string, unknown>)) {
    let n = 0
    let f = 0
    if (typeof value === 'number') n = value
    else if (value && typeof value === 'object') {
      const v = value as Record<string, unknown>
      n = Number(v.n ?? v.count ?? v.normal ?? v.quantity ?? 0)
      f = Number(v.f ?? v.foil ?? v.foils ?? 0)
    }
    n = clamp(n)
    f = clamp(f)
    if (n || f) out[code] = { n, f }
  }
  return out
}

function clamp(v: number): number {
  if (!Number.isFinite(v) || v < 0) return 0
  return Math.min(9999, Math.floor(v))
}

let state: Collection = read()
const listeners = new Set<Listener>()

function commit(next: Collection) {
  state = next
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    // Quota or private-mode failure: the in-memory collection still works for
    // this session, and export is right there to rescue it.
  }
  listeners.forEach((l) => l())
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

// Another tab (or another window of the installed app) editing the same key.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key !== KEY) return
    state = read()
    listeners.forEach((l) => l())
  })
}

export const collectionStore = {
  get: () => state,
  subscribe,

  entry(code: string): Entry {
    return state[code] ?? EMPTY
  },

  set(code: string, entry: Entry) {
    const n = clamp(entry.n)
    const f = clamp(entry.f)
    const next = { ...state }
    if (n || f) next[code] = { n, f }
    else delete next[code]
    commit(next)
  },

  adjust(code: string, dn: number, df = 0) {
    const cur = state[code] ?? EMPTY
    collectionStore.set(code, { n: cur.n + dn, f: cur.f + df })
  },

  /** Bulk write, one commit — used by import and by the set-wide actions. */
  merge(patch: Collection, mode: 'replace' | 'add' | 'max' = 'replace') {
    const next = mode === 'replace' ? {} : { ...state }
    if (mode === 'replace') Object.assign(next, patch)
    else {
      for (const [code, e] of Object.entries(patch)) {
        const cur = next[code] ?? EMPTY
        const merged: Entry =
          mode === 'add'
            ? { n: clamp(cur.n + e.n), f: clamp(cur.f + e.f) }
            : { n: Math.max(cur.n, e.n), f: Math.max(cur.f, e.f) }
        if (merged.n || merged.f) next[code] = merged
        else delete next[code]
      }
    }
    commit(next)
  },

  clear() {
    commit({})
  },
}

export function useCollection(): Collection {
  return useSyncExternalStore(subscribe, collectionStore.get, collectionStore.get)
}

/** Subscribe a single card's counts — keeps a tapped tile from re-rendering the grid. */
export function useEntry(code: string): Entry {
  return useSyncExternalStore(
    subscribe,
    () => state[code] ?? EMPTY,
    () => EMPTY,
  )
}

export function entryTotal(e: Entry | undefined): number {
  return e ? e.n + e.f : 0
}
