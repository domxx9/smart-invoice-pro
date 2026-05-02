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

  describe('native environment (isNative = true)', () => {
    let mockCapacitorHttp

    beforeEach(() => {
      mockCapacitorHttp = {
        request: vi.fn(),
      }
      vi.stubGlobal('window', {
        Capacitor: {
          isNativePlatform: () => true,
          Plugins: { CapacitorHttp: mockCapacitorHttp },
        },
      })
    })

    afterEach(() => {
      vi.restoreAllMocks()
    })

    it('returns { data, raw } on 2xx from CapacitorHttp', async () => {
      const mockData = { ok: true, items: [1, 2, 3] }
      mockCapacitorHttp.request.mockResolvedValue({
        status: 200,
        data: mockData,
        headers: {},
      })

      const result = await platformFetch(API_URL, { Authorization: `Bearer ${API_KEY}` })

      expect(result.data).toEqual(mockData)
      expect(result.raw.status).toBe(200)
    })

    it('truncates error message to ≤200 chars on non-2xx', async () => {
      mockCapacitorHttp.request.mockResolvedValue({
        status: 422,
        data: { error: 'A'.repeat(500) },
        headers: {},
      })

      let thrownError
      try {
        await platformFetch(API_URL, {})
      } catch (e) {
        thrownError = e
      }
      expect(thrownError).toBeDefined()
      expect(thrownError.message.length).toBeLessThanOrEqual(200)
      expect(thrownError.message).toContain('422')
    })

    it('passes method and body (as data field) to CapacitorHttp.request', async () => {
      mockCapacitorHttp.request.mockResolvedValue({
        status: 200,
        data: {},
        headers: {},
      })

      await platformFetch(
        API_URL,
        { 'Content-Type': 'application/json' },
        { method: 'POST', body: '{"key":"value"}' },
      )

      expect(mockCapacitorHttp.request).toHaveBeenCalledWith({
        url: API_URL,
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
        data: '{"key":"value"}',
      })
    })
  })
})
