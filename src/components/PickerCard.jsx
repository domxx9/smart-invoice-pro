import { useCallback, useState } from 'react'
import { useSwipeable } from 'react-swipeable'
import { Haptics, ImpactStyle } from '@capacitor/haptics'
import { PickerQuantity } from './PickerQuantity.jsx'

const SWIPE_CONFIRM_PX = 90
const DRAG_ROTATION_DEG = 4

function triggerHaptic() {
  try {
    Haptics.impact({ style: ImpactStyle.Medium })
  } catch {
    // haptics unavailable (web, test env) — non-fatal
  }
}

function SwipeCard({ item, idx, picked, isTop, offset, onPick, onUnavailable, onAdvance }) {
  const [drag, setDrag] = useState(0)

  const confirmPick = useCallback(() => {
    triggerHaptic()
    onPick(idx, Number(item?.qty) || 0)
    onAdvance()
  }, [idx, item, onPick, onAdvance])

  const confirmUnavailable = useCallback(() => {
    triggerHaptic()
    onUnavailable(idx, true)
    onAdvance()
  }, [idx, onUnavailable, onAdvance])

  const handlers = useSwipeable({
    onSwiping: (e) => {
      if (!isTop) return
      setDrag(e.deltaX)
    },
    onSwipedRight: () => {
      if (!isTop) return
      setDrag(0)
      confirmPick()
    },
    onSwipedLeft: () => {
      if (!isTop) return
      setDrag(0)
      confirmUnavailable()
    },
    onSwiped: () => setDrag(0),
    trackMouse: true,
    preventScrollOnSwipe: true,
    delta: SWIPE_CONFIRM_PX,
  })

  const ratio = Math.max(-1, Math.min(1, drag / 160))
  const rotation = ratio * DRAG_ROTATION_DEG
  const tint =
    ratio > 0.1
      ? `rgba(34, 197, 94, ${Math.min(0.35, ratio * 0.4)})`
      : ratio < -0.1
        ? `rgba(239, 68, 68, ${Math.min(0.35, -ratio * 0.4)})`
        : 'transparent'

  const ordered = Number(item?.qty) || 0

  return (
    <div
      {...(isTop ? handlers : {})}
      data-testid={`picker-card-${idx}`}
      className="picker-card"
      style={{
        position: 'absolute',
        inset: 0,
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 16,
        padding: 20,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        boxShadow: isTop ? '0 10px 30px rgba(0,0,0,0.18)' : '0 4px 12px rgba(0,0,0,0.10)',
        transform: isTop
          ? `translate(${drag}px, 0) rotate(${rotation}deg)`
          : `translate(0, ${offset * 8}px) scale(${1 - offset * 0.04})`,
        transition: isTop && drag === 0 ? 'transform .2s' : 'none',
        zIndex: 100 - offset,
        touchAction: 'pan-y',
        userSelect: 'none',
      }}
    >
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: 16,
          background: tint,
          pointerEvents: 'none',
          transition: 'background .1s',
        }}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <h3 style={{ fontSize: '1.05rem', fontWeight: 700, margin: 0 }}>{item?.name}</h3>
          {ordered > 0 && (
            <p style={{ fontSize: '.78rem', color: 'var(--muted)', marginTop: 4 }}>
              Need {ordered}
            </p>
          )}
        </div>
      </div>
      {item?.description && (
        <p style={{ fontSize: '.85rem', color: 'var(--muted)', margin: 0 }}>{item.description}</p>
      )}
      {Array.isArray(item?.images) && item.images.length > 0 ? (
        <>
          <div style={{ borderRadius: 12, overflow: 'hidden', height: 200, flexShrink: 0 }}>
            <img
              src={item.images[0]}
              alt=""
              loading="lazy"
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {item.images.slice(1, 4).map((src, i) => (
              <img
                key={i}
                src={src}
                alt=""
                loading="lazy"
                style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 8 }}
              />
            ))}
          </div>
        </>
      ) : (
        <div
          aria-hidden="true"
          style={{
            height: 200,
            borderRadius: 12,
            background: '#e5e7eb',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <svg
            width="40"
            height="40"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#9ca3af"
            strokeWidth="1.5"
          >
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <polyline points="21 15 16 10 5 21" />
          </svg>
        </div>
      )}
      {ordered > 1 && (
        <div style={{ marginTop: 'auto' }}>
          <PickerQuantity
            ordered={ordered}
            picked={picked}
            label={item?.name}
            onChange={(n) => onPick(idx, n)}
          />
        </div>
      )}
      {isTop && (
        <div
          style={{
            marginTop: ordered > 1 ? 8 : 'auto',
            display: 'flex',
            gap: 10,
            justifyContent: 'space-between',
            fontSize: '.72rem',
            color: 'var(--muted)',
          }}
        >
          <span>← Swipe left: unavailable</span>
          <span>Swipe right: picked →</span>
        </div>
      )}
    </div>
  )
}

export function PickerCard({ items, picks, onPick, onUnavailable }) {
  const list = Array.isArray(items) ? items : []
  const [cursor, setCursor] = useState(0)
  const visible = list.slice(cursor, cursor + 3)
  const advance = useCallback(() => setCursor((c) => Math.min(c + 1, list.length)), [list.length])

  if (list.length === 0 || cursor >= list.length) {
    return (
      <div
        className="picker-card-empty"
        style={{
          padding: 24,
          textAlign: 'center',
          color: 'var(--muted)',
          fontSize: '.9rem',
        }}
      >
        {list.length === 0 ? 'Nothing to pick.' : 'All items reviewed.'}
      </div>
    )
  }

  return (
    <div
      className="picker-card-stack"
      data-testid="picker-card-stack"
      style={{
        position: 'relative',
        width: '100%',
        maxWidth: 420,
        height: 360,
        margin: '0 auto',
      }}
    >
      {visible
        .map((item, i) => {
          const realIdx = cursor + i
          return (
            <SwipeCard
              key={realIdx}
              item={item}
              idx={realIdx}
              picked={picks?.[realIdx] ?? 0}
              isTop={i === 0}
              offset={i}
              onPick={onPick}
              onUnavailable={onUnavailable}
              onAdvance={advance}
            />
          )
        })
        .reverse()}
    </div>
  )
}
