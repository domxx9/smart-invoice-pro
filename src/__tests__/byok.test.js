import { describe, it, expect } from 'vitest'
import { BYOK_PROVIDERS, resolveConfig, testConnection, generate, listModels } from '../byok.js'

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

  it('passes the key via x-goog-api-key header for Gemini', async () => {
    const { fetchImpl, calls } = makeFetch([{ status: 200, body: {} }])
    await testConnection({ provider: 'gemini', apiKey: 'AIza-abc', fetchImpl })
    expect(calls[0].url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent',
    )
    expect(calls[0].url).not.toContain('key=')
    expect(calls[0].init.headers['x-goog-api-key']).toBe('AIza-abc')
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

describe('listModels (SMA-96)', () => {
  it('rejects when the key is missing', async () => {
    const r = await listModels({ provider: 'openai', apiKey: '' })
    expect(r).toEqual({ ok: false, error: expect.stringMatching(/API key/i) })
  })

  it('hits the OpenAI /models endpoint with a Bearer header and parses data[].id', async () => {
    const { fetchImpl, calls } = makeFetch([
      {
        status: 200,
        body: { data: [{ id: 'gpt-4o' }, { id: 'gpt-4o-mini' }, { id: 'gpt-3.5-turbo' }] },
      },
    ])
    const r = await listModels({ provider: 'openai', apiKey: 'sk-test-123', fetchImpl })
    expect(r.ok).toBe(true)
    expect(calls[0].url).toBe('https://api.openai.com/v1/models')
    expect(calls[0].init.method).toBe('GET')
    expect(calls[0].init.headers.Authorization).toBe('Bearer sk-test-123')
    expect(r.models).toEqual(['gpt-3.5-turbo', 'gpt-4o', 'gpt-4o-mini'])
  })

  it('uses the OpenRouter base URL when provider is openrouter', async () => {
    const { fetchImpl, calls } = makeFetch([
      { status: 200, body: { data: [{ id: 'openai/gpt-4o-mini' }] } },
    ])
    await listModels({ provider: 'openrouter', apiKey: 'sk-or', fetchImpl })
    expect(calls[0].url).toBe('https://openrouter.ai/api/v1/models')
    expect(calls[0].init.headers.Authorization).toBe('Bearer sk-or')
  })

  it('filters Gemini models by supportedGenerationMethods and strips the models/ prefix', async () => {
    const { fetchImpl, calls } = makeFetch([
      {
        status: 200,
        body: {
          models: [
            {
              name: 'models/gemini-1.5-flash',
              supportedGenerationMethods: ['generateContent', 'countTokens'],
            },
            {
              name: 'models/embedding-001',
              supportedGenerationMethods: ['embedContent'],
            },
            {
              name: 'models/gemini-1.5-pro',
              supportedGenerationMethods: ['generateContent'],
            },
          ],
        },
      },
    ])
    const r = await listModels({ provider: 'gemini', apiKey: 'AIza-abc', fetchImpl })
    expect(r.ok).toBe(true)
    expect(calls[0].url).toBe('https://generativelanguage.googleapis.com/v1beta/models')
    expect(calls[0].url).not.toContain('key=')
    expect(calls[0].init.headers['x-goog-api-key']).toBe('AIza-abc')
    expect(r.models).toEqual(['gemini-1.5-flash', 'gemini-1.5-pro'])
  })

  it('uses x-api-key and anthropic-version headers for Anthropic, parses data[].id', async () => {
    const { fetchImpl, calls } = makeFetch([
      {
        status: 200,
        body: {
          data: [{ id: 'claude-3-5-sonnet-latest' }, { id: 'claude-3-5-haiku-latest' }],
        },
      },
    ])
    const r = await listModels({ provider: 'anthropic', apiKey: 'sk-ant-xyz', fetchImpl })
    expect(r.ok).toBe(true)
    expect(calls[0].url).toBe('https://api.anthropic.com/v1/models')
    expect(calls[0].init.method).toBe('GET')
    expect(calls[0].init.headers['x-api-key']).toBe('sk-ant-xyz')
    expect(calls[0].init.headers['anthropic-version']).toBe('2023-06-01')
    expect(calls[0].init.headers['anthropic-dangerous-direct-browser-access']).toBe('true')
    expect(r.models).toEqual(['claude-3-5-haiku-latest', 'claude-3-5-sonnet-latest'])
  })

  it('returns the provider error message on non-2xx', async () => {
    const { fetchImpl } = makeFetch([
      { status: 401, body: { error: { message: 'Invalid API key' } } },
    ])
    const r = await listModels({ provider: 'openai', apiKey: 'bad', fetchImpl })
    expect(r).toEqual({ ok: false, error: 'Invalid API key' })
  })

  it('returns an HTTP fallback message when the error body is unparseable', async () => {
    const { fetchImpl } = makeFetch([{ status: 500, body: null }])
    const r = await listModels({ provider: 'openai', apiKey: 'sk', fetchImpl })
    expect(r.ok).toBe(false)
    expect(r.error).toBe('HTTP 500')
  })

  it('redacts the API key when the network throws and the key leaks into the error', async () => {
    const key = 'sk-super-secret'
    const { fetchImpl } = makeFetch([
      { throw: new Error(`request to ${key} failed: ECONNREFUSED`) },
    ])
    const r = await listModels({ provider: 'openai', apiKey: key, fetchImpl })
    expect(r.ok).toBe(false)
    expect(r.error).not.toContain(key)
    expect(r.error).toContain('[redacted]')
  })

  it('honors a custom baseUrl and strips the trailing slash', async () => {
    const { fetchImpl, calls } = makeFetch([{ status: 200, body: { data: [] } }])
    await listModels({
      provider: 'openai',
      apiKey: 'sk',
      baseUrl: 'https://proxy.example.com/v1/',
      fetchImpl,
    })
    expect(calls[0].url).toBe('https://proxy.example.com/v1/models')
  })

  it('de-duplicates models returned by the provider', async () => {
    const { fetchImpl } = makeFetch([
      {
        status: 200,
        body: { data: [{ id: 'gpt-4o' }, { id: 'gpt-4o' }, { id: 'gpt-4o-mini' }] },
      },
    ])
    const r = await listModels({ provider: 'openai', apiKey: 'sk', fetchImpl })
    expect(r.models).toEqual(['gpt-4o', 'gpt-4o-mini'])
  })
})

describe('generate', () => {
  it('returns { text, stopReason } from OpenAI-shaped responses', async () => {
    const { fetchImpl } = makeFetch([
      {
        status: 200,
        body: { choices: [{ message: { content: 'hello world' }, finish_reason: 'stop' }] },
      },
    ])
    const out = await generate({
      provider: 'openai',
      apiKey: 'sk-x',
      prompt: 'Say hi',
      fetchImpl,
    })
    expect(out).toEqual({ text: 'hello world', stopReason: 'stop' })
  })

  it('extracts text and stop_reason from Anthropic content blocks', async () => {
    const { fetchImpl } = makeFetch([
      {
        status: 200,
        body: { content: [{ type: 'text', text: 'claude hi' }], stop_reason: 'end_turn' },
      },
    ])
    const out = await generate({
      provider: 'anthropic',
      apiKey: 'sk-ant',
      prompt: 'hi',
      fetchImpl,
    })
    expect(out).toEqual({ text: 'claude hi', stopReason: 'end_turn' })
  })

  it('extracts text and finishReason from Gemini candidates', async () => {
    const { fetchImpl } = makeFetch([
      {
        status: 200,
        body: {
          candidates: [{ content: { parts: [{ text: 'gemini hi' }] }, finishReason: 'STOP' }],
        },
      },
    ])
    const out = await generate({
      provider: 'gemini',
      apiKey: 'AIza',
      prompt: 'hi',
      fetchImpl,
    })
    expect(out).toEqual({ text: 'gemini hi', stopReason: 'STOP' })
  })

  it('Gemini generate: key in x-goog-api-key header, not in URL', async () => {
    const { fetchImpl, calls } = makeFetch([
      {
        status: 200,
        body: {
          candidates: [{ content: { parts: [{ text: 'hi' }] }, finishReason: 'STOP' }],
        },
      },
    ])
    await generate({ provider: 'gemini', apiKey: 'AIza-test-key', prompt: 'hi', fetchImpl })
    expect(calls[0].url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent',
    )
    expect(calls[0].url).not.toContain('key=')
    expect(calls[0].init.headers['x-goog-api-key']).toBe('AIza-test-key')
  })

  // ── SMA-71: stop reason plumbs through alongside the text ──
  it('exposes finish_reason=length to the caller on OpenAI truncation (SMA-71)', async () => {
    const { fetchImpl } = makeFetch([
      {
        status: 200,
        body: {
          choices: [{ message: { content: '[{"text":"blade' }, finish_reason: 'length' }],
        },
      },
    ])
    const out = await generate({
      provider: 'openai',
      apiKey: 'sk',
      prompt: 'extract',
      fetchImpl,
    })
    expect(out).toEqual({ text: '[{"text":"blade', stopReason: 'length' })
  })

  it('exposes stop_reason=max_tokens to the caller on Anthropic truncation (SMA-71)', async () => {
    const { fetchImpl } = makeFetch([
      {
        status: 200,
        body: {
          content: [{ type: 'text', text: '[{"text":"widget' }],
          stop_reason: 'max_tokens',
        },
      },
    ])
    const out = await generate({
      provider: 'anthropic',
      apiKey: 'sk-ant',
      prompt: 'extract',
      fetchImpl,
    })
    expect(out).toEqual({ text: '[{"text":"widget', stopReason: 'max_tokens' })
  })

  it('returns stopReason=null when the provider omits the reason', async () => {
    const { fetchImpl } = makeFetch([
      {
        status: 200,
        body: { choices: [{ message: { content: 'hi' } }] },
      },
    ])
    const out = await generate({
      provider: 'openai',
      apiKey: 'sk',
      prompt: 'x',
      fetchImpl,
    })
    expect(out).toEqual({ text: 'hi', stopReason: null })
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

  // ── SMA-51: response parsing should not produce empty-text false negatives ──
  describe('extractText robustness (SMA-51)', () => {
    it('handles OpenAI content returned as an array of parts', async () => {
      const { fetchImpl } = makeFetch([
        {
          status: 200,
          body: {
            choices: [
              {
                message: {
                  content: [
                    { type: 'text', text: '4' },
                    { type: 'text', text: '2' },
                  ],
                },
              },
            ],
          },
        },
      ])
      const out = await generate({
        provider: 'openai',
        apiKey: 'sk',
        prompt: 'pick',
        fetchImpl,
      })
      expect(out.text).toBe('42')
    })

    it('includes finish_reason in the error when OpenAI returns empty content', async () => {
      const { fetchImpl } = makeFetch([
        {
          status: 200,
          body: {
            choices: [{ message: { content: '' }, finish_reason: 'length' }],
          },
        },
      ])
      await expect(
        generate({ provider: 'openai', apiKey: 'sk', prompt: 'x', fetchImpl }),
      ).rejects.toThrow(/finish_reason=length/)
    })

    it('reports refusal when OpenAI returns a structured refusal', async () => {
      const { fetchImpl } = makeFetch([
        {
          status: 200,
          body: {
            choices: [{ message: { content: '', refusal: 'I cannot help with that.' } }],
          },
        },
      ])
      await expect(
        generate({ provider: 'openai', apiKey: 'sk', prompt: 'x', fetchImpl }),
      ).rejects.toThrow(/refused/i)
    })

    it('includes finishReason in the error when Gemini truncates with no parts', async () => {
      const { fetchImpl } = makeFetch([
        {
          status: 200,
          body: { candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [] } }] },
        },
      ])
      await expect(
        generate({ provider: 'gemini', apiKey: 'AIza', prompt: 'x', fetchImpl }),
      ).rejects.toThrow(/finishReason=MAX_TOKENS/)
    })

    it('surfaces Gemini promptFeedback when the prompt itself is blocked', async () => {
      const { fetchImpl } = makeFetch([
        {
          status: 200,
          body: { promptFeedback: { blockReason: 'SAFETY' } },
        },
      ])
      await expect(
        generate({ provider: 'gemini', apiKey: 'AIza', prompt: 'x', fetchImpl }),
      ).rejects.toThrow(/promptFeedback=SAFETY/)
    })

    it('includes stop_reason in the error when Anthropic blocks contain no text', async () => {
      const { fetchImpl } = makeFetch([
        {
          status: 200,
          body: { content: [{ type: 'tool_use', id: 't1' }], stop_reason: 'max_tokens' },
        },
      ])
      await expect(
        generate({ provider: 'anthropic', apiKey: 'sk-ant', prompt: 'x', fetchImpl }),
      ).rejects.toThrow(/stop_reason=max_tokens/)
    })
  })
})
