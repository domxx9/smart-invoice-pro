export function PickSheet({ order, picks, onPickChange, onClose }) {
  const orderPicks = picks[order.id] ?? {}
  const totalQty = order.lineItems.reduce((s, li) => s + li.qty, 0)
  const pickedQty = order.lineItems.reduce(
    (s, li, i) => s + Math.min(orderPicks[i] ?? 0, li.qty),
    0,
  )
  const allDone = totalQty > 0 && pickedQty === totalQty

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 300,
        background: 'var(--bg)',
        display: 'flex',
        flexDirection: 'column',
        paddingTop: 'env(safe-area-inset-top, 0)',
      }}
    >
      <div
        style={{
          padding: '12px 16px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: 'var(--surface)',
        }}
      >
        <div>
          <h2 style={{ fontSize: '1rem', fontWeight: 700 }}>Pick #{order.orderNumber}</h2>
          <p style={{ fontSize: '.75rem', color: 'var(--muted)', marginTop: 2 }}>
            {order.customer}
          </p>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={onClose}>
          Done
        </button>
      </div>

      <div
        style={{
          padding: '12px 16px',
          borderBottom: '1px solid var(--border)',
          background: 'var(--surface)',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: '.78rem',
            marginBottom: 6,
          }}
        >
          <span style={{ color: 'var(--muted)' }}>
            {pickedQty} of {totalQty} items picked
          </span>
          {allDone && (
            <span style={{ color: 'var(--success)', fontWeight: 600 }}>All picked ✓</span>
          )}
        </div>
        <div
          style={{ height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}
        >
          <div
            style={{
              height: '100%',
              borderRadius: 3,
              transition: 'width .25s, background .25s',
              width: `${totalQty > 0 ? (pickedQty / totalQty) * 100 : 0}%`,
              background: allDone ? 'var(--success)' : 'var(--accent)',
            }}
          />
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
        {order.lineItems.map((li, i) => {
          const picked = orderPicks[i] ?? 0
          const done = picked >= li.qty
          return (
            <div
              key={i}
              className="card"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                opacity: done ? 0.7 : 1,
                transition: 'opacity .2s',
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: '.88rem',
                    fontWeight: 600,
                    textDecoration: done ? 'line-through' : 'none',
                    color: done ? 'var(--success)' : 'var(--text)',
                  }}
                >
                  {li.name}
                </div>
                {li.qty > 1 && (
                  <div style={{ fontSize: '.72rem', color: 'var(--muted)', marginTop: 2 }}>
                    Need {li.qty}
                  </div>
                )}
              </div>
              {li.qty === 1 ? (
                <button
                  onClick={() => onPickChange(order.id, i, done ? 0 : 1)}
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: '50%',
                    flexShrink: 0,
                    cursor: 'pointer',
                    border: `2px solid ${done ? 'var(--success)' : 'var(--border)'}`,
                    background: done ? 'var(--success)' : 'transparent',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {done && (
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#000"
                      strokeWidth="3"
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </button>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                  <button
                    onClick={() => onPickChange(order.id, i, Math.max(0, picked - 1))}
                    disabled={picked === 0}
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: '50%',
                      border: '1px solid var(--border)',
                      background: 'var(--surface)',
                      cursor: 'pointer',
                      fontSize: '1.3rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'var(--text)',
                      opacity: picked === 0 ? 0.3 : 1,
                    }}
                  >
                    −
                  </button>
                  <span
                    style={{
                      minWidth: 44,
                      textAlign: 'center',
                      fontWeight: 700,
                      fontSize: '.95rem',
                      color: done ? 'var(--success)' : 'var(--text)',
                    }}
                  >
                    {picked}/{li.qty}
                  </span>
                  <button
                    onClick={() => onPickChange(order.id, i, Math.min(li.qty, picked + 1))}
                    disabled={picked >= li.qty}
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: '50%',
                      border: '1px solid var(--border)',
                      background: 'var(--surface)',
                      cursor: 'pointer',
                      fontSize: '1.3rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'var(--text)',
                      opacity: picked >= li.qty ? 0.3 : 1,
                    }}
                  >
                    +
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
