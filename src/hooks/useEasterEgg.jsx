import { useState, useRef } from 'react'

const EGG_STYLE = {
  position: 'fixed', bottom: 88, left: '50%', transform: 'translateX(-50%)',
  background: 'var(--card)', border: '1px solid var(--accent)',
  borderRadius: 12, padding: '10px 20px', fontSize: '.82rem', color: 'var(--text)',
  zIndex: 9998, whiteSpace: 'nowrap', textAlign: 'center',
  boxShadow: '0 8px 40px rgba(245,166,35,.35)',
  animation: 'egg-pop 0.3s ease-out, egg-fade 3.8s ease-in-out forwards',
}

export function EasterEggToast({ show }) {
  if (!show) return null
  return <div style={EGG_STYLE}>✦ Vibe-coded with Claude · April 2026</div>
}

export function useEasterEgg() {
  const [eggTaps, setEggTaps] = useState(0)
  const [showEgg, setShowEgg] = useState(false)
  const eggTimer = useRef(null)

  const handleVersionTap = () => {
    const next = eggTaps + 1
    setEggTaps(next)
    clearTimeout(eggTimer.current)
    if (next >= 7) {
      setShowEgg(true)
      setEggTaps(0)
      setTimeout(() => setShowEgg(false), 3800)
    } else {
      eggTimer.current = setTimeout(() => setEggTaps(0), 1800)
    }
  }

  return { showEgg, handleVersionTap }
}
