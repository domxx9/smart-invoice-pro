import { useState } from 'react'
import { calcTotals, fmt } from '../helpers.js'
import { Icon } from './Icon.jsx'

function daysOverdue(inv) {
  if (!inv.due) return 0
  return Math.max(0, Math.floor((Date.now() - new Date(inv.due).getTime()) / 86400000))
}

function overdueColor(days) {
  if (days <= 7)  return '#f59e0b'
  if (days <= 14) return '#f97316'
  if (days <= 30) return '#ef4444'
  return '#9f1239'
}

export function Invoices({ invoices, onNewInvoice, onEdit, onDuplicate, editingDraft }) {
  const [filter, setFilter]     = useState('all')
  const [search, setSearch]     = useState('')
  const [copiedId, setCopiedId] = useState(null)

  const copyId = (id) => {
    navigator.clipboard?.writeText(id).catch(() => {})
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 1600)
  }

  const displayInvoices = editingDraft
    ? invoices.some(i => i.id === editingDraft.id)
      ? invoices.map(i => i.id === editingDraft.id ? { ...editingDraft, status: 'draft' } : i)
      : [{ ...editingDraft, status: 'draft' }, ...invoices]
    : invoices

  const isOverdueFn = (inv) => inv.status === 'pending' && inv.due && new Date(inv.due) < new Date()

  const q = search.trim().toLowerCase()
  const filtered = filter === 'all'
    ? displayInvoices
    : filter === 'overdue'
      ? displayInvoices.filter(isOverdueFn)
      : displayInvoices.filter(i => i.status === filter)
  const visible = q
    ? filtered.filter(i =>
        i.id?.toLowerCase().includes(q) ||
        i.customer?.toLowerCase().includes(q) ||
        i.customerBusiness?.toLowerCase().includes(q) ||
        i.email?.toLowerCase().includes(q)
      )
    : filtered

  const sorted = [
    ...visible.filter(i => i.status === 'draft'),
    ...visible.filter(i => i.status !== 'draft').reverse(),
  ]

  return (
    <div>
      <div className="flex-between mb-16">
        <h2 style={{ fontSize: '1.1rem', fontWeight: 700 }}>Invoices</h2>
        <button className="btn btn-primary btn-sm" onClick={onNewInvoice}>
          <Icon name="plus" /> New
        </button>
      </div>

      <div style={{ position: 'relative', marginBottom: 10 }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name, ID, email…"
          style={{
            width: '100%', background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)', padding: '9px 34px 9px 12px',
            color: 'var(--text)', fontSize: '.85rem', outline: 'none',
          }}
        />
        {search && (
          <button onClick={() => setSearch('')} style={{
            position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
            background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer',
            fontSize: '1rem', lineHeight: 1, padding: 0,
          }}>×</button>
        )}
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
        {['all', 'new', 'pending', 'fulfilled', 'paid', 'overdue', 'refunded'].map(f => (
          <span key={f} className="chip"
            style={filter === f ? { background: 'rgba(245,166,35,.3)' } : {}}
            onClick={() => setFilter(f)}>
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </span>
        ))}
      </div>

      <div>
        {sorted.length === 0 && <p className="text-muted" style={{ padding: '20px 0' }}>No invoices.</p>}
        {sorted.map(inv => {
          const { total }  = calcTotals(inv.items, inv.tax)
          const isDraft    = inv.status === 'draft'
          const isOverdue  = isOverdueFn(inv)
          const days       = isOverdue ? daysOverdue(inv) : 0
          const heatColor  = isOverdue ? overdueColor(days) : null

          return (
            <div key={inv.id} className="inv-row" onClick={() => onEdit(inv)}
              style={{
                ...(isDraft   ? { borderLeft: '3px solid var(--muted)',  paddingLeft: 10 } : {}),
                ...(isOverdue ? { borderLeft: `3px solid ${heatColor}`,  paddingLeft: 10 } : {}),
              }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span className="inv-id"
                    onClick={e => { e.stopPropagation(); copyId(inv.id) }}
                    style={{ cursor: 'copy' }}>
                    {inv.id}
                  </span>
                  {copiedId === inv.id && (
                    <span style={{ fontSize: '.62rem', color: 'var(--success)', fontWeight: 600 }}>✓ Copied</span>
                  )}
                </div>
                <div className="inv-customer">
                  {inv.customer || '—'} · {isDraft ? 'Unsaved draft' : `Due ${inv.due || '—'}`}
                </div>
                {isOverdue && days > 0 && (
                  <div style={{ fontSize: '.68rem', color: heatColor, marginTop: 2, fontWeight: 600 }}>
                    {days} day{days !== 1 ? 's' : ''} overdue
                  </div>
                )}
              </div>

              <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                <div style={{ color: isDraft ? 'var(--muted)' : 'var(--accent)', fontWeight: 700 }}>
                  {fmt(total)}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span className={`badge badge-${isOverdue ? 'overdue' : inv.status}`}>{isOverdue ? 'overdue' : inv.status}</span>
                  {!isDraft && onDuplicate && (
                    <button
                      title="Duplicate invoice"
                      onClick={e => { e.stopPropagation(); onDuplicate(inv) }}
                      style={{
                        background: 'none', border: '1px solid var(--border)', borderRadius: 4,
                        color: 'var(--muted)', fontSize: '.72rem', padding: '1px 5px',
                        cursor: 'pointer', lineHeight: 1.4,
                      }}>
                      ⧉
                    </button>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
