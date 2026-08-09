import type { Card, Collection } from '../types'
import { entryTotal } from './collection'
import { shortNumber } from './cards'

export type ExportFormat = 'full' | 'compact' | 'csv' | 'text'

export interface ExportFile {
  filename: string
  mime: string
  body: string
}

function stamp(): string {
  return new Date().toISOString().slice(0, 10)
}

/**
 * `full` is the one to hand to another tool: every owned card, with the Riot
 * fields already attached, so the reader needs no second lookup.
 */
export function buildExport(
  cards: Card[],
  collection: Collection,
  format: ExportFormat,
): ExportFile {
  const byCode = new Map(cards.map((c) => [c.cardCode, c]))
  const owned = Object.entries(collection)
    .filter(([, e]) => entryTotal(e) > 0)
    .map(([code, e]) => ({ code, entry: e, card: byCode.get(code) }))
    .sort((a, b) => {
      if (!a.card || !b.card) return a.code.localeCompare(b.code)
      return (
        a.card.setCode.localeCompare(b.card.setCode) ||
        a.card.collectorNumber - b.card.collectorNumber
      )
    })

  if (format === 'compact') {
    const map: Record<string, { n: number; f: number }> = {}
    for (const o of owned) map[o.code] = o.entry
    return {
      filename: `riftbound-collection-${stamp()}.json`,
      mime: 'application/json',
      body: JSON.stringify(map, null, 2),
    }
  }

  if (format === 'csv') {
    const rows = [
      ['cardCode', 'number', 'name', 'set', 'rarity', 'domain', 'type', 'normal', 'foil', 'total'],
      ...owned.map((o) => [
        o.code,
        o.card ? shortNumber(o.card) : '',
        o.card?.name ?? '',
        o.card?.cardSet ?? '',
        o.card?.rarity ?? '',
        o.card?.domain ?? '',
        o.card?.cardType ?? '',
        String(o.entry.n),
        String(o.entry.f),
        String(o.entry.n + o.entry.f),
      ]),
    ]
    return {
      filename: `riftbound-collection-${stamp()}.csv`,
      mime: 'text/csv',
      body: rows.map((r) => r.map(csvCell).join(',')).join('\n'),
    }
  }

  if (format === 'text') {
    const body = owned
      .map((o) => {
        const t = o.entry.n + o.entry.f
        const foil = o.entry.f ? ` (${o.entry.f} foil)` : ''
        return `${t}x ${o.card?.name ?? o.code} — ${o.card?.cardSet ?? ''} ${
          o.card ? shortNumber(o.card) : ''
        }${foil}`.trim()
      })
      .join('\n')
    return {
      filename: `riftbound-collection-${stamp()}.txt`,
      mime: 'text/plain',
      body,
    }
  }

  const payload = {
    app: 'Riftbound Collection',
    version: 1,
    exportedAt: new Date().toISOString(),
    totals: {
      uniqueCards: owned.length,
      totalCopies: owned.reduce((s, o) => s + o.entry.n + o.entry.f, 0),
      foilCopies: owned.reduce((s, o) => s + o.entry.f, 0),
    },
    cards: owned.map((o) => ({
      cardCode: o.code,
      name: o.card?.name ?? null,
      set: o.card?.cardSet ?? null,
      setCode: o.card?.setCode ?? null,
      number: o.card ? shortNumber(o.card) : null,
      cardNumber: o.card?.cardNumber ?? null,
      rarity: o.card?.rarity ?? null,
      domain: o.card?.domain ?? null,
      cardType: o.card?.cardType ?? null,
      energy: o.card?.energy ?? null,
      might: o.card?.might ?? null,
      power: o.card?.power ?? null,
      tags: o.card?.tags ?? [],
      imageUrl: o.card?.imageUrl ?? null,
      quantity: o.entry.n + o.entry.f,
      normal: o.entry.n,
      foil: o.entry.f,
    })),
  }

  return {
    filename: `riftbound-collection-${stamp()}.json`,
    mime: 'application/json',
    body: JSON.stringify(payload, null, 2),
  }
}

function csvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

/** Save to Files / Downloads. Safari honours the download attribute on a blob URL. */
export function downloadFile(file: ExportFile): void {
  const url = URL.createObjectURL(new Blob([file.body], { type: `${file.mime};charset=utf-8` }))
  const a = document.createElement('a')
  a.href = url
  a.download = file.filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

/**
 * iOS share sheet — the natural way off the phone (AirDrop, Files, Mail).
 * Resolves false when the platform can't share this file, so the caller can
 * fall back to a download without the user seeing an error.
 */
export async function shareFile(file: ExportFile): Promise<boolean> {
  const data = new File([file.body], file.filename, { type: file.mime })
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean }
  if (!nav.share || !nav.canShare?.({ files: [data] })) return false
  try {
    await nav.share({ files: [data], title: 'Riftbound Collection' })
    return true
  } catch {
    // A cancelled share sheet is not a failure worth falling back from.
    return true
  }
}

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}
