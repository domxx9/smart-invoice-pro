import { calcTotals, fmt, today } from '../helpers.js'
import { Icon } from './Icon.jsx'

export function Dashboard({ invoices, onNewInvoice, onOpenInvoice }) {
  const paid    = invoices.filter(i => i.status === 'paid')
  const pending = invoices.filter(i => i.status === 'pending')
  const overdue = invoices.filter(i => i.status === 'overdue')
  const revenue     = paid.reduce((s, inv) => s + calcTotals(inv.items, inv.tax).total, 0)
  const outstanding = [...pending, ...overdue].reduce((s, inv) => s + calcTotals(inv.items, inv.tax).total, 0)

  return (
    <div>
      <div className="flex-between mb-16">
        <div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Dashboard</h2>
          <p className="text-muted">{today()}</p>
        </div>
        <button className="btn btn-primary" data-tour="new-invoice" onClick={onNewInvoice}>
          <Icon name="plus" /> New Invoice
        </button>
      </div>

      <div className="stat-grid" data-tour="stat-grid">
        <div className="stat-card">
          <div className="label">Total Revenue</div>
          <div className="value">{fmt(revenue)}</div>
          <div className="sub">{paid.length} paid invoices</div>
        </div>
        <div className="stat-card">
          <div className="label">Outstanding</div>
          <div className="value" style={{ color: 'var(--danger)' }}>{fmt(outstanding)}</div>
          <div className="sub" style={{ color: 'var(--danger)' }}>{overdue.length} overdue</div>
        </div>
        <div className="stat-card">
          <div className="label">Pending</div>
          <div className="value" style={{ color: 'var(--accent)' }}>{pending.length}</div>
          <div className="sub">awaiting payment</div>
        </div>
        <div className="stat-card">
          <div className="label">Total Invoices</div>
          <div className="value" style={{ color: 'var(--text)' }}>{invoices.length}</div>
          <div className="sub">all time</div>
        </div>
      </div>

      <div className="card">
        <h3 style={{ fontSize: '.9rem', fontWeight: 600, marginBottom: 10 }}>Recent Activity</h3>
        {invoices.slice().reverse().slice(0, 5).map(inv => {
          const { total } = calcTotals(inv.items, inv.tax)
          return (
            <div key={inv.id} className="flex-between" onClick={() => onOpenInvoice?.(inv)}
              style={{ padding: '8px 0', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: '.85rem' }}>{inv.id}</div>
                <div className="text-muted">{inv.customer}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ color: 'var(--accent)', fontWeight: 700 }}>{fmt(total)}</div>
                <span className={`badge badge-${inv.status}`}>{inv.status}</span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
