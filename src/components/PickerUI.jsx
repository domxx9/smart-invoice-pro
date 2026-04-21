import { PickerCard } from './PickerCard.jsx'
import { PickerList } from './PickerList.jsx'

export function PickerUI({
  items,
  picks,
  unavailable,
  onPick,
  onUnavailable,
  viewMode = 'list',
  onClose,
  header = null,
  footer = null,
}) {
  const list = Array.isArray(items) ? items : []
  let totalQty = 0
  let pickedQty = 0
  for (let i = 0; i < list.length; i++) {
    const maxQ = Math.max(0, Math.floor(Number(list[i]?.qty) || 0))
    totalQty += maxQ
    pickedQty += Math.min(Math.max(0, Number(picks?.[i]) || 0), maxQ)
  }
  const allDone = totalQty > 0 && pickedQty === totalQty
  const activeMode = viewMode === 'card' ? 'card' : 'list'

  return (
    <div
      data-testid="picker-ui"
      data-view-mode={activeMode}
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
          gap: 12,
        }}
      >
        <div style={{ minWidth: 0, flex: 1 }}>{header}</div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
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
        {activeMode === 'card' ? (
          <PickerCard items={list} picks={picks} onPick={onPick} onUnavailable={onUnavailable} />
        ) : (
          <PickerList
            items={list}
            picks={picks}
            unavailable={unavailable}
            onPick={onPick}
            onUnavailable={onUnavailable}
          />
        )}
      </div>

      {footer && (
        <div
          style={{
            borderTop: '1px solid var(--border)',
            background: 'var(--surface)',
            padding: '10px 16px calc(10px + env(safe-area-inset-bottom, 0))',
          }}
        >
          {footer}
        </div>
      )}
    </div>
  )
}
