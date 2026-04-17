import { useState, useEffect } from 'react'
import { SmartPasteWidget } from './SmartPasteWidget.jsx'
import { InvoiceFields } from './InvoiceFields.jsx'
import { InvoiceLineItems } from './InvoiceLineItems.jsx'
import { InvoiceActions } from './InvoiceActions.jsx'

export function InvoiceEditor({
  invoice,
  products,
  onSave,
  onClose,
  onDelete,
  onDraftChange,
  aiMode,
  runInference,
  toast,
  smartPasteContext,
  onOpenSettings,
}) {
  const [inv, setInv] = useState(invoice)

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
        runInference={runInference}
        toast={toast}
        smartPasteContext={smartPasteContext}
        onOpenSettings={onOpenSettings}
      />

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
    </div>
  )
}
