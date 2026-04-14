import { useState } from 'react'
import { calcTotals, fmt } from '../helpers.js'
import { Icon } from './Icon.jsx'

export function Invoices({ invoices, onNewInvoice, onEdit, editingDraft }) {
  const [filter, setFilter] = useState('all')

  const displayInvoices = editingDraft
    ? invoices.some(i => i.id === editingDraft.id)
      ? invoices.map(i => i.id === editingDraft.id ? { ...editingDraft, status: 'draft' } : i)
      : [{ ...editingDraft, status: 'draft' }, ...invoices]
    : invoices

  const visible = filter === 'all' ? displayInvoices : displayInvoices.filter(i => i.status === filter)

  return (
    <div>
      <div className="flex-between mb-16">
        <h2 style={{ fontSize: '1.1rem', fontWeight: 700 }}>Invoices</h2>
        <button className="btn btn-primary btn-sm" onClick={onNewInvoice}>
          <Icon name="plus" /> New
        </button>
      </div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
        {['all', 'new', 'pending', 'fulfilled', 'paid', 'overdue', 'refunded'].map(f => (
          <span
            key={f}
            className="chip"
            style={filter === f ? { background: 'rgba(245,166,35,.3)' } : {}}
            onClick={() => setFilter(f)}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </span>
        ))}
      </div>
      <div>
        {visible.length === 0 && <p className="text-muted" style={{ padding: '20px 0' }}>No invoices.</p>}
        {[
          ...visible.filter(i => i.status === 'draft'),
          ...visible.filter(i => i.status !== 'draft').reverse(),
        ].map(inv => {
          const { total } = calcTotals(inv.items, inv.tax)
          const isDraft = inv.status === 'draft'
          return (
            <div key={inv.id} className="inv-row" onClick={() => onEdit(inv)}
              style={isDraft ? { borderLeft: '3px solid var(--muted)', paddingLeft: 10 } : {}}>
              <div>
                <div className="inv-id">{inv.id}</div>
                <div className="inv-customer">{inv.customer || '—'} · {isDraft ? 'Unsaved draft' : `Due ${inv.due || '—'}`}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ color: isDraft ? 'var(--muted)' : 'var(--accent)', fontWeight: 700 }}>{fmt(total)}</div>
                <span className={`badge badge-${inv.status}`}>{inv.status}</span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
