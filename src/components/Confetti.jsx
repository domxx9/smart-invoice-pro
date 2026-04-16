import { useEffect, useState } from 'react'

const COLORS = [
  '#f5a623',
  '#4caf84',
  '#e05252',
  '#64a0ff',
  '#9b59b6',
  '#e67e22',
  '#fff',
  '#1abc9c',
  '#f472b6',
]
const r = (min, max) => Math.random() * (max - min) + min

export function Confetti({ trigger }) {
  const [particles, setParticles] = useState([])

  useEffect(() => {
    if (!trigger) return
    const pieces = Array.from({ length: 70 }, (_, i) => ({
      id: i,
      x: r(2, 98),
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      w: r(6, 12),
      h: r(8, 15),
      dur: r(0.9, 1.8),
      delay: r(0, 0.55),
      drift: r(-90, 90),
      rot: r(200, 960),
      round: Math.random() > 0.5,
    }))
    setParticles(pieces)
    const t = setTimeout(() => setParticles([]), 2800)
    return () => clearTimeout(t)
  }, [trigger])

  if (!particles.length) return null

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 9999,
        overflow: 'hidden',
      }}
    >
      {particles.map((p) => (
        <div
          key={p.id}
          style={{
            position: 'absolute',
            left: `${p.x}%`,
            top: -18,
            width: p.round ? p.w : p.w * 0.5,
            height: p.round ? p.w : p.h,
            borderRadius: p.round ? '50%' : '2px',
            background: p.color,
            '--cdrift': `${p.drift}px`,
            '--crot': `${p.rot}deg`,
            animation: `confetti-fall ${p.dur}s ${p.delay}s cubic-bezier(.25,.46,.45,.94) forwards`,
          }}
        />
      ))}
    </div>
  )
}
