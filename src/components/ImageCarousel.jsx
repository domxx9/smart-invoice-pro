import { useState, useCallback } from 'react'
import { useSwipeable } from 'react-swipeable'

export function ImageCarousel({ images, name, onClose }) {
  const [index, setIndex] = useState(0)
  const total = images.length

  const prev = useCallback(() => setIndex((i) => (i > 0 ? i - 1 : total - 1)), [total])
  const next = useCallback(() => setIndex((i) => (i < total - 1 ? i + 1 : 0)), [total])

  const handlers = useSwipeable({
    onSwiping: (e) => {
      if (e.deltaX > 60) next()
      else if (e.deltaX < -60) prev()
    },
    trackMouse: true,
    delta: 60,
  })

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Images for ${name}`}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,.92)',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 50,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 16px',
          background: 'rgba(0,0,0,.4)',
        }}
      >
        <div style={{ flex: 1 }}>
          <span style={{ color: '#fff', fontSize: '.9rem', fontWeight: 600 }}>{name}</span>
        </div>
        <div style={{ flex: 1, textAlign: 'center' }}>
          <span style={{ color: 'rgba(255,255,255,.75)', fontSize: '.82rem' }}>
            {index + 1} / {total}
          </span>
        </div>
        <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end' }}>
          <button
            type="button"
            aria-label="Close image viewer"
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#fff',
              fontSize: '1.4rem',
              cursor: 'pointer',
              padding: '4px 8px',
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>
      </div>

      <div
        {...handlers}
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          touchAction: 'pan-y',
        }}
      >
        <img
          src={images[index]}
          alt={`${name} image ${index + 1}`}
          loading="lazy"
          style={{
            maxWidth: '100%',
            maxHeight: '100%',
            objectFit: 'contain',
          }}
        />
      </div>
    </div>
  )
}
