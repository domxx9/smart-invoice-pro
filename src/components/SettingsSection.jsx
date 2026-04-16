import { useState } from 'react'

export function SettingsSection({ title, defaultOpen = false, dataTour, children }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="settings-section" {...(dataTour ? { 'data-tour': dataTour } : {})}>
      <div
        className={`settings-section-header${open ? ' open' : ''}`}
        onClick={() => setOpen((o) => !o)}
      >
        <h2>{title}</h2>
        <span className="chevron">▼</span>
      </div>
      {open && <div className="settings-section-body">{children}</div>}
    </div>
  )
}
