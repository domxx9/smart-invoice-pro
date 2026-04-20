import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

function clampQty(qty, maxQty) {
  const n = Number(qty)
  const max = Math.max(0, Math.floor(Number(maxQty) || 0))
  if (!Number.isFinite(n) || n <= 0) return 0
  const floored = Math.floor(n)
  return floored >= max ? max : floored
}

function readPersisted(key) {
  if (!key || typeof localStorage === 'undefined') return null
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object') return parsed
  } catch {
    // corrupt JSON — fall through to defaults
  }
  return null
}

export function usePicker(items, options = {}) {
  const { persistKey, initialPicks, initialUnavailable, onChange } = options
  const itemList = useMemo(() => (Array.isArray(items) ? items : []), [items])

  const [picks, setPicks] = useState(() => {
    const persisted = readPersisted(persistKey)
    if (persisted && persisted.picks && typeof persisted.picks === 'object') {
      return { ...persisted.picks }
    }
    return { ...(initialPicks ?? {}) }
  })
  const [unavailable, setUnavailable] = useState(() => {
    const persisted = readPersisted(persistKey)
    if (persisted && persisted.unavailable && typeof persisted.unavailable === 'object') {
      return { ...persisted.unavailable }
    }
    return { ...(initialUnavailable ?? {}) }
  })

  const itemsRef = useRef(itemList)
  itemsRef.current = itemList

  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  const firstEffect = useRef(true)
  useEffect(() => {
    if (persistKey && typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(persistKey, JSON.stringify({ picks, unavailable }))
      } catch {
        // storage unavailable or full — in-memory state still works
      }
    }
    if (firstEffect.current) {
      firstEffect.current = false
      return
    }
    if (typeof onChangeRef.current === 'function') {
      onChangeRef.current({ picks, unavailable })
    }
  }, [picks, unavailable, persistKey])

  const handlePick = useCallback((idx, qty) => {
    const item = itemsRef.current[idx]
    const max = item ? Number(item.qty) || 0 : 0
    const clamped = clampQty(qty, max)
    setPicks((prev) => {
      if ((prev[idx] ?? 0) === clamped) return prev
      return { ...prev, [idx]: clamped }
    })
  }, [])

  const handleUnavailable = useCallback((idx, bool) => {
    const flag = !!bool
    setUnavailable((prev) => {
      if (!!prev[idx] === flag) return prev
      const next = { ...prev }
      if (flag) next[idx] = true
      else delete next[idx]
      return next
    })
  }, [])

  const reset = useCallback(() => {
    setPicks({})
    setUnavailable({})
  }, [])

  const { totalQty, pickedQty, allDone } = useMemo(() => {
    let total = 0
    let picked = 0
    for (let i = 0; i < itemList.length; i++) {
      const maxQ = Number(itemList[i]?.qty) || 0
      total += maxQ
      picked += Math.min(Math.max(0, Number(picks[i]) || 0), maxQ)
    }
    return {
      totalQty: total,
      pickedQty: picked,
      allDone: total > 0 && picked === total,
    }
  }, [itemList, picks])

  return {
    picks,
    unavailable,
    handlePick,
    handleUnavailable,
    reset,
    pickedQty,
    totalQty,
    allDone,
  }
}
