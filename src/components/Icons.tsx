/** Inline 24px stroke icons — no icon font, nothing to fetch. */
const base = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

export function IconCards() {
  return (
    <svg {...base}>
      <rect x="3" y="4" width="11" height="15" rx="2" />
      <path d="M17 7h1a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H9" />
    </svg>
  )
}

export function IconPlus() {
  return (
    <svg {...base}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v8M8 12h8" />
    </svg>
  )
}

export function IconBox() {
  return (
    <svg {...base}>
      <path d="M3 7.5 12 3l9 4.5v9L12 21l-9-4.5z" />
      <path d="M3 7.5 12 12l9-4.5M12 12v9" />
    </svg>
  )
}

export function IconChart() {
  return (
    <svg {...base}>
      <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
    </svg>
  )
}

export function IconShare() {
  return (
    <svg {...base}>
      <path d="M12 15V3m0 0L8 7m4-4 4 4" />
      <path d="M4 14v5a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5" />
    </svg>
  )
}
