import { describe, it, expect, vi } from 'vitest'

const MAX_MESSAGE_LEN = 500
const MAX_STACK_LEN = 5000
const MAX_NOTE_LEN = 1000
const MAX_SNAPSHOT_KEYS = 50

function truncate(str, maxLen) {
  if (!str || typeof str !== 'string') return str
  return str.length > maxLen ? str.slice(0, maxLen) : str
}

function formatDescription({ message, stack, componentStack, userNote, appStateSnapshot }) {
  const msg = truncate(message, MAX_MESSAGE_LEN)
  const stk = truncate(stack, MAX_STACK_LEN)
  const compStk = truncate(componentStack, MAX_STACK_LEN)
  const note = truncate(userNote, MAX_NOTE_LEN)

  let snapshot = {}
  if (appStateSnapshot && typeof appStateSnapshot === 'object') {
    const keys = Object.keys(appStateSnapshot).slice(0, MAX_SNAPSHOT_KEYS)
    for (const k of keys) {
      snapshot[k] = appStateSnapshot[k]
    }
  }

  const parts = ['## Error Report']
  if (msg) parts.push(`**Message:** ${msg}`)
  if (stk) parts.push(`**Stack:** \`${stk}\``)
  if (compStk) parts.push(`**Component Stack:** \`${compStk}\``)
  if (note) parts.push(`**User Note:** ${note}`)
  if (Object.keys(snapshot).length > 0) {
    parts.push(`**App State Snapshot:** \`${JSON.stringify(snapshot)}\``)
  }

  return parts.join('\n\n')
}

describe('error-report truncation', () => {
  describe('formatDescription', () => {
    it('truncates message to MAX_MESSAGE_LEN (500)', () => {
      const longMessage = 'a'.repeat(600)
      const result = formatDescription({ message: longMessage })
      expect(result).toContain(`**Message:** ${'a'.repeat(500)}`)
      expect(result).not.toContain(`**Message:** ${'a'.repeat(501)}`)
    })

    it('truncates stack to MAX_STACK_LEN (5000)', () => {
      const longStack = 'b'.repeat(6000)
      const result = formatDescription({ stack: longStack })
      expect(result).toContain(`**Stack:** \`${'b'.repeat(5000)}\``)
      expect(result).not.toContain(`**Stack:** \`${'b'.repeat(5001)}`)
    })

    it('truncates componentStack to MAX_STACK_LEN (5000)', () => {
      const longCompStack = 'c'.repeat(6000)
      const result = formatDescription({ componentStack: longCompStack })
      expect(result).toContain(`**Component Stack:** \`${'c'.repeat(5000)}\``)
    })

    it('truncates userNote to MAX_NOTE_LEN (1000)', () => {
      const longNote = 'd'.repeat(1200)
      const result = formatDescription({ userNote: longNote })
      expect(result).toContain(`**User Note:** ${'d'.repeat(1000)}`)
      expect(result).not.toContain(`**User Note:** ${'d'.repeat(1001)}`)
    })

    it('limits appStateSnapshot keys to MAX_SNAPSHOT_KEYS (50)', () => {
      const snapshot = {}
      for (let i = 0; i < 60; i++) {
        snapshot[`key_${i}`] = `value_${i}`
      }
      const result = formatDescription({ appStateSnapshot: snapshot })
      const snapshotMatch = result.match(/\*\*App State Snapshot:\*\* `(.*)`/)
      expect(snapshotMatch).not.toBeNull()
      const parsed = JSON.parse(snapshotMatch[1])
      expect(Object.keys(parsed).length).toBe(50)
      expect(parsed.key_0).toBe('value_0')
      expect(parsed.key_49).toBe('value_49')
      expect(parsed.key_50).toBeUndefined()
    })

    it('omits fields that are null or undefined', () => {
      const result = formatDescription({ message: null, stack: undefined })
      expect(result).not.toContain('**Message:**')
      expect(result).not.toContain('**Stack:**')
    })

    it('includes all fields when within limits', () => {
      const result = formatDescription({
        message: 'Short error',
        stack: 'Error at line 1',
        componentStack: 'Component stack here',
        userNote: 'User note here',
        appStateSnapshot: { key: 'value' },
      })
      expect(result).toContain('**Message:** Short error')
      expect(result).toContain('**Stack:**')
      expect(result).toContain('**Component Stack:**')
      expect(result).toContain('**User Note:**')
      expect(result).toContain('**App State Snapshot:**')
    })
  })

  describe('body size guard', () => {
    it('returns 413 when Content-Length exceeds 100KB', async () => {
      process.env.PAPERCLIP_URL = 'http://localhost:3100'
      vi.stubEnv('PAPERCLIP_URL', 'http://localhost:3100')
      const handler = (await import('../error-report.js')).default
      const longBody = { message: 'x'.repeat(200_000) }
      const req = new Request('http://localhost/api/error-report', {
        method: 'POST',
        headers: { 'content-length': String(200_000) },
        body: JSON.stringify(longBody),
      })
      const res = await handler(req)
      expect(res.status).toBe(413)
      const json = await res.json()
      expect(json.error).toBe('Payload too large')
    })

    it('returns 200 when Content-Length is within limit', async () => {
      vi.resetModules()
      process.env.PAPERCLIP_URL = 'http://localhost:3100'
      vi.stubEnv('PAPERCLIP_URL', 'http://localhost:3100')
      const handler = (await import('../error-report.js')).default
      const validBody = { message: 'Test error' }
      const req = new Request('http://localhost/api/error-report', {
        method: 'POST',
        headers: { 'content-length': String(JSON.stringify(validBody).length) },
        body: JSON.stringify(validBody),
      })

      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id: 'test-issue-id', identifier: 'SMA-TEST' }),
      })
      const originalFetch = globalThis.fetch
      Object.defineProperty(globalThis, 'fetch', {
        value: fetchMock,
        configurable: true,
      })

      try {
        const res = await handler(req)
        expect(res.status).toBe(200)
        const json = await res.json()
        expect(json.success).toBe(true)
      } finally {
        Object.defineProperty(globalThis, 'fetch', { value: originalFetch })
      }
    })
  })
})
