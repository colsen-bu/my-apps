import { Fragment, type ReactNode } from 'react'
import { domainColor } from '../lib/cards'

// Riot's rules text carries inline symbol codes like ":rb_energy_1:" and
// ":rb_rune_fury:" that only render inside their own client. Turn them into
// readable pills rather than leaving raw colons in the middle of a sentence.
const TOKEN = /:rb_([a-z0-9_]+):/gi

function label(code: string): { text: string; color?: string } {
  const parts = code.toLowerCase().split('_')
  if (parts[0] === 'energy') return { text: parts[1] ?? 'E' }
  if (parts[0] === 'rune') {
    const domain = (parts[1] ?? '').replace(/^./, (c) => c.toUpperCase())
    return { text: domain || 'Rune', color: domainColor(domain) }
  }
  if (parts[0] === 'power') return { text: `${parts[1] ?? ''}⚡`.trim() }
  return { text: parts.join(' ') }
}

export function RulesText({ text }: { text: string }) {
  if (!text) return null

  return (
    <>
      {text.split('\n').map((line, li) => (
        <p key={li} style={{ margin: '0 0 8px' }}>
          {renderLine(line)}
        </p>
      ))}
    </>
  )
}

function renderLine(line: string): ReactNode[] {
  const out: ReactNode[] = []
  let last = 0
  let match: RegExpExecArray | null
  TOKEN.lastIndex = 0

  while ((match = TOKEN.exec(line))) {
    if (match.index > last) out.push(line.slice(last, match.index))
    const { text, color } = label(match[1])
    out.push(
      <span
        key={`${match.index}-${text}`}
        className="tag"
        style={color ? { color, borderColor: color } : undefined}
      >
        {text}
      </span>,
    )
    last = match.index + match[0].length
  }
  if (last < line.length) out.push(line.slice(last))
  return out.map((n, i) => <Fragment key={i}>{n}</Fragment>)
}
