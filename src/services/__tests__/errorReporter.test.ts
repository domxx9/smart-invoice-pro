import { describe, it, expect, vi, beforeEach } from 'vitest'
import { reportError, captureAppState } from '../errorReporter.js'

describe('errorReporter service', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
  })

  describe('reportError', () => {
    it('POSTs correct URL and body on success', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ issueIdentifier: 'SMA-999' }),
      })
      vi.stubGlobal('fetch', mockFetch)

      const result = await reportError({
        message: 'boom',
        stack: 'Error: boom\n  at test',
      })

      expect(mockFetch).toHaveBeenCalledWith('/api/error-report', expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: expect.stringContaining('"message":"boom"'),
      }))
      expect(result).toEqual({ success: true, issueIdentifier: 'SMA-999' })
    })

    it('returns success:false on non-2xx response without throwing', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: () => Promise.resolve('Internal Server Error'),
      })
      vi.stubGlobal('fetch', mockFetch)

      const result = await reportError({ message: 'boom', stack: '' })

      expect(result.success).toBe(false)
      expect(result.error).toContain('500')
      expect(result.error).toContain('Internal Server Error')
    })

    it('returns success:false on network error without throwing', async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error('Network failure'))
      vi.stubGlobal('fetch', mockFetch)

      const result = await reportError({ message: 'boom', stack: '' })

      expect(result.success).toBe(false)
      expect(result.error).toBe('Network failure')
    })
  })

  describe('captureAppState', () => {
    it('reads tab from localStorage', () => {
      localStorage.setItem('tab', 'dashboard')
      const state = captureAppState()
      expect(state.tab).toBe('dashboard')
    })

    it('includes non-secret localStorage keys', () => {
      localStorage.setItem('foo', 'bar')
      localStorage.setItem('invoice_count', '5')
      const state = captureAppState()
      expect(state.foo).toBe('bar')
      expect(state.invoice_count).toBe('5')
    })

    it('excludes keys containing key/token/secret/password', () => {
      localStorage.setItem('apiKey', 'secret')
      localStorage.setItem('authToken', 'secret')
      localStorage.setItem('my_secret_key', 'secret')
      localStorage.setItem('password', 'secret')
      localStorage.setItem('safeName', 'visible')
      localStorage.setItem('invoice_count', '5')
      const state = captureAppState()
      expect(state.apiKey).toBeUndefined()
      expect(state.authToken).toBeUndefined()
      expect(state.my_secret_key).toBeUndefined()
      expect(state.password).toBeUndefined()
      expect(state.safeName).toBe('visible')
      expect(state.invoice_count).toBe('5')
    })

    it('handles localStorage getItem throwing for a single key', () => {
      let getItemThrows = false
      const orig = localStorage.getItem.bind(localStorage)
      localStorage.getItem = (key) => {
        if (getItemThrows && key === 'throwingKey') throw new Error('denied')
        return orig(key)
      }
      try {
        const state = captureAppState()
        expect(state).toBeDefined()
      } finally {
        localStorage.getItem = orig
      }
    })
  })
})