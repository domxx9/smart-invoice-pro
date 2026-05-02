import { useEffect } from 'react'
import { ContactSelector } from './ContactSelector.jsx'

export function InvoiceFields({
  inv,
  setField,
  contacts = [],
  contactIds = [],
  onContactIdsChange,
  onOpenModal,
}) {
  const primaryContact = contacts.find((c) => contactIds.includes(c.id))

  useEffect(() => {
    if (!primaryContact) return
    setField('customer', primaryContact.name || '')
    setField('customerBusiness', primaryContact.business || '')
    setField('email', primaryContact.email || '')
    setField('address1', primaryContact.address1 || '')
    setField('address2', primaryContact.address2 || '')
    setField('city', primaryContact.city || '')
    setField('postcode', primaryContact.postcode || '')
    setField('country', primaryContact.country || '')
  }, [primaryContact, setField])

  return (
    <div className="invoice-meta">
      {contacts.length === 0 ? (
        <p style={{ color: '#888', fontSize: '0.875rem' }}>No contacts exist</p>
      ) : (
        <ContactSelector
          contacts={contacts}
          selectedIds={contactIds}
          onChange={onContactIdsChange}
          onOpenModal={onOpenModal}
        />
      )}

      {primaryContact && (
        <div className="contact-autofill-banner">
          <span>Auto-filled from {primaryContact.name}</span>
        </div>
      )}

      <div className="field">
        <label>
          Customer Name
          <input
            value={inv.customer || ''}
            onChange={(e) => setField('customer', e.target.value)}
            placeholder="Jane Smith"
          />
        </label>
      </div>
      <div className="field">
        <label>
          Business Name
          <input
            value={inv.customerBusiness || ''}
            onChange={(e) => setField('customerBusiness', e.target.value)}
            placeholder="Acme Corp (optional)"
          />
        </label>
      </div>
      <div className="field">
        <label>
          Email
          <input
            value={inv.email || ''}
            onChange={(e) => setField('email', e.target.value)}
            placeholder="billing@acme.com"
            type="email"
          />
        </label>
      </div>
      <div className="field">
        <label>
          Address Line 1
          <input
            value={inv.address1 || ''}
            onChange={(e) => setField('address1', e.target.value)}
            placeholder="123 High Street"
          />
        </label>
      </div>
      <div className="field">
        <label>
          Address Line 2
          <input
            value={inv.address2 || ''}
            onChange={(e) => setField('address2', e.target.value)}
            placeholder="Suite / Unit (optional)"
          />
        </label>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div className="field">
          <label>
            City
            <input
              value={inv.city || ''}
              onChange={(e) => setField('city', e.target.value)}
              placeholder="London"
            />
          </label>
        </div>
        <div className="field">
          <label>
            Postcode / ZIP
            <input
              value={inv.postcode || ''}
              onChange={(e) => setField('postcode', e.target.value)}
              placeholder="SW1A 1AA"
            />
          </label>
        </div>
      </div>
      <div className="field">
        <label>
          Country
          <input
            value={inv.country || ''}
            onChange={(e) => setField('country', e.target.value)}
            placeholder="United Kingdom"
          />
        </label>
      </div>
      <div className="field">
        <label>
          Invoice Date
          <input value={inv.date} onChange={(e) => setField('date', e.target.value)} type="date" />
        </label>
      </div>
      <div className="field">
        <label>
          Due Date
          <input value={inv.due} onChange={(e) => setField('due', e.target.value)} type="date" />
        </label>
      </div>
      <div className="field">
        <label>
          Tax %
          <input
            value={inv.tax}
            onChange={(e) => setField('tax', e.target.value)}
            type="number"
            min="0"
            max="100"
          />
        </label>
      </div>
    </div>
  )
}
