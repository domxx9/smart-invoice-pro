import { useCallback, useState } from 'react'
import { useSettings } from '../contexts/SettingsContext.jsx'
import { PickerUI } from './PickerUI.jsx'

export function PickSheet({ order, picks, onPickChange, onClose }) {
  const { settings } = useSettings()
  const viewMode = settings?.pickerViewMode === 'card' ? 'card' : 'list'
  const orderPicks = picks?.[order.id] ?? {}
  const [unavailable, setUnavailable] = useState({})

  const handlePick = useCallback(
    (idx, qty) => {
      const li = order.lineItems?.[idx]
      const max = Math.max(0, Math.floor(Number(li?.qty) || 0))
      const clamped = Math.min(max, Math.max(0, Math.floor(Number(qty) || 0)))
      onPickChange(order.id, idx, clamped)
    },
    [order.id, order.lineItems, onPickChange],
  )

  const handleUnavailable = useCallback((idx, bool) => {
    setUnavailable((prev) => {
      const flag = !!bool
      if (!!prev[idx] === flag) return prev
      const next = { ...prev }
      if (flag) next[idx] = true
      else delete next[idx]
      return next
    })
  }, [])

  return (
    <PickerUI
      items={order.lineItems}
      picks={orderPicks}
      unavailable={unavailable}
      onPick={handlePick}
      onUnavailable={handleUnavailable}
      viewMode={viewMode}
      onClose={onClose}
      header={
        <div>
          <h2 style={{ fontSize: '1rem', fontWeight: 700 }}>Pick #{order.orderNumber}</h2>
          <p style={{ fontSize: '.75rem', color: 'var(--muted)', marginTop: 2 }}>
            {order.customer}
          </p>
        </div>
      }
    />
  )
}
