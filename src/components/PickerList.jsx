import { useState, useCallback } from 'react'
import { PickerQuantity } from './PickerQuantity.jsx'

function PickerRow({ item, idx, picked, isUnavailable, onPick, onUnavailable }) {
  const [open, setOpen] = useState(false)
  const ordered = Math.max(0, Math.floor(Number(item?.qty) || 0))
  const done = ordered > 0 && picked >= ordered
  const hasDetails =
    Boolean(item?.description) || (Array.isArray(item?.images) && item.images.length > 0)

  const toggle = useCallback(() => {
    if (hasDetails) setOpen((v) => !v)
  }, [hasDetails])

  const toggleCheckbox = () => onPick(idx, done ? 0 : 1)

  return (
    <div
      className="picker-row"
      data-testid={`picker-row-${idx}`}
      style={{
        border: '1px solid var(--border)',
        borderRadius: 12,
        background: 'var(--surface)',
        marginBottom: 8,
        opacity: isUnavailable ? 0.55 : 1,
        transition: 'opacity .2s',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12 }}>
        <button
          type="button"
          onClick={toggle}
          aria-expanded={hasDetails ? open : undefined}
          aria-label={hasDetails ? `Toggle details for ${item?.name}` : undefined}
          disabled={!hasDetails}
          style={{
            flex: 1,
            minWidth: 0,
            textAlign: 'left',
            background: 'transparent',
            border: 'none',
            padding: 0,
            cursor: hasDetails ? 'pointer' : 'default',
            color: 'inherit',
          }}
        >
          <div
            style={{
              fontSize: '.9rem',
              fontWeight: 600,
              textDecoration: done ? 'line-through' : 'none',
              color: done ? 'var(--success)' : 'var(--text)',
            }}
          >
            {item?.name}
          </div>
          {ordered > 1 && (
            <div style={{ fontSize: '.72rem', color: 'var(--muted)', marginTop: 2 }}>
              Need {ordered}
            </div>
          )}
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {ordered === 1 ? (
            <button
              type="button"
              aria-label={done ? `Mark ${item?.name} as not picked` : `Mark ${item?.name} as picked`}
              aria-pressed={done}
              onClick={toggleCheckbox}
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
                  aria-hidden="true"
                  focusable="false"
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
            <PickerQuantity
              ordered={ordered}
              picked={picked}
              label={item?.name}
              onChange={(n) => onPick(idx, n)}
            />
          )}
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            aria-label={
              isUnavailable ? `Mark ${item?.name} available` : `Mark ${item?.name} unavailable`
            }
            aria-pressed={isUnavailable}
            onClick={() => onUnavailable(idx, !isUnavailable)}
            style={{
              padding: '4px 8px',
              fontSize: '.7rem',
              border: `1px solid ${isUnavailable ? 'var(--danger, #ef4444)' : 'var(--border)'}`,
              background: isUnavailable ? 'var(--danger, #ef4444)' : 'transparent',
              color: isUnavailable ? '#fff' : 'var(--muted)',
              borderRadius: 999,
              cursor: 'pointer',
            }}
          >
            {isUnavailable ? 'N/A' : 'Skip'}
          </button>
        </div>
      </div>
      {hasDetails && (
        <div
          data-testid={`picker-row-${idx}-details`}
          aria-hidden={!open}
          style={{
            maxHeight: open ? 600 : 0,
            overflow: 'hidden',
            transition: 'max-height .25s ease',
            padding: open ? '0 12px 12px' : '0 12px',
          }}
        >
          {item?.description && (
            <p style={{ fontSize: '.82rem', color: 'var(--muted)', margin: '0 0 8px' }}>
              {item.description}
            </p>
          )}
          {Array.isArray(item?.images) && item.images.length > 0 && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {item.images.map((src, i) => (
                <img
                  key={i}
                  src={src}
                  alt=""
                  loading="lazy"
                  style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 8 }}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export function PickerList({ items, picks, unavailable, onPick, onUnavailable }) {
  const list = Array.isArray(items) ? items : []
  if (list.length === 0) {
    return (
      <div
        className="picker-list-empty"
        style={{ padding: 24, textAlign: 'center', color: 'var(--muted)', fontSize: '.9rem' }}
      >
        Nothing to pick.
      </div>
    )
  }
  return (
    <div className="picker-list" data-testid="picker-list">
      {list.map((item, i) => (
        <PickerRow
          key={i}
          item={item}
          idx={i}
          picked={picks?.[i] ?? 0}
          isUnavailable={!!unavailable?.[i]}
          onPick={onPick}
          onUnavailable={onUnavailable}
        />
      ))}
    </div>
  )
}
