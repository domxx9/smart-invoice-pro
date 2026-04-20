export function PickerQuantity({ ordered, picked, onChange, label }) {
  const max = Math.max(0, Math.floor(Number(ordered) || 0))
  const current = Math.min(max, Math.max(0, Math.floor(Number(picked) || 0)))
  const done = max > 0 && current >= max
  const decLabel = label ? `Decrease picked quantity of ${label}` : 'Decrease picked quantity'
  const incLabel = label ? `Increase picked quantity of ${label}` : 'Increase picked quantity'

  return (
    <div
      className="picker-quantity"
      style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}
    >
      <button
        type="button"
        aria-label={decLabel}
        onClick={() => onChange(Math.max(0, current - 1))}
        disabled={current === 0}
        style={{
          width: 34,
          height: 34,
          borderRadius: '50%',
          border: '1px solid var(--border)',
          background: 'var(--surface)',
          cursor: 'pointer',
          fontSize: '1.3rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--text)',
          opacity: current === 0 ? 0.3 : 1,
        }}
      >
        −
      </button>
      <span
        aria-live="polite"
        aria-atomic="true"
        style={{
          minWidth: 44,
          textAlign: 'center',
          fontWeight: 700,
          fontSize: '.95rem',
          color: done ? 'var(--success)' : 'var(--text)',
        }}
      >
        {current}/{max}
      </span>
      <button
        type="button"
        aria-label={incLabel}
        onClick={() => onChange(Math.min(max, current + 1))}
        disabled={current >= max}
        style={{
          width: 34,
          height: 34,
          borderRadius: '50%',
          border: '1px solid var(--border)',
          background: 'var(--surface)',
          cursor: 'pointer',
          fontSize: '1.3rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--text)',
          opacity: current >= max ? 0.3 : 1,
        }}
      >
        +
      </button>
    </div>
  )
}
