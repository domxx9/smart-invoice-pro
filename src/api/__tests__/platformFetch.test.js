import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { platformFetch } from '../platformFetch.js'

const API_URL = 'https://api.example.com/data'
const API_KEY = 'test-key-123'

describe('platformFetch', () => {
  describe('browser environment (isNative = false)', () => {
    let mockFetch

    beforeEach(() => {
      mockFetch = vi.fn()
      globalThis.fetch = mockFetch
      vi.stubGlobal('window', { Capacitor: { isNativePlatform: () => false } })
    })

    afterEach(() => {
      vi.restoreAllMocks()
    })

    it('calls the devUrl when provided in browser env', async () => {
      const devUrl = '/api/dev/proxy'
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ ok: true }),
      })

      await platformFetch(API_URL, { Authorization: `Bearer ${API_KEY}` }, { devUrl })

      expect(mockFetch).toHaveBeenCalledWith(devUrl, {
        headers: { Authorization: `Bearer ${API_KEY}` },
        method: 'GET',
        body: undefined,
      })
    })

    it('uses the original url when no devUrl provided', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ ok: true }),
      })

      await platformFetch(API_URL, { Authorization: `Bearer ${API_KEY}` })

      expect(mockFetch).toHaveBeenCalledWith(API_URL, {
        headers: { Authorization: `Bearer ${API_KEY}` },
        method: 'GET',
        body: undefined,
      })
    })

    it('throws on non-OK response with status in message', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
      })

      await expect(platformFetch(API_URL, {}, {})).rejects.toThrow('API 401: Unauthorized')
    })

    it('returns { data, raw } where raw is the fetch Response', async () => {
      const jsonBody = { products: [] }
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(jsonBody),
        headers: { get: () => null },
      })

      const result = await platformFetch(API_URL, {}, {})
      expect(result.data).toEqual(jsonBody)
      expect(result.raw).toBeDefined()
      expect(typeof result.raw.status).toBe('number')
      expect(typeof result.raw.ok).toBe('boolean')
    })

    it('passes custom method and body', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({}),
      })

      await platformFetch(
        API_URL,
        { 'Content-Type': 'application/json' },
        { method: 'POST', body: '{"a":1}' },
      )

      expect(mockFetch).toHaveBeenCalledWith(
        API_URL,
        expect.objectContaining({ method: 'POST', body: '{"a":1}' }),
      )
    })
  })
})
