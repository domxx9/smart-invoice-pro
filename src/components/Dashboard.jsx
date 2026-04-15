import { calcTotals, fmt, today } from '../helpers.js'
import { Icon } from './Icon.jsx'

// ─── Revenue sparkline ────────────────────────────────────────────────────────

function weeklyRevenue(invoices) {
  const now = Date.now()
  const MS_WEEK = 7 * 24 * 60 * 60 * 1000
  const buckets = Array(8).fill(0)
  invoices.forEach(inv => {
    if (inv.status !== 'paid' || !inv.date) return
    const w = Math.floor((now - new Date(inv.date).getTime()) / MS_WEEK)
    if (w >= 0 && w < 8) {
      buckets[7 - w] += calcTotals(inv.items, inv.tax).total
    }
  })
  return buckets
}

function Sparkline({ data }) {
  const W = 76, H = 24
  const max = Math.max(...data, 0.01)
  const pts = data.map((v, i) => [
    (i / (data.length - 1)) * W,
    H - (v / max) * (H - 4) - 2,
  ])
  const line = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  const area = `${line} L${W},${H} L0,${H} Z`
  const [lx, ly] = pts[pts.length - 1]
  const hasData = data.some(v => v > 0)

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}
      style={{ display: 'block', marginTop: 6, opacity: hasData ? 1 : 0.25 }}>
      <defs>
        <linearGradient id="spark-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="#f5a623" stopOpacity="0.28" />
          <stop offset="100%" stopColor="#f5a623" stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#spark-fill)" />
      <path d={line} fill="none" stroke="#f5a623" strokeWidth="1.5"
        strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lx.toFixed(1)} cy={ly.toFixed(1)} r="2.5" fill="#f5a623" />
    </svg>
  )
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

export function Dashboard({ invoices, onNewInvoice, onOpenInvoice }) {
  const paid    = invoices.filter(i => i.status === 'paid')
  const pending = invoices.filter(i => i.status === 'pending')
  const overdue = pending.filter(i => i.due && new Date(i.due) < new Date())
  const revenue     = paid.reduce((s, inv) => s + calcTotals(inv.items, inv.tax).total, 0)
  const outstanding = [...pending, ...overdue].reduce((s, inv) => s + calcTotals(inv.items, inv.tax).total, 0)
  const sparkData   = weeklyRevenue(invoices)

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
        <div className="stat-card" style={{ gridColumn: 'span 2' }}>
          <div className="label">Total Revenue</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
            <div>
              <div className="value">{fmt(revenue)}</div>
              <div className="sub">{paid.length} paid invoice{paid.length !== 1 ? 's' : ''}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <Sparkline data={sparkData} />
              <div style={{ fontSize: '.62rem', color: 'var(--muted)', marginTop: 2 }}>8-week revenue</div>
            </div>
          </div>
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
      </div>

      <div className="card">
        <h3 style={{ fontSize: '.9rem', fontWeight: 600, marginBottom: 10 }}>Recent Activity</h3>
        {invoices.length === 0 && (
          <p className="text-muted" style={{ fontSize: '.82rem', padding: '8px 0' }}>No invoices yet.</p>
        )}
        {invoices.slice().reverse().slice(0, 5).map(inv => {
          const { total } = calcTotals(inv.items, inv.tax)
          return (
            <div key={inv.id} className="flex-between" onClick={() => onOpenInvoice?.(inv)}
              style={{ padding: '8px 0', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: '.85rem' }}>{inv.id}</div>
                <div className="text-muted">{inv.customer || '—'}</div>
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
