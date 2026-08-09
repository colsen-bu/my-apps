import { useMemo, useRef, useState } from 'react'
import type { Card } from '../types'
import { collectionStore, useCollection, normalize } from '../lib/collection'
import { computeStats } from '../lib/stats'
import {
  buildExport,
  copyToClipboard,
  downloadFile,
  shareFile,
  type ExportFormat,
} from '../lib/exporter'
import { IconShare } from '../components/Icons'

interface Props {
  cards: Card[]
  onToast: (message: string) => void
}

const FORMATS: { key: ExportFormat; label: string; hint: string }[] = [
  { key: 'full', label: 'JSON', hint: 'Every owned card with its full Riot record and quantities.' },
  { key: 'compact', label: 'JSON (compact)', hint: 'Just card code to counts — small, and re-imports here.' },
  { key: 'csv', label: 'CSV', hint: 'One row per card. Opens in Numbers or Excel.' },
  { key: 'text', label: 'Text list', hint: 'Readable "2x Card Name — Set 001" lines.' },
]

export function DataView({ cards, onToast }: Props) {
  const collection = useCollection()
  const stats = useMemo(() => computeStats(cards, collection), [cards, collection])
  const [format, setFormat] = useState<ExportFormat>('full')
  const [importMode, setImportMode] = useState<'replace' | 'add' | 'max'>('replace')
  const [pasted, setPasted] = useState('')
  const [confirmClear, setConfirmClear] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  const file = useMemo(() => buildExport(cards, collection, format), [cards, collection, format])
  const empty = stats.uniqueOwned === 0

  const share = async () => {
    if (await shareFile(file)) return
    downloadFile(file)
    onToast(`Saved ${file.filename}`)
  }

  const applyImport = (raw: string, source: string) => {
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      onToast(`${source} is not valid JSON`)
      return
    }
    const next = normalize(parsed)
    const count = Object.keys(next).length
    if (!count) {
      onToast('No card quantities found in that file')
      return
    }
    collectionStore.merge(next, importMode)
    onToast(`Imported ${count} cards (${importMode})`)
    setPasted('')
  }

  const pickFile = async (input: HTMLInputElement) => {
    const chosen = input.files?.[0]
    input.value = ''
    if (!chosen) return
    applyImport(await chosen.text(), chosen.name)
  }

  return (
    <div style={{ paddingTop: 12 }}>
      <div className="section-title" style={{ marginTop: 0 }}>
        Export
      </div>

      <div className="statgrid" style={{ marginBottom: 12 }}>
        <div className="stat">
          <div className="stat__value">{stats.uniqueOwned.toLocaleString()}</div>
          <div className="stat__label">Unique</div>
        </div>
        <div className="stat">
          <div className="stat__value">{stats.copies.toLocaleString()}</div>
          <div className="stat__label">Copies</div>
        </div>
        <div className="stat">
          <div className="stat__value">{Math.max(1, Math.round(file.body.length / 1024))}K</div>
          <div className="stat__label">File size</div>
        </div>
      </div>

      <div className="chips">
        {FORMATS.map((f) => (
          <button
            key={f.key}
            type="button"
            className="chip"
            aria-pressed={format === f.key}
            onClick={() => setFormat(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>
      <p className="faint" style={{ fontSize: 13, margin: '8px 0 12px' }}>
        {FORMATS.find((f) => f.key === format)?.hint}
      </p>

      <div className="row" style={{ gap: 8 }}>
        <button type="button" className="btn btn--primary grow" disabled={empty} onClick={share}>
          <span style={{ width: 18, height: 18, display: 'inline-flex' }}>
            <IconShare />
          </span>
          Share
        </button>
        <button
          type="button"
          className="btn grow"
          disabled={empty}
          onClick={() => {
            downloadFile(file)
            onToast(`Saved ${file.filename}`)
          }}
        >
          Save file
        </button>
        <button
          type="button"
          className="btn grow"
          disabled={empty}
          onClick={async () =>
            onToast((await copyToClipboard(file.body)) ? 'Copied to clipboard' : 'Copy blocked')
          }
        >
          Copy
        </button>
      </div>

      {!empty && (
        <details style={{ marginTop: 12 }}>
          <summary className="muted" style={{ fontSize: 14, padding: '8px 0' }}>
            Preview {file.filename}
          </summary>
          <pre
            className="card-panel mono"
            style={{ fontSize: 11, overflowX: 'auto', maxHeight: 260, marginTop: 4 }}
          >
            {file.body.slice(0, 2000)}
            {file.body.length > 2000 ? '\n…' : ''}
          </pre>
        </details>
      )}

      <div className="section-title">Import</div>
      <div className="chips" style={{ marginBottom: 10 }}>
        {(['replace', 'add', 'max'] as const).map((m) => (
          <button
            key={m}
            type="button"
            className="chip"
            aria-pressed={importMode === m}
            onClick={() => setImportMode(m)}
          >
            {m === 'replace' ? 'Replace all' : m === 'add' ? 'Add to counts' : 'Keep highest'}
          </button>
        ))}
      </div>
      <input
        ref={fileInput}
        type="file"
        accept=".json,application/json,text/plain"
        style={{ display: 'none' }}
        onChange={(e) => pickFile(e.currentTarget)}
      />
      <button type="button" className="btn btn--block" onClick={() => fileInput.current?.click()}>
        Choose a JSON file…
      </button>
      <textarea
        className="field"
        style={{ marginTop: 8, minHeight: 84, fontFamily: 'ui-monospace, monospace', fontSize: 13 }}
        placeholder="…or paste exported JSON here"
        value={pasted}
        onChange={(e) => setPasted(e.target.value)}
      />
      <button
        type="button"
        className="btn btn--block"
        style={{ marginTop: 8 }}
        disabled={!pasted.trim()}
        onClick={() => applyImport(pasted, 'Pasted text')}
      >
        Import pasted JSON
      </button>

      <div className="section-title">Card data</div>
      <div className="card-panel">
        <p style={{ margin: '0 0 8px', fontSize: 14 }}>
          <strong>{cards.length.toLocaleString()}</strong> cards across{' '}
          <strong>{stats.sets.length}</strong> sets, straight from Riot's card gallery.
        </p>
        <p className="faint" style={{ margin: 0, fontSize: 13 }}>
          When Riot adds a set, run <span className="mono">npm run cards</span> on the machine that
          builds this app and redeploy. Card art is cached as you browse, so pages you have seen
          stay readable offline.
        </p>
      </div>

      <div className="section-title">Danger zone</div>
      {confirmClear ? (
        <div className="row" style={{ gap: 8 }}>
          <button
            type="button"
            className="btn btn--danger grow"
            onClick={() => {
              collectionStore.clear()
              setConfirmClear(false)
              onToast('Collection cleared')
            }}
          >
            Yes, erase {stats.uniqueOwned} cards
          </button>
          <button type="button" className="btn grow" onClick={() => setConfirmClear(false)}>
            Cancel
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="btn btn--danger btn--block"
          disabled={empty}
          onClick={() => setConfirmClear(true)}
        >
          Clear collection
        </button>
      )}
      <p className="faint" style={{ fontSize: 12.5, marginTop: 10 }}>
        Your collection lives in this browser's storage, on this device only. Export it now and
        again — clearing Safari's website data would take it with it.
      </p>
    </div>
  )
}
