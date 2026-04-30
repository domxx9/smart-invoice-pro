import { useState } from 'react'
import { fmt, timeAgo } from '../helpers.js'
import { useOrders } from '../contexts/OrderContext.jsx'
import { useSettings } from '../contexts/SettingsContext.jsx'
import { Icon } from './Icon.jsx'
import { PickSheet } from './PickSheet.jsx'

export function Orders() {
  const { orderSync } = useOrders()
  const { settings } = useSettings()
  const hasApiKey =
    settings.activeIntegration === 'shopify'
      ? !!(settings.shopifyShopDomain && settings.shopifyAccessToken)
      : !!settings.sqApiKey
  const {
    orders,
    handleSyncOrders,
    orderSyncStatus,
    orderSyncCount,
    lastOrderSync,
    picks,
    savePick,
  } = orderSync
  const [expanded, setExpanded] = useState(null)
  const [picking, setPicking] = useState(null)
  const [filter, setFilter] = useState('all')
  const syncLabel = {
    idle: 'Sync',
    syncing: orderSyncCount > 0 ? `${orderSyncCount} fetched…` : 'Syncing…',
    ok: 'Synced ✓',
    error: 'Retry',
  }

  const visible = filter === 'all' ? orders : orders.filter((o) => o.status === filter)

  return (
    <div>
      <div className="flex-between mb-16">
        <div>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 700 }}>
            Orders{' '}
            <span style={{ color: 'var(--muted)', fontWeight: 400, fontSize: '.8rem' }}>
              ({visible.length})
            </span>
          </h2>
          {lastOrderSync && (
            <p style={{ fontSize: '.7rem', color: 'var(--muted)', marginTop: 2 }}>
              Last synced {timeAgo(lastOrderSync)}
            </p>
          )}
        </div>
        <button
          className="btn btn-ghost btn-sm"
          onClick={handleSyncOrders}
          disabled={!hasApiKey || orderSyncStatus === 'syncing'}
          title={!hasApiKey ? 'Add Squarespace API key in Settings first' : ''}
        >
          <Icon name="refresh" /> {syncLabel[orderSyncStatus] ?? 'Sync'}
        </button>
      </div>

      {!hasApiKey && (
        <p className="text-muted" style={{ fontSize: '.8rem', marginBottom: 12 }}>
          Add your Squarespace API key in Settings to sync orders.
        </p>
      )}
      {orderSyncStatus === 'error' && (
        <p style={{ color: 'var(--danger)', fontSize: '.8rem', marginBottom: 12 }}>
          Sync failed — check API key.
        </p>
      )}

      <div
        role="group"
        aria-label="Filter orders"
        style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}
      >
        {['all', 'PENDING', 'FULFILLED', 'CANCELED'].map((f) => (
          <button
            key={f}
            type="button"
            className="chip"
            aria-pressed={filter === f}
            style={filter === f ? { background: 'rgba(245,166,35,.3)' } : {}}
            onClick={() => setFilter(f)}
          >
            {f === 'all' ? 'All' : f.charAt(0) + f.slice(1).toLowerCase()}
          </button>
        ))}
      </div>

      {visible.length === 0 && (
        <p className="text-muted" style={{ padding: '20px 0' }}>
          {orders.length === 0 ? 'No orders synced yet.' : 'No orders match this filter.'}
        </p>
      )}

      {visible.map((o) => {
        const isOpen = expanded === o.id
        const isPending = o.status === 'PENDING'
        const dateStr = o.createdOn ? new Date(o.createdOn).toLocaleDateString() : '—'
        const orderPicks = picks[o.id] ?? {}
        const totalQty = o.lineItems.reduce((s, li) => s + li.qty, 0)
        const pickedQty = o.lineItems.reduce(
          (s, li, i) => s + Math.min(orderPicks[i] ?? 0, li.qty),
          0,
        )
        const pickStarted = pickedQty > 0

        return (
          <div
            key={o.id}
            className="card"
            style={{ padding: 0, overflow: 'hidden', marginBottom: 10 }}
          >
            <button
              type="button"
              className="order-header-btn"
              aria-expanded={isOpen}
              aria-label={`Order ${o.orderNumber}, ${o.status.toLowerCase()}, ${o.customer}`}
              onClick={() => setExpanded(isOpen ? null : o.id)}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '12px 14px',
                cursor: 'pointer',
                width: '100%',
                background: 'none',
                border: 'none',
                color: 'inherit',
                font: 'inherit',
                textAlign: 'left',
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                  <span style={{ fontWeight: 700, fontSize: '.9rem' }}>#{o.orderNumber}</span>
                  <span className={`badge badge-${o.status}`}>
                    {o.status.charAt(0) + o.status.slice(1).toLowerCase()}
                  </span>
                  {pickStarted && (
                    <span
                      style={{
                        fontSize: '.68rem',
                        color: pickedQty === totalQty ? 'var(--success)' : 'var(--accent)',
                        fontWeight: 600,
                      }}
                    >
                      {pickedQty === totalQty ? '✓ Picked' : `${pickedQty}/${totalQty} picked`}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: '.8rem', color: 'var(--muted)' }}>
                  {o.customer} · {dateStr}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                <span style={{ color: 'var(--accent)', fontWeight: 700, fontSize: '.9rem' }}>
                  {fmt(o.total)}
                </span>
                <svg
                  aria-hidden="true"
                  focusable="false"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  style={{
                    color: 'var(--muted)',
                    transform: isOpen ? 'rotate(180deg)' : 'none',
                    transition: 'transform .2s',
                    flexShrink: 0,
                  }}
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </div>
            </button>

            {isOpen && (
              <div
                style={{
                  borderTop: '1px solid var(--border)',
                  background: 'var(--surface)',
                  padding: '10px 14px',
                }}
              >
                {o.email && (
                  <p style={{ fontSize: '.78rem', color: 'var(--muted)', marginBottom: 8 }}>
                    {o.email}
                  </p>
                )}
                {o.lineItems.map((li, i) => (
                  <div
                    key={i}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: '.82rem',
                      marginBottom: 4,
                    }}
                  >
                    <span style={{ color: 'var(--muted)' }}>
                      {li.name} × {li.qty}
                    </span>
                    <span style={{ color: 'var(--text)' }}>{fmt(li.price * li.qty)}</span>
                  </div>
                ))}
                <div
                  style={{
                    borderTop: '1px solid var(--border)',
                    marginTop: 8,
                    paddingTop: 8,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <span style={{ fontSize: '.82rem', color: 'var(--muted)' }}>Total</span>
                  <span style={{ fontWeight: 700, color: 'var(--accent)' }}>{fmt(o.total)}</span>
                </div>
                {isPending && (
                  <button
                    className="btn btn-primary btn-full"
                    style={{ marginTop: 10 }}
                    onClick={(e) => {
                      e.stopPropagation()
                      setPicking(o)
                    }}
                  >
                    {pickStarted ? `Resume Pick (${pickedQty}/${totalQty})` : 'Start Pick'}
                  </button>
                )}
              </div>
            )}
          </div>
        )
      })}

      {picking && (
        <PickSheet
          order={picking}
          picks={picks}
          onPickChange={savePick}
          onClose={() => setPicking(null)}
        />
      )}
    </div>
  )
}
