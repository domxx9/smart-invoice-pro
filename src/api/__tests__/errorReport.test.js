import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'

const API_URL = 'http://localhost:3100'
const COMPANY_ID = 'c262e348-7044-4326-80ca-496a018bf1e4'

function makeFetch(spec) {
  return vi.fn(async () => ({
    ok: spec.ok ?? true,
    status: spec.status ?? 200,
    json: async () => spec.body ?? { id: 'issue-1', identifier: 'SMA-999' },
    text: async () => spec.errorText ?? '',
  }))
}

const BASE_BODY = {
  message: 'TypeError: Cannot read properties of undefined',
  stack: 'TypeError: Cannot read properties of undefined\n    at Foo (index.js:10:5)',
  componentStack: 'at Bar (index.js:20:10)\nat Baz (index.js:30:15)',
  tab: 'Invoices',
  userNote: 'Crashed when creating a new invoice',
  appStateSnapshot: { activeTab: 'invoices', isLoading: false, apiKey: 'secret-123', count: 42 },
  timestamp: '2024-01-01T10:00:00.000Z',
  userAgent: 'Mozilla/5.0',
}

describe('api/error-report.js', () => {
  let originalEnv

  beforeEach(() => {
    originalEnv = { ...process.env }
    process.env.PAPERCLIP_API_URL = API_URL
    process.env.PAPERCLIP_COMPANY_ID = COMPANY_ID
    process.env.PAPERCLIP_ERROR_REPORT_API_KEY = 'test-api-key'
  })

  afterEach(() => {
    process.env = originalEnv
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  async function callHandler(body, method = 'POST') {
    const { default: handler } = await import('../../../api/error-report.js')
    const req = new Request('http://localhost/api/error-report', {
      method,
      headers: { 'Content-Type': 'application/json' },
      ...(method !== 'GET' && method !== 'HEAD' ? { body: JSON.stringify(body) } : {}),
    })
    return handler(req)
  }

  it('returns 400 when message is missing', async () => {
    globalThis.fetch = makeFetch({})
    const res = await callHandler({ stack: 'abc' })
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.success).toBe(false)
    expect(data.error).toContain('message')
  })

  it('returns 400 when stack is missing', async () => {
    globalThis.fetch = makeFetch({})
    const res = await callHandler({ message: 'oops' })
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.success).toBe(false)
    expect(data.error).toContain('stack')
  })

  it('returns 405 for non-POST methods', async () => {
    globalThis.fetch = makeFetch({})
    const res = await callHandler({}, 'GET')
    expect(res.status).toBe(405)
    const data = await res.json()
    expect(data.success).toBe(false)
  })

  it('returns 400 for invalid JSON', async () => {
    globalThis.fetch = makeFetch({})
    const req = new Request('http://localhost/api/error-report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not json',
    })
    const { default: handler } = await import('../../../api/error-report.js')
    const res = await handler(req)
    expect(res.status).toBe(400)
  })

  it('POSTs to Paperclip API with correct shape', async () => {
    globalThis.fetch = makeFetch({})
    await callHandler(BASE_BODY)
    expect(globalThis.fetch).toHaveBeenCalledOnce()
    const [url, init] = globalThis.fetch.mock.calls[0]
    expect(url).toContain(`/api/companies/${COMPANY_ID}/issues`)
    expect(init.method).toBe('POST')
    expect(init.headers['Content-Type']).toBe('application/json')
    expect(init.headers.Authorization).toBe('Bearer test-api-key')
  })

  it('sets issue title with [Error Report] prefix', async () => {
    globalThis.fetch = makeFetch({})
    await callHandler(BASE_BODY)
    const body = JSON.parse(globalThis.fetch.mock.calls[0][1].body)
    expect(body.title).toBe('[Error Report] TypeError: Cannot read properties of undefined')
  })

  it('truncates title to 120 chars', async () => {
    globalThis.fetch = makeFetch({})
    await callHandler({ ...BASE_BODY, message: 'A'.repeat(200) })
    const body = JSON.parse(globalThis.fetch.mock.calls[0][1].body)
    expect(body.title.length).toBe(120)
    expect(body.title).toMatch(/^\[Error Report\] A+$/)
  })

  it('sets priority to low and correct projectId', async () => {
    globalThis.fetch = makeFetch({})
    await callHandler(BASE_BODY)
    const body = JSON.parse(globalThis.fetch.mock.calls[0][1].body)
    expect(body.priority).toBe('low')
    expect(body.projectId).toBe('c2d1e1a5-c7e5-4ba8-bb49-debc7ef53f24')
  })

  it('includes all fields in description', async () => {
    globalThis.fetch = makeFetch({})
    await callHandler(BASE_BODY)
    const body = JSON.parse(globalThis.fetch.mock.calls[0][1].body)
    expect(body.description).toContain('## Stack')
    expect(body.description).toContain('TypeError: Cannot read properties')
    expect(body.description).toContain('## Component Stack')
    expect(body.description).toContain('## Tab')
    expect(body.description).toContain('Invoices')
    expect(body.description).toContain('## User Note')
    expect(body.description).toContain('## App State Snapshot')
    expect(body.description).toContain('## Timestamp')
    expect(body.description).toContain('## User Agent')
  })

  it('redacts sensitive fields from appStateSnapshot', async () => {
    globalThis.fetch = makeFetch({})
    await callHandler(BASE_BODY)
    const body = JSON.parse(globalThis.fetch.mock.calls[0][1].body)
    expect(body.description).toContain('[REDACTED]')
    expect(body.description).not.toContain('secret-123')
  })

  it('returns { success: true, issueIdentifier } on success', async () => {
    globalThis.fetch = makeFetch({ body: { id: 'abc', identifier: 'SMA-42' } })
    const res = await callHandler(BASE_BODY)
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.success).toBe(true)
    expect(data.issueIdentifier).toBe('SMA-42')
  })

  it('returns { success: false, error } on Paperclip API failure', async () => {
    globalThis.fetch = makeFetch({ ok: false, status: 500, errorText: 'Internal error' })
    const res = await callHandler(BASE_BODY)
    expect(res.status).toBe(500)
    const data = await res.json()
    expect(data.success).toBe(false)
    expect(data.error).toContain('500')
  })

  it('returns 502 on network failure', async () => {
    globalThis.fetch = vi.fn(() => Promise.reject(new Error('network error')))
    const res = await callHandler(BASE_BODY)
    expect(res.status).toBe(502)
    const data = await res.json()
    expect(data.success).toBe(false)
    expect(data.error).toContain('Upstream request failed')
  })

  it('returns 500 when env vars are missing', async () => {
    delete process.env.PAPERCLIP_API_URL
    globalThis.fetch = makeFetch({})
    const res = await callHandler(BASE_BODY)
    expect(res.status).toBe(500)
    const data = await res.json()
    expect(data.success).toBe(false)
    expect(data.error).toContain('misconfiguration')
  })

  it('falls back to hardcoded COMPANY_ID when env var is unset', async () => {
    delete process.env.PAPERCLIP_COMPANY_ID
    globalThis.fetch = makeFetch({})
    await callHandler(BASE_BODY)
    const [url] = globalThis.fetch.mock.calls[0]
    expect(url).toContain(`/api/companies/${COMPANY_ID}/issues`)
  })
})
