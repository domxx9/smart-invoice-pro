/**
 * AI inference pipeline — routes a single prompt to the configured backend.
 *
 * Modes (settings.aiMode):
 *   - 'small' → on-device Gemma via the worker facade (SMA-39)
 *   - 'byok'  → user's cloud provider via byok.generate() (SMA-34)
 *   - 'off'   → returns null so callers can no-op silently
 *
 * Resolves to { text, source } or null. Throws with a sanitized message on
 * failure — the API key is never surfaced in error text or console logs.
 */

import { inferGemma } from '../gemmaWorker.js'
import { generate as byokGenerate } from '../byok.js'
import { getSecret } from '../secure-storage.js'

export async function runInference({ prompt, maxTokens = 512, settings } = {}) {
  if (!prompt || !String(prompt).trim()) {
    throw new Error('runInference: prompt is empty')
  }
  const mode = settings?.aiMode || 'off'

  if (mode === 'off') return null

  if (mode === 'small') {
    const result = await inferGemma(prompt)
    if (result && typeof result === 'object' && result.unavailable) {
      throw new Error('On-device AI unavailable on this device')
    }
    const text = typeof result === 'string' ? result : (result?.text ?? '')
    return { text, source: 'small' }
  }

  if (mode === 'byok') {
    const provider = settings?.byokProvider
    if (!provider) throw new Error('BYOK: pick a provider in Settings')
    const apiKey = await getSecret(`sip_byok_${provider}`)
    if (!apiKey) throw new Error('BYOK: API key not configured')
    try {
      const text = await byokGenerate({
        provider,
        apiKey,
        baseUrl: settings?.byokBaseUrl,
        model: settings?.byokModel,
        prompt,
        maxTokens,
      })
      return { text, source: 'byok' }
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
