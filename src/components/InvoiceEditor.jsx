import { useEffect, useMemo, useState } from 'react'
import { SmartPasteWidget } from './SmartPasteWidget.jsx'
import { InvoiceFields } from './InvoiceFields.jsx'
import { InvoiceLineItems } from './InvoiceLineItems.jsx'
import { InvoiceActions } from './InvoiceActions.jsx'
import { PickerUI } from './PickerUI.jsx'
import { FulfilmentChoiceModal } from './FulfilmentChoiceModal.jsx'
import { usePicker } from '../hooks/usePicker.js'
import { useSettings } from '../contexts/SettingsContext.jsx'

function InvoicePicker({ inv, onSkip, onFulfil, onClose }) {
  const { settings } = useSettings()
  const viewMode = settings?.pickerViewMode === 'card' ? 'card' : 'list'

  const items = useMemo(
    () =>
      (Array.isArray(inv.items) ? inv.items : []).map((it) => ({
        name: it?.desc || '',
        qty: Math.max(0, Math.floor(Number(it?.qty) || 0)),
      })),
    [inv.items],
  )

  const { picks, unavailable, handlePick, handleUnavailable } = usePicker(items)

  return (
    <PickerUI
      items={items}
      picks={picks}
      unavailable={unavailable}
      onPick={handlePick}
      onUnavailable={handleUnavailable}
      viewMode={viewMode}
      onClose={onClose}
      header={
        <div>
          <h2 style={{ fontSize: '1rem', fontWeight: 700 }}>Fulfil {inv.id}</h2>
          <p style={{ fontSize: '.75rem', color: 'var(--muted)', marginTop: 2 }}>
            {inv.customer || 'Invoice fulfillment'}
          </p>
        </div>
      }
      footer={
        <div style={{ display: 'flex', gap: 10 }}>
          <button type="button" className="btn btn-ghost btn-full" onClick={onSkip}>
            Skip
          </button>
          <button
            type="button"
            className="btn btn-primary btn-full"
            onClick={() => onFulfil({ picks, unavailable })}
          >
            Mark as Fulfilled
          </button>
        </div>
      }
    />
  )
}

export function InvoiceEditor({
  invoice,
  products,
  onSave,
  onClose,
  onDelete,
  onDraftChange,
  aiMode,
  aiReady,
  runInference,
  toast,
  smartPasteContext,
  onOpenSettings,
}) {
  const [inv, setInv] = useState(invoice)
  const [picking, setPicking] = useState(false)
  const [choosingFulfilment, setChoosingFulfilment] = useState(false)

  const setField = (k, v) => setInv((p) => ({ ...p, [k]: v }))
  const setItem = (idx, k, v) =>
    setInv((p) => {
      const items = [...p.items]
      items[idx] = { ...items[idx], [k]: v }
      return { ...p, items }
    })
  const addItem = () =>
    setInv((p) => ({ ...p, items: [...p.items, { desc: '', qty: 1, price: '' }] }))
  const removeItem = (idx) => setInv((p) => ({ ...p, items: p.items.filter((_, i) => i !== idx) }))
  const addProduct = (prod) =>
    setInv((p) => ({ ...p, items: [...p.items, { desc: prod.name, qty: 1, price: prod.price }] }))
  const addItems = (items) => setInv((p) => ({ ...p, items: [...p.items, ...items] }))

  useEffect(() => {
    localStorage.setItem('sip_draft_edit', JSON.stringify(inv))
    onDraftChange?.(inv)
  }, [inv]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSkipFulfil = () => {
    setPicking(false)
    setChoosingFulfilment(false)
    onSave({ ...inv, status: 'fulfilled', fulfillmentMethod: 'instant' })
  }

  const handleFulfilWithPicks = ({ picks, unavailable }) => {
    setPicking(false)
    setChoosingFulfilment(false)
    onSave({
      ...inv,
      status: 'fulfilled',
      fulfillmentMethod: 'picked',
      picks,
      unavailable,
    })
  }

  const handleChoosePicker = () => {
    setChoosingFulfilment(false)
    setPicking(true)
  }

  return (
    <div style={{ paddingBottom: 140 }}>
      <div className="flex-between mb-16">
        <h2 style={{ fontSize: '1.1rem', fontWeight: 700 }}>{inv.id}</h2>
        <span className={`badge badge-${inv.status}`}>
          {inv.status.charAt(0).toUpperCase() + inv.status.slice(1)}
        </span>
      </div>

      <SmartPasteWidget
        products={products}
        onAddItems={addItems}
        aiMode={aiMode}
        aiReady={aiReady}
        runInference={runInference}
        toast={toast}
        smartPasteContext={smartPasteContext}
        onOpenSettings={onOpenSettings}
      />

      {inv.status === 'pending' && (
        <div
          className="card"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: '.92rem' }}>Ready to fulfil?</div>
            <div style={{ fontSize: '.74rem', color: 'var(--muted)', marginTop: 2 }}>
              Pick items off the shelf or mark as fulfilled instantly.
            </div>
          </div>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => setChoosingFulfilment(true)}
          >
            Mark as Fulfilled
          </button>
        </div>
      )}

      <div className="card">
        <InvoiceFields inv={inv} setField={setField} />
        <InvoiceLineItems
          inv={inv}
          products={products}
          setItem={setItem}
          addItem={addItem}
          removeItem={removeItem}
          addProduct={addProduct}
        />
        <div className="field mt-8">
          <label>
            Notes
            <textarea
              value={inv.notes}
              onChange={(e) => setField('notes', e.target.value)}
              placeholder="Payment terms, thank-you note, etc."
            />
          </label>
        </div>
      </div>

      <InvoiceActions inv={inv} onSave={onSave} onClose={onClose} onDelete={onDelete} />

      {choosingFulfilment && (
        <FulfilmentChoiceModal
          invoiceId={inv.id}
          onPicker={handleChoosePicker}
          onSkip={handleSkipFulfil}
          onClose={() => setChoosingFulfilment(false)}
        />
      )}

      {picking && (
        <InvoicePicker
          inv={inv}
          onSkip={handleSkipFulfil}
          onFulfil={handleFulfilWithPicks}
          onClose={() => setPicking(false)}
        />
      )}
    </div>
  )
}
