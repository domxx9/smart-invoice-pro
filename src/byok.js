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
 * List the models available to the caller for the given provider + key +
 * base URL. Resolves to `{ ok: true, models: string[] }` or
 * `{ ok: false, error: string }`. Never throws; the key is redacted from
 * any error message (SMA-96).
 */
export async function listModels({ provider, apiKey, baseUrl, fetchImpl = fetch }) {
  if (!apiKey) return { ok: false, error: 'API key is required' }
  try {
    const cfg = resolveConfig({ provider, baseUrl })
    const req = buildListRequest(cfg, apiKey)
    const res = await fetchImpl(req.url, req.init)
    const body = await readJsonSafe(res)
    if (!res.ok) {
      return { ok: false, error: extractErrorMessage(body, `HTTP ${res.status}`) }
    }
    const models = extractModelList(cfg.protocol, body)
    return { ok: true, models: dedupeAndSort(models) }
  } catch (e) {
    return { ok: false, error: sanitizeError(e, apiKey) }
  }
}

function buildListRequest(cfg, apiKey) {
  if (cfg.protocol === 'openai') {
    return {
      url: `${cfg.baseUrl}/models`,
      init: {
        method: 'GET',
        headers: { Authorization: `Bearer ${apiKey}` },
      },
    }
  }
  if (cfg.protocol === 'gemini') {
    return {
      url: `${cfg.baseUrl}/models?key=${encodeURIComponent(apiKey)}`,
      init: { method: 'GET' },
    }
  }
  if (cfg.protocol === 'anthropic') {
    return {
      url: `${cfg.baseUrl}/models`,
      init: {
        method: 'GET',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
      },
    }
  }
  throw new Error(`Unsupported protocol: ${cfg.protocol}`)
}

function extractModelList(protocol, body) {
  if (!body) return []
  if (protocol === 'openai') {
    return (body.data || [])
      .map((m) => (typeof m === 'string' ? m : m?.id))
      .filter(Boolean)
  }
  if (protocol === 'gemini') {
    return (body.models || [])
      .filter((m) => (m?.supportedGenerationMethods || []).includes('generateContent'))
      .map((m) => (typeof m?.name === 'string' ? m.name.replace(/^models\//, '') : null))
      .filter(Boolean)
  }
  if (protocol === 'anthropic') {
    return (body.data || [])
      .map((m) => (typeof m === 'string' ? m : m?.id))
      .filter(Boolean)
  }
  return []
}

function dedupeAndSort(models) {
  return Array.from(new Set(models)).sort((a, b) => a.localeCompare(b))
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
 * Run a single-turn generation. Returns `{ text, stopReason }` where
 * `stopReason` is the provider's raw finish/stop reason (e.g. 'stop',
 * 'length', 'max_tokens', 'MAX_TOKENS', 'end_turn') or `null` when the
 * provider didn't surface one. Callers that need to know a response was
 * truncated mid-generation read `stopReason` — see SMA-71.
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
  const { text, stopReason, detail } = extractText(cfg.protocol, body)
  if (!text) {
    throw new Error(`BYOK response contained no text${detail ? ` (${detail})` : ''}`)
  }
  return { text, stopReason }
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

/**
 * Pull the assistant text out of a provider response. Returns
 * `{ text, stopReason, detail }` where `stopReason` is the provider's raw
 * finish/stop reason (or `null` when absent) and `detail` is a short
 * diagnostic ("finish_reason=length", "stop_reason=max_tokens", "no
 * candidates", …) when the response parsed but yielded no usable text.
 * Callers surface `detail` so users know *why* the response was empty
 * (truncation, safety filter, refusal, etc). `stopReason` is also surfaced
 * on the success path so callers can detect mid-generation truncation
 * (SMA-71).
 */
function extractText(protocol, body) {
  if (!body) return { text: '', stopReason: null, detail: 'empty body' }

  if (protocol === 'openai') {
    const choice = body.choices?.[0]
    if (!choice) return { text: '', stopReason: null, detail: 'no choices' }
    const msg = choice.message || choice.delta || {}
    const stopReason = choice.finish_reason ?? null
    // OpenAI-compatible APIs may return `content` as either a string or an
    // array of structured parts (vision, tool, multimodal models).
    const raw = msg.content
    let text = ''
    if (typeof raw === 'string') text = raw
    else if (Array.isArray(raw)) {
      text = raw.map((c) => (typeof c === 'string' ? c : c?.text || '')).join('')
    }
    text = text.trim()
    if (text) return { text, stopReason, detail: null }
    if (msg.refusal) {
      return { text: '', stopReason, detail: 'model refused the request' }
    }
    return {
      text: '',
      stopReason,
      detail: stopReason ? `finish_reason=${stopReason}` : 'empty content',
    }
  }

  if (protocol === 'gemini') {
    const cand = body.candidates?.[0]
    if (!cand) {
      // Top-level promptFeedback.blockReason fires when the *prompt* tripped
      // a safety filter and no candidate was generated at all.
      const blocked = body.promptFeedback?.blockReason
      return {
        text: '',
        stopReason: null,
        detail: blocked ? `promptFeedback=${blocked}` : 'no candidates',
      }
    }
    const stopReason = cand.finishReason ?? null
    const parts = cand.content?.parts || []
    const text = parts
      .map((p) => p?.text || '')
      .join('')
      .trim()
    if (text) return { text, stopReason, detail: null }
    return {
      text: '',
      stopReason,
      detail: stopReason ? `finishReason=${stopReason}` : 'empty parts',
    }
  }

  if (protocol === 'anthropic') {
    const blocks = body.content || []
    const stopReason = body.stop_reason ?? null
    const text = blocks
      .map((b) => (b?.type === 'text' ? b?.text || '' : ''))
      .join('')
      .trim()
    if (text) return { text, stopReason, detail: null }
    return {
      text: '',
      stopReason,
      detail: stopReason ? `stop_reason=${stopReason}` : 'empty content',
    }
  }

  return { text: '', stopReason: null, detail: `unsupported protocol ${protocol}` }
}
