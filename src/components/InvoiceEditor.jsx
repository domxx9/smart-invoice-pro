import { useCallback, useEffect, useState } from 'react'
import { SmartPasteWidget } from './SmartPasteWidget.jsx'
import { InvoiceFields } from './InvoiceFields.jsx'
import { InvoiceLineItems } from './InvoiceLineItems.jsx'
import { InvoiceActions } from './InvoiceActions.jsx'
import { InvoiceIntelligenceGuard } from './InvoiceIntelligenceGuard.jsx'
import { ContactModal } from './ContactModal.jsx'
import { useInvoiceIntelligence } from '../hooks/useInvoiceIntelligence.js'
import { useInvoice } from '../contexts/InvoiceContext.jsx'
import { useCatalog } from '../contexts/CatalogContext.jsx'

export function InvoiceEditor({
  contacts,
  onAddContact,
  onUpdateContact,
  aiMode,
  aiReady,
  runInference,
  toast,
  smartPasteContext,
  onOpenSettings,
  searchTier,
  byokProvider,
}) {
  const {
    editing,
    handleSave: ctxHandleSave,
    handleCloseEditor,
    handleDeleteInvoice,
    handleDraftChange,
  } = useInvoice()
  const { catalog } = useCatalog()
  const products = catalog.products

  const [inv, setInv] = useState(() => editing)
  const [guardDismissed, setGuardDismissed] = useState(false)
  const [contactIds, setContactIds] = useState(() => editing?.contactIds || [])
  const [modalContact, setModalContact] = useState(undefined)
  const { issues, hasIssues } = useInvoiceIntelligence({ invoice: inv, products })

  const setField = useCallback((k, v) => setInv((p) => ({ ...p, [k]: v })), [])
  const setItem = useCallback(
    (idx, k, v) =>
      setInv((p) => {
        const items = [...p.items]
        items[idx] = { ...items[idx], [k]: v }
        return { ...p, items }
      }),
    [],
  )
  const addItem = useCallback(
    () => setInv((p) => ({ ...p, items: [...p.items, { desc: '', qty: 1, price: '' }] })),
    [],
  )
  const removeItem = useCallback(
    (idx) => setInv((p) => ({ ...p, items: p.items.filter((_, i) => i !== idx) })),
    [],
  )
  const addProduct = useCallback(
    (prod) =>
      setInv((p) => ({
        ...p,
        items: [...p.items, { desc: prod.name, qty: 1, price: prod.price }],
      })),
    [],
  )
  const addItems = useCallback(
    (items) => setInv((p) => ({ ...p, items: [...p.items, ...items] })),
    [],
  )
  const addDiscount = useCallback(
    () =>
      setInv((p) => ({
        ...p,
        discounts: [
          ...(p.discounts || []),
          {
            id: `d_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            name: '',
            type: 'percent',
            value: '',
          },
        ],
      })),
    [],
  )
  const setDiscount = useCallback(
    (idx, k, v) =>
      setInv((p) => {
        const discounts = [...(p.discounts || [])]
        if (!discounts[idx]) return p
        discounts[idx] = { ...discounts[idx], [k]: v }
        return { ...p, discounts }
      }),
    [],
  )
  const removeDiscount = useCallback(
    (idx) => setInv((p) => ({ ...p, discounts: (p.discounts || []).filter((_, i) => i !== idx) })),
    [],
  )

  useEffect(() => {
    setInv(editing)
    if (editing) {
      setContactIds(editing.contactIds || [])
    }
  }, [editing])

  useEffect(() => {
    setInv((p) => (p ? { ...p, contactIds } : p))
  }, [contactIds])

  useEffect(() => {
    handleDraftChange?.(inv)
  }, [inv]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!inv) {
    return (
      <div style={{ paddingBottom: 140 }}>
        <div className="flex-between mb-16">
          <h2 style={{ fontSize: '1.1rem', fontWeight: 700 }}>No invoice</h2>
        </div>
      </div>
    )
  }

  const handleOpenModal = (contact) => setModalContact(contact)
  const handleCloseModal = () => setModalContact(undefined)

  const handleSaveContact = (data) => {
    if (modalContact?.id) {
      onUpdateContact(modalContact.id, data)
    } else {
      const newContact = onAddContact(data)
      setContactIds((prev) => [...prev, newContact.id])
    }
    setModalContact(undefined)
  }

  return (
    <div style={{ paddingBottom: 140 }}>
      <div className="flex-between mb-16">
        <h2 style={{ fontSize: '1.1rem', fontWeight: 700 }}>{inv.id}</h2>
        <span className={`badge badge-${inv.status}`}>
          {inv.status.charAt(0).toUpperCase() + inv.status.slice(1)}
        </span>
      </div>

      {!guardDismissed && hasIssues && (
        <InvoiceIntelligenceGuard issues={issues} onDismiss={() => setGuardDismissed(true)} />
      )}

      <SmartPasteWidget
        products={products}
        onAddItems={addItems}
        aiMode={aiMode}
        aiReady={aiReady}
        runInference={runInference}
        toast={toast}
        smartPasteContext={smartPasteContext}
        onOpenSettings={onOpenSettings}
        searchTier={searchTier}
        byokProvider={byokProvider}
      />

      <div className="card">
        <InvoiceFields
          inv={inv}
          setField={setField}
          contacts={contacts}
          contactIds={contactIds}
          onContactIdsChange={setContactIds}
          onOpenModal={handleOpenModal}
        />
        <InvoiceLineItems
          inv={inv}
          products={products}
          setItem={setItem}
          addItem={addItem}
          removeItem={removeItem}
          addProduct={addProduct}
          addDiscount={addDiscount}
          setDiscount={setDiscount}
          removeDiscount={removeDiscount}
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

      <InvoiceActions
        inv={inv}
        onSave={ctxHandleSave}
        onClose={handleCloseEditor}
        onDelete={handleDeleteInvoice}
      />

      {modalContact !== undefined && (
        <ContactModal
          contact={modalContact}
          onSave={handleSaveContact}
          onClose={handleCloseModal}
        />
      )}
    </div>
  )
}
