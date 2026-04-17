import { useId, useState } from 'react'

export function SettingsSection({ id, title, defaultOpen = false, dataTour, children }) {
  const [open, setOpen] = useState(defaultOpen)
  const bodyId = useId()
  return (
    <div className="settings-section" {...(dataTour ? { 'data-tour': dataTour } : {})}>
      <button
        type="button"
        className={`settings-section-header${open ? ' open' : ''}`}
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => setOpen((o) => !o)}
      >
        <h2 {...(id ? { id } : {})}>{title}</h2>
        <span className="chevron" aria-hidden="true">
          ▼
        </span>
      </button>
      {open && (
        <div id={bodyId} className="settings-section-body">
          {children}
        </div>
      )}
    </div>
  )
}
