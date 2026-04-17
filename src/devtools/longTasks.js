/**
 * Dev-only long-task monitor (SMA-39 Track B).
 *
 * Observes main-thread long tasks (>= 50 ms) via PerformanceObserver and
 * reports p95 duration for a labelled window. Not shipped to users — call
 * sites guard this behind `import.meta.env.DEV` or an explicit opt-in flag.
 *
 * Usage:
 *   const stop = observeLongTasks('gemma-load')
 *   await initGemma(...)
 *   stop() // logs p50 / p95 / max
 */

import { logger } from '../utils/logger.js'

export function observeLongTasks(label) {
  if (typeof PerformanceObserver === 'undefined') {
    return () => ({ p50: null, p95: null, max: null, samples: 0 })
  }
  const durations = []
  let observer
  try {
    observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        durations.push(entry.duration)
      }
    })
    observer.observe({ type: 'longtask', buffered: true })
  } catch {
    return () => ({ p50: null, p95: null, max: null, samples: 0 })
  }

  return function stop() {
    try {
      observer.disconnect()
    } catch {
      /* ignore */
    }
    if (durations.length === 0) {
      const empty = { p50: 0, p95: 0, max: 0, samples: 0 }
      logger.debug('perf', `longtask:${label}`, empty)
      return empty
    }
    const sorted = [...durations].sort((a, b) => a - b)
    const pick = (q) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]
    const summary = {
      p50: +pick(0.5).toFixed(1),
      p95: +pick(0.95).toFixed(1),
      max: +sorted[sorted.length - 1].toFixed(1),
      samples: sorted.length,
    }
    logger.debug('perf', `longtask:${label}`, summary)
    return summary
  }
}
