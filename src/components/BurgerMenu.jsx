import { useEffect, useRef } from 'react'
import { Icon } from './Icon.jsx'

export function BurgerMenu({ open, onClose, items, activeId, onSelect }) {
  const panelRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  useEffect(() => {
    if (open) panelRef.current?.focus()
  }, [open])

  return (
    <div
      id="burger-menu"
      className={`burger-root ${open ? 'open' : ''}`}
      aria-hidden={open ? undefined : 'true'}
    >
      <button
        type="button"
        className="burger-backdrop"
        aria-label="Close menu"
        tabIndex={open ? 0 : -1}
        onClick={onClose}
      />
      <aside
        ref={panelRef}
        className="burger-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Main menu"
        tabIndex={-1}
      >
        <div className="burger-panel-header">
          <span className="burger-panel-title">Menu</span>
          <button
            type="button"
            className="burger-close-btn"
            aria-label="Close menu"
            onClick={onClose}
          >
            <Icon name="close" />
          </button>
        </div>
        <ul className="burger-list">
          {items.map((item) => {
            const isActive = item.id === activeId
            return (
              <li key={item.id}>
                <button
                  type="button"
                  className={`burger-item ${isActive ? 'active' : ''}`}
                  aria-current={isActive ? 'page' : undefined}
                  tabIndex={open ? 0 : -1}
                  onClick={() => {
                    onSelect(item.id)
                    onClose()
                  }}
                >
                  <Icon name={item.icon} />
                  <span>{item.label}</span>
                </button>
              </li>
            )
          })}
        </ul>
      </aside>
    </div>
  )
}
