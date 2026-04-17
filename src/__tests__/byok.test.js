import { describe, it, expect } from 'vitest'
import { BYOK_PROVIDERS, resolveConfig, testConnection, generate } from '../byok.js'

function makeFetch(responses) {
  const calls = []
  const queue = [...responses]
  const fetchImpl = async (url, init) => {
    calls.push({ url, init })
    const next = queue.shift()
    if (!next) throw new Error('no more fetch responses queued')
    if (next.throw) throw next.throw
    return {
      ok: next.status >= 200 && next.status < 300,
      status: next.status,
      json: async () => next.body,
    }
  }
  return { fetchImpl, calls }
}

describe('BYOK_PROVIDERS', () => {
  it('exposes known providers with defaults', () => {
    expect(Object.keys(BYOK_PROVIDERS)).toEqual(
      expect.arrayContaining(['openai', 'openrouter', 'gemini', 'anthropic']),
    )
    for (const p of Object.values(BYOK_PROVIDERS)) {
      expect(p.defaultBaseUrl).toMatch(/^https:\/\//)
      expect(p.defaultModel).toBeTruthy()
      expect(['openai', 'gemini', 'anthropic']).toContain(p.protocol)
    }
  })
})

describe('resolveConfig', () => {
  it('falls back to provider defaults when baseUrl/model empty', () => {
    const cfg = resolveConfig({ provider: 'openai' })
    expect(cfg.baseUrl).toBe('https://api.openai.com/v1')
    expect(cfg.model).toBe('gpt-4o-mini')
    expect(cfg.protocol).toBe('openai')
  })

  it('accepts overrides and strips trailing slash', () => {
    const cfg = resolveConfig({
      provider: 'openrouter',
      baseUrl: 'https://proxy.example.com/v1/',
      model: 'custom-model',
    })
    expect(cfg.baseUrl).toBe('https://proxy.example.com/v1')
    expect(cfg.model).toBe('custom-model')
  })

  it('throws for unknown providers', () => {
    expect(() => resolveConfig({ provider: 'nope' })).toThrow(/Unknown provider/)
  })
})

describe('testConnection', () => {
  it('rejects when the key is missing', async () => {
    const r = await testConnection({ provider: 'openai', apiKey: '' })
    expect(r).toEqual({ ok: false, error: expect.stringMatching(/API key/i) })
  })

  it('hits the OpenAI chat endpoint with a Bearer header', async () => {
    const { fetchImpl, calls } = makeFetch([{ status: 200, body: { ok: true } }])
    const r = await testConnection({
      provider: 'openai',
      apiKey: 'sk-test-123',
      fetchImpl,
    })
    expect(r.ok).toBe(true)
    expect(calls[0].url).toBe('https://api.openai.com/v1/chat/completions')
    expect(calls[0].init.headers.Authorization).toBe('Bearer sk-test-123')
    const body = JSON.parse(calls[0].init.body)
    expect(body.model).toBe('gpt-4o-mini')
    expect(body.max_tokens).toBe(1)
  })

  it('uses x-api-key for Anthropic', async () => {
    const { fetchImpl, calls } = makeFetch([{ status: 200, body: {} }])
    await testConnection({ provider: 'anthropic', apiKey: 'sk-ant-xyz', fetchImpl })
    expect(calls[0].url).toBe('https://api.anthropic.com/v1/messages')
    expect(calls[0].init.headers['x-api-key']).toBe('sk-ant-xyz')
    expect(calls[0].init.headers.Authorization).toBeUndefined()
  })

  it('passes the key via query string for Gemini', async () => {
    const { fetchImpl, calls } = makeFetch([{ status: 200, body: {} }])
    await testConnection({ provider: 'gemini', apiKey: 'AIza-abc', fetchImpl })
    expect(calls[0].url).toContain('key=AIza-abc')
    expect(calls[0].init.headers.Authorization).toBeUndefined()
  })

  it('returns the provider error message on non-2xx', async () => {
    const { fetchImpl } = makeFetch([
      {
        status: 401,
        body: { error: { message: 'Invalid API key' } },
      },
    ])
    const r = await testConnection({ provider: 'openai', apiKey: 'bad', fetchImpl })
    expect(r.ok).toBe(false)
    expect(r.error).toBe('Invalid API key')
  })

  it('never echoes the API key in error messages from thrown exceptions', async () => {
    const key = 'sk-super-secret'
    const { fetchImpl } = makeFetch([
      { throw: new Error(`request to ${key} failed: ECONNREFUSED`) },
    ])
    const r = await testConnection({ provider: 'openai', apiKey: key, fetchImpl })
    expect(r.ok).toBe(false)
    expect(r.error).not.toContain(key)
    expect(r.error).toContain('[redacted]')
  })
})

describe('generate', () => {
  it('returns the completion string from OpenAI-shaped responses', async () => {
    const { fetchImpl } = makeFetch([
      {
        status: 200,
        body: { choices: [{ message: { content: 'hello world' } }] },
      },
    ])
    const out = await generate({
      provider: 'openai',
      apiKey: 'sk-x',
      prompt: 'Say hi',
      fetchImpl,
    })
    expect(out).toBe('hello world')
  })

  it('extracts text from Anthropic content blocks', async () => {
    const { fetchImpl } = makeFetch([
      {
        status: 200,
        body: { content: [{ type: 'text', text: 'claude hi' }] },
      },
    ])
    const out = await generate({
      provider: 'anthropic',
      apiKey: 'sk-ant',
      prompt: 'hi',
      fetchImpl,
    })
    expect(out).toBe('claude hi')
  })

  it('extracts text from Gemini candidates', async () => {
    const { fetchImpl } = makeFetch([
      {
        status: 200,
        body: {
          candidates: [{ content: { parts: [{ text: 'gemini hi' }] } }],
        },
      },
    ])
    const out = await generate({
      provider: 'gemini',
      apiKey: 'AIza',
      prompt: 'hi',
      fetchImpl,
    })
    expect(out).toBe('gemini hi')
  })

  it('throws with the provider error message on non-2xx', async () => {
    const { fetchImpl } = makeFetch([{ status: 429, body: { error: { message: 'rate limited' } } }])
    await expect(
      generate({ provider: 'openai', apiKey: 'sk', prompt: 'x', fetchImpl }),
    ).rejects.toThrow(/429.*rate limited/)
  })

  it('rejects when key or prompt is missing', async () => {
    await expect(generate({ provider: 'openai', apiKey: '', prompt: 'x' })).rejects.toThrow(
      /API key/i,
    )
    await expect(generate({ provider: 'openai', apiKey: 'sk', prompt: '' })).rejects.toThrow(
      /prompt/i,
    )
  })
})
