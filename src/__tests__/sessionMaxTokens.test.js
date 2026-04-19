/**
 * SMA-84 — session-wide createFromOptions.maxTokens guard.
 *
 * Pin the session KV-cache budget so it stays >= the largest per-call cap
 * enforced by streamingGuard (SMA-78). If a future change pushes Stage 1 (or
 * anything else) above this ceiling, the per-call guard would silently hit the
 * session cap first and truncate output. Catch that here instead of finding it
 * on a mid-range Android device.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

import { SESSION_MAX_TOKENS as WORKER_SESSION_MAX_TOKENS } from '../workers/mediapipeWorker.js'
import { SESSION_MAX_TOKENS as GEMMA_SESSION_MAX_TOKENS } from '../gemma.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PIPELINE_SRC = readFileSync(resolve(__dirname, '..', 'ai', 'smartPastePipeline.js'), 'utf8')

function readDefault(name) {
  const re = new RegExp(`const\\s+${name}\\s*=\\s*(\\d+)`)
  const m = PIPELINE_SRC.match(re)
  if (!m) throw new Error(`could not find ${name} in smartPastePipeline.js`)
  return Number(m[1])
}

describe('session maxTokens cap (SMA-84)', () => {
  it('worker and gemma entry agree on the session ceiling', () => {
    expect(WORKER_SESSION_MAX_TOKENS).toBe(4096)
    expect(GEMMA_SESSION_MAX_TOKENS).toBe(WORKER_SESSION_MAX_TOKENS)
  })

  it('session ceiling stays >= the largest per-call streamingGuard cap', () => {
    const stage1 = readDefault('STAGE1_DEFAULT_MAX_TOKENS')
    const stage3 = readDefault('STAGE3_DEFAULT_MAX_TOKENS')
    const largestPerCall = Math.max(stage1, stage3)
    expect(WORKER_SESSION_MAX_TOKENS).toBeGreaterThanOrEqual(largestPerCall)
  })
})
