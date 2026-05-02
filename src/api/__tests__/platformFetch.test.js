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

  describe('native environment', () => {
    let mockCapacitorHttp

    beforeEach(() => {
      mockCapacitorHttp = {
        get: vi.fn(),
        post: vi.fn(),
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

    it('uses CapacitorHttp.get and returns { data, raw }', async () => {
      const jsonBody = { products: [{ id: 1 }] }
      mockCapacitorHttp.get.mockResolvedValue({
        status: 200,
        data: jsonBody,
        headers: { 'x-page': '1' },
      })

      const result = await platformFetch(API_URL, { Authorization: `Bearer ${API_KEY}` })

      expect(mockCapacitorHttp.get).toHaveBeenCalledWith({
        url: API_URL,
        headers: { Authorization: `Bearer ${API_KEY}` },
        method: 'GET',
        body: undefined,
      })
      expect(result.data).toEqual(jsonBody)
      expect(result.raw).toBeDefined()
      expect(result.raw.headers).toEqual({ 'x-page': '1' })
    })

    it('truncates error message to 200 chars on non-OK response', async () => {
      const largeData = { items: Array(100).fill({ id: 'x'.repeat(100) }) }
      mockCapacitorHttp.get.mockResolvedValue({
        status: 422,
        data: largeData,
      })

      await expect(platformFetch(API_URL, {}, {})).rejects.toThrow(/API 422 — /)
      try {
        await platformFetch(API_URL, {}, {})
      } catch (e) {
        expect(e.message.length).toBeLessThanOrEqual(210)
        expect(e.message).toContain('API 422 — ')
      }
    })

    it('passes POST method and body to CapacitorHttp.get', async () => {
      mockCapacitorHttp.get.mockResolvedValue({
        status: 201,
        data: { id: 'new-item' },
      })

      const body = JSON.stringify({ name: 'Test Product' })
      await platformFetch(API_URL, { 'Content-Type': 'application/json' }, { method: 'POST', body })

      expect(mockCapacitorHttp.get).toHaveBeenCalledWith({
        url: API_URL,
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
        body,
      })
    })
  })
})
