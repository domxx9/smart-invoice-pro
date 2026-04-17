/**
 * BYOK (Bring-Your-Own-Key) cloud inference.
 *
 * Lets the app run LLM features through a user-supplied API key when the
 * on-device model is not installed or the device lacks WebGPU (Android
 * fallback — see SMA-34 / SMA-26).
 *
 * Providers:
 *   - openai, openrouter → OpenAI-compatible Chat Completions
 *   - gemini             → Google generateContent
 *   - anthropic          → Anthropic Messages
 *
 * Keys are never logged. Errors sanitize any accidental key echo.
 */

export const BYOK_PROVIDERS = {
  openai: {
    label: 'OpenAI',
    defaultBaseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
    protocol: 'openai',
  },
  openrouter: {
    label: 'OpenRouter',
    defaultBaseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'openai/gpt-4o-mini',
    protocol: 'openai',
  },
  gemini: {
    label: 'Google Gemini',
    defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    defaultModel: 'gemini-1.5-flash',
    protocol: 'gemini',
  },
  anthropic: {
    label: 'Anthropic',
    defaultBaseUrl: 'https://api.anthropic.com/v1',
    defaultModel: 'claude-3-5-haiku-latest',
    protocol: 'anthropic',
  },
}

export function resolveConfig({ provider, baseUrl, model }) {
  const preset = BYOK_PROVIDERS[provider]
  if (!preset) throw new Error(`Unknown provider: ${provider}`)
  return {
    provider,
    protocol: preset.protocol,
    baseUrl: (baseUrl || preset.defaultBaseUrl).replace(/\/$/, ''),
    model: model || preset.defaultModel,
  }
}

function sanitizeError(err, apiKey) {
  const msg = err?.message || String(err)
  if (apiKey && msg.includes(apiKey)) return msg.replaceAll(apiKey, '[redacted]')
  return msg
}

async function readJsonSafe(res) {
  try {
    return await res.json()
  } catch {
    return null
  }
}

function extractErrorMessage(body, fallback) {
  if (!body) return fallback
  return body.error?.message || body.error || body.message || fallback
}

/**
 * Send a lightweight request to verify the provider + key + model triple
 * works. Resolves to { ok: true } or { ok: false, error: string }.
 */
export async function testConnection({ provider, apiKey, baseUrl, model, fetchImpl = fetch }) {
  if (!apiKey) return { ok: false, error: 'API key is required' }
  try {
    const cfg = resolveConfig({ provider, baseUrl, model })
    const req = buildRequest(cfg, apiKey, 'ping', { maxTokens: 1 })
    const res = await fetchImpl(req.url, req.init)
    if (!res.ok) {
      const body = await readJsonSafe(res)
      return { ok: false, error: extractErrorMessage(body, `HTTP ${res.status}`) }
    }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: sanitizeError(e, apiKey) }
  }
}

/**
 * Run a single-turn generation. Returns the full completion string.
 * Does NOT stream — callers that need streaming should build on buildRequest().
 */
export async function generate({
  provider,
  apiKey,
  baseUrl,
  model,
  prompt,
  maxTokens = 512,
  fetchImpl = fetch,
}) {
  if (!apiKey) throw new Error('BYOK: API key is not configured')
  if (!prompt) throw new Error('BYOK: prompt is empty')
  const cfg = resolveConfig({ provider, baseUrl, model })
  const req = buildRequest(cfg, apiKey, prompt, { maxTokens })
  let res
  try {
    res = await fetchImpl(req.url, req.init)
  } catch (e) {
    throw new Error(`BYOK request failed: ${sanitizeError(e, apiKey)}`)
  }
  const body = await readJsonSafe(res)
  if (!res.ok) {
    throw new Error(`BYOK ${res.status}: ${extractErrorMessage(body, 'request failed')}`)
  }
  const text = extractText(cfg.protocol, body)
  if (!text) throw new Error('BYOK response contained no text')
  return text
}

function buildRequest(cfg, apiKey, prompt, { maxTokens }) {
  if (cfg.protocol === 'openai') {
    return {
      url: `${cfg.baseUrl}/chat/completions`,
      init: {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: cfg.model,
          max_tokens: maxTokens,
          messages: [{ role: 'user', content: prompt }],
        }),
      },
    }
  }
  if (cfg.protocol === 'gemini') {
    return {
      url: `${cfg.baseUrl}/models/${encodeURIComponent(cfg.model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
      init: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: maxTokens },
        }),
      },
    }
  }
  if (cfg.protocol === 'anthropic') {
    return {
      url: `${cfg.baseUrl}/messages`,
      init: {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: cfg.model,
          max_tokens: maxTokens,
          messages: [{ role: 'user', content: prompt }],
        }),
      },
    }
  }
  throw new Error(`Unsupported protocol: ${cfg.protocol}`)
}

function extractText(protocol, body) {
  if (!body) return ''
  if (protocol === 'openai') {
    return body.choices?.[0]?.message?.content?.trim() || ''
  }
  if (protocol === 'gemini') {
    const parts = body.candidates?.[0]?.content?.parts || []
    return parts
      .map((p) => p.text || '')
      .join('')
      .trim()
  }
  if (protocol === 'anthropic') {
    const blocks = body.content || []
    return blocks
      .map((b) => (b.type === 'text' ? b.text : ''))
      .join('')
      .trim()
  }
  return ''
}
