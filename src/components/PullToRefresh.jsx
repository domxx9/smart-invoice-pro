import { useState, useEffect, useRef } from 'react'

export function PullToRefresh({ onRefresh, enabled = true, children }) {
  const [ptState, setPtState] = useState('idle')
  const [pullPct, setPullPct] = useState(0)
  const startY = useRef(null)
  const THRESHOLD = 80

  useEffect(() => {
    if (!enabled) return
    const onStart = (e) => {
      if (window.scrollY <= 0) startY.current = e.touches[0].clientY
    }
    const onMove = (e) => {
      if (startY.current === null) return
      const dy = e.touches[0].clientY - startY.current
      if (dy > 0) { setPtState('pulling'); setPullPct(Math.min(dy / THRESHOLD, 1)) }
    }
    const onEnd = async (e) => {
      if (startY.current === null) return
      const dy = e.changedTouches[0].clientY - startY.current
      const didPull = dy >= THRESHOLD
      startY.current = null
      setPullPct(0)
      if (didPull) {
        setPtState('refreshing')
        try { await onRefresh() } finally { setPtState('idle') }
      } else {
        setPtState('idle')
      }
    }
    document.addEventListener('touchstart', onStart, { passive: true })
    document.addEventListener('touchmove',  onMove,  { passive: true })
    document.addEventListener('touchend',   onEnd,   { passive: true })
    return () => {
      document.removeEventListener('touchstart', onStart)
      document.removeEventListener('touchmove',  onMove)
      document.removeEventListener('touchend',   onEnd)
    }
  }, [enabled, onRefresh])

  const visible = ptState === 'pulling' || ptState === 'refreshing'
  return (
    <>
      {visible && (
        <div style={{
          position: 'fixed',
          top: 'calc(56px + env(safe-area-inset-top, 0))',
          left: 0, right: 0, display: 'flex', justifyContent: 'center',
          padding: '8px 0', zIndex: 50, pointerEvents: 'none',
        }}>
          <div className="ptr-spinner" style={{
            animation: ptState === 'refreshing' ? 'spin .7s linear infinite' : 'none',
            transform: ptState === 'pulling' ? `rotate(${pullPct * 270}deg)` : undefined,
            opacity: ptState === 'pulling' ? 0.4 + pullPct * 0.6 : 1,
          }} />
        </div>
      )}
      {children}
    </>
  )
}
