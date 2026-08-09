interface Props {
  value: number
  onChange: (next: number) => void
  label: string
  size?: 'sm' | 'lg'
  max?: number
}

export function Stepper({ value, onChange, label, size = 'sm', max = 999 }: Props) {
  return (
    <div className={`stepper${size === 'lg' ? ' stepper--lg' : ''}`}>
      <button
        type="button"
        aria-label={`Remove one ${label}`}
        disabled={value <= 0}
        onClick={() => onChange(Math.max(0, value - 1))}
      >
        −
      </button>
      <span className="stepper__value" aria-live="polite" aria-label={`${value} ${label}`}>
        {value}
      </span>
      <button
        type="button"
        aria-label={`Add one ${label}`}
        disabled={value >= max}
        onClick={() => onChange(Math.min(max, value + 1))}
      >
        +
      </button>
    </div>
  )
}
