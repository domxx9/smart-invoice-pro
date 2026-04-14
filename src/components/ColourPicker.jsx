export function ColourPicker({ label, value, presets, onChange }) {
  return (
    <div className="field">
      <label>{label}</label>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {presets.map(c => (
          <div key={c} onClick={() => onChange(c)} style={{
            width: 26, height: 26, borderRadius: '50%', background: c, cursor: 'pointer',
            border: value === c ? '3px solid #fff' : '2px solid rgba(255,255,255,0.15)',
            boxShadow: value === c ? `0 0 0 2px ${c}` : 'none',
            flexShrink: 0,
          }} />
        ))}
        <input type="color" value={value || presets[0]} onChange={e => onChange(e.target.value)}
          style={{ width: 26, height: 26, padding: 0, border: '1px solid var(--border)', borderRadius: '50%', cursor: 'pointer', background: 'none' }} />
      </div>
    </div>
  )
}
