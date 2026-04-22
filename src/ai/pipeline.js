/**
 * AI inference pipeline — routes a single prompt to the configured backend.
 *
 * Modes (settings.aiMode):
 *   - 'small' → on-device Gemma via the worker facade (SMA-39)
 *   - 'byok'  → user's cloud provider via byok.generate() (SMA-34)
 *   - 'off'   → returns null so callers can no-op silently
 *
 * Resolves to { text, source, stopReason } or null. `stopReason` is the
 * provider's raw finish/stop reason (e.g. 'stop', 'length', 'max_tokens',
 * 'MAX_TOKENS') when available, and `null` otherwise — callers read it to
 * detect mid-generation truncation (SMA-71). Throws with a sanitized
 * message on failure — the API key is never surfaced in error text or
 * console logs.
 */

import { inferGemma, cancelGemma } from '../gemmaWorker.js'
import { generate as byokGenerate } from '../byok.js'
import { getSecret } from '../secure-storage.js'
import { isAvailable, infer as executorchInfer } from '../plugins/executorch.js'

// Default wall-clock ceiling for a single on-device inference call (SMA-78).
// Dogfood traces showed Stage 1 hanging for ~2 hours producing degenerate
// parroted output; 60s is long enough for a legitimate 16-line paste on a
// mid-range WebGPU device and short enough to fail fast so the widget can
// suggest BYOK. Overridable via settings.smallModeTimeoutMs (0 disables).
const SMALL_MODE_DEFAULT_TIMEOUT_MS = 60_000

export class StageTimeoutError extends Error {
  constructor(message, { source, timeoutMs } = {}) {
    super(message)
    this.name = 'StageTimeoutError'
    this.code = 'stage1_timeout'
    this.source = source
    this.timeoutMs = timeoutMs
  }
}

function resolveSmallTimeout(settings) {
  const raw = settings?.smallModeTimeoutMs
  if (raw === 0) return 0 // explicit opt-out
  const n = Number(raw)
  if (Number.isFinite(n) && n > 0) return n
  return SMALL_MODE_DEFAULT_TIMEOUT_MS
}

export async function runInference({ prompt, maxTokens = 512, settings } = {}) {
  if (!prompt || !String(prompt).trim()) {
    throw new Error('runInference: prompt is empty')
  }
  const mode = settings?.aiMode || 'off'

  if (mode === 'off') return null

  if (mode === 'small') {
    const timeoutMs = resolveSmallTimeout(settings)
    const inferPromise = inferGemma(prompt, { maxTokens })

    let result
    if (timeoutMs > 0) {
      let timeoutId
      const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
          try {
            cancelGemma()
          } catch {
            /* best-effort — the worker may already be idle */
          }
          reject(
            new StageTimeoutError(`On-device inference exceeded ${timeoutMs}ms — aborted`, {
              source: 'small',
              timeoutMs,
            }),
          )
        }, timeoutMs)
      })
      try {
        result = await Promise.race([inferPromise, timeoutPromise])
      } finally {
        if (timeoutId) clearTimeout(timeoutId)
      }
    } else {
      result = await inferPromise
    }

    if (result && typeof result === 'object' && result.unavailable) {
      throw new Error('On-device AI unavailable on this device')
    }
    const text = typeof result === 'string' ? result : (result?.text ?? '')
    const stopReason =
      result && typeof result === 'object' && 'stopReason' in result ? result.stopReason : null
    return { text, source: 'small', stopReason }
  }

  if (mode === 'executorch') {
    if (!isAvailable()) throw new Error('ExecuTorch not available on this platform')
    try {
      const result = await executorchInfer({ prompt, maxTokens })
      return { text: result.text ?? '', source: 'executorch', stopReason: null }
    } catch (e) {
      throw new Error(sanitize(e, null))
    }
  }

  if (mode === 'byok') {
    const provider = settings?.byokProvider
    if (!provider) throw new Error('BYOK: pick a provider in Settings')
    const apiKey = await getSecret(`sip_byok_${provider}`)
    if (!apiKey) throw new Error('BYOK: API key not configured')
    try {
      // `byokGenerate` returns `{ text, stopReason }` since SMA-71. Fall back
      // for test stubs that still return a bare string so we don't regress
      // existing pipeline tests.
      const result = await byokGenerate({
        provider,
        apiKey,
        baseUrl: settings?.byokBaseUrl,
        model: settings?.byokModel,
        prompt,
        maxTokens,
      })
      const text = typeof result === 'string' ? result : (result?.text ?? '')
      const stopReason =
        result && typeof result === 'object' && 'stopReason' in result ? result.stopReason : null
      return { text, source: 'byok', stopReason }
    } catch (e) {
      throw new Error(sanitize(e, apiKey))
    }
  }

  throw new Error(`runInference: unknown aiMode "${mode}"`)
}

function sanitize(err, apiKey) {
  const msg = err?.message || String(err)
  if (!apiKey) return msg
  return msg.replaceAll(apiKey, '[redacted]')
}
