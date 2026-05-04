import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest'

let fetchModule

beforeEach(async () => {
  import.meta.env.VITE_PAPERCLIP_URL = 'http://localhost:3100'
  await vi.resetModules()
  const module = await import('../feedbackSubmit.js')
  fetchModule = module
})

afterEach(() => {
  vi.restoreAllMocks()
  delete import.meta.env.VITE_PAPERCLIP_URL
})

function makeFetch(spec) {
  return vi.fn(async () => ({
    ok: spec.ok ?? true,
    status: spec.status ?? 200,
    json: async () => spec.body ?? { id: 'issue-1', identifier: 'SMA-001' },
    text: async () => spec.errorText ?? '',
  }))
}

const BASE_ARGS = {
  rawText: '3x red widget\n2x blue bolt',
  timestamp: '2024-01-01T10:00:00.000Z',
  corrections: [
    {
      originalText: 'red widget',
      aiMatch: 'Red Widget',
      confidence: 85,
      correctedProduct: 'Red Widget Pro',
    },
    { originalText: 'blue bolt', aiMatch: null, confidence: 0, correctedProduct: 'Blue Hex Bolt' },
  ],
}

describe('submitPasteFeedback', () => {
  it('POSTs to the Paperclip issues endpoint', async () => {
    globalThis.fetch = makeFetch({})
    await fetchModule.submitPasteFeedback(BASE_ARGS)
    expect(globalThis.fetch).toHaveBeenCalledOnce()
    const [url, init] = globalThis.fetch.mock.calls[0]
    expect(url).toContain('/api/companies/')
    expect(url).toContain('/issues')
    expect(init.method).toBe('POST')
    expect(init.headers['Content-Type']).toBe('application/json')
  })

  it('sets title with plural corrections count', async () => {
    globalThis.fetch = makeFetch({})
    await fetchModule.submitPasteFeedback(BASE_ARGS)
    const body = JSON.parse(globalThis.fetch.mock.calls[0][1].body)
    expect(body.title).toContain('2 corrections')
    expect(body.status).toBe('backlog')
    expect(body.priority).toBe('low')
  })

  it('uses singular "correction" when count is 1', async () => {
    globalThis.fetch = makeFetch({})
    await fetchModule.submitPasteFeedback({
      ...BASE_ARGS,
      corrections: [BASE_ARGS.corrections[0]],
    })
    const body = JSON.parse(globalThis.fetch.mock.calls[0][1].body)
    expect(body.title).toContain('1 correction')
    expect(body.title).not.toContain('corrections')
  })

  it('includes AI match info in the description when present', async () => {
    globalThis.fetch = makeFetch({})
    await fetchModule.submitPasteFeedback(BASE_ARGS)
    const body = JSON.parse(globalThis.fetch.mock.calls[0][1].body)
    expect(body.description).toContain('AI matched: Red Widget (85%)')
    expect(body.description).toContain('AI matched: *(no match)*')
  })

  it('returns the parsed issue result on success', async () => {
    globalThis.fetch = makeFetch({ body: { id: 'abc', identifier: 'SMA-42' } })
    const result = await fetchModule.submitPasteFeedback(BASE_ARGS)
    expect(result).toEqual({ id: 'abc', identifier: 'SMA-42' })
  })

  it('throws with status code when the API returns non-OK', async () => {
    globalThis.fetch = makeFetch({ ok: false, status: 422, errorText: 'Validation error' })
    await expect(fetchModule.submitPasteFeedback(BASE_ARGS)).rejects.toThrow(
      'Feedback submit failed: 422',
    )
  })

  it('throws when VITE_PAPERCLIP_URL is not configured', async () => {
    delete import.meta.env.VITE_PAPERCLIP_URL
    await vi.resetModules()
    const m = await import('../feedbackSubmit.js')
    await expect(m.submitPasteFeedback(BASE_ARGS)).rejects.toThrow(
      'VITE_PAPERCLIP_URL is not configured',
    )
  })
})
