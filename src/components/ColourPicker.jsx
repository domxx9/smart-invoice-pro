import { useId } from 'react'

export function ColourPicker({ label, value, presets, onChange }) {
  const customId = useId()
  return (
    <div className="field">
      <label htmlFor={customId}>{label}</label>
      <div
        role="group"
        aria-label={label}
        style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}
      >
        {presets.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => onChange(c)}
            aria-label={`Colour ${c}`}
            aria-pressed={value === c}
            style={{
              width: 26,
              height: 26,
              borderRadius: '50%',
              background: c,
              cursor: 'pointer',
              border: value === c ? '3px solid #fff' : '2px solid rgba(255,255,255,0.15)',
              boxShadow: value === c ? `0 0 0 2px ${c}` : 'none',
              flexShrink: 0,
              padding: 0,
            }}
          />
        ))}
        <input
          id={customId}
          type="color"
          value={value || presets[0]}
          onChange={(e) => onChange(e.target.value)}
          aria-label={`${label} custom picker`}
          style={{
            width: 26,
            height: 26,
            padding: 0,
            border: '1px solid var(--border)',
            borderRadius: '50%',
            cursor: 'pointer',
            background: 'none',
          }}
        />
      </div>
    </div>
  )
}
