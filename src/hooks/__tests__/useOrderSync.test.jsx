import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useOrderSync } from '../useOrderSync.js'
import { ToastProvider } from '../../contexts/ToastContext.jsx'

vi.mock('../../api/squarespace.js', () => ({
  fetchSquarespaceOrders: vi.fn(),
}))
vi.mock('../../api/shopify.js', () => ({
  fetchShopifyOrders: vi.fn(),
}))

const mockToast = vi.fn()
vi.mock('../../contexts/ToastContext.jsx', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    ToastProvider: actual.ToastProvider,
    useToast: () => ({ toast: mockToast }),
  }
})

import { fetchSquarespaceOrders } from '../../api/squarespace.js'
import { fetchShopifyOrders } from '../../api/shopify.js'

const ORDERS_KEY = 'sip_orders'
const SYNCED_AT_KEY = 'sip_orders_synced_at'
const PICKS_KEY = 'sip_picks'

const FAKE_ORDERS = [
  { id: 'ord-1', status: 'PENDING', customer: 'Alice', total: 49.99 },
  { id: 'ord-2', status: 'FULFILLED', customer: 'Bob', total: 20.0 },
]

function renderSync(props = {}) {
  return renderHook(
    () =>
      useOrderSync({
        activeIntegration: null,
        sqApiKey: null,
        shopifyShopDomain: null,
        shopifyAccessToken: null,
        ...props,
      }),
    { wrapper: ToastProvider },
  )
}

beforeEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
})

afterEach(() => {
  localStorage.clear()
})

describe('useOrderSync — initial state', () => {
  it('loads orders from localStorage when present', () => {
    localStorage.setItem(ORDERS_KEY, JSON.stringify(FAKE_ORDERS))
    const { result } = renderSync()
    expect(result.current.orders).toEqual(FAKE_ORDERS)
  })

  it('initialises to empty array when localStorage is empty', () => {
    const { result } = renderSync()
    expect(result.current.orders).toEqual([])
  })

  it('falls back to empty array on malformed orders JSON', () => {
    localStorage.setItem(ORDERS_KEY, 'not valid json')
    const { result } = renderSync()
    expect(result.current.orders).toEqual([])
  })

  it('loads picks from localStorage when present', () => {
    const stored = { 'ord-1': { 0: 2 } }
    localStorage.setItem(PICKS_KEY, JSON.stringify(stored))
    const { result } = renderSync()
    expect(result.current.picks).toEqual(stored)
  })

  it('initialises picks to empty object when localStorage is empty', () => {
    const { result } = renderSync()
    expect(result.current.picks).toEqual({})
  })

  it('falls back to empty object on malformed picks JSON', () => {
    localStorage.setItem(PICKS_KEY, '{broken}')
    const { result } = renderSync()
    expect(result.current.picks).toEqual({})
  })

  it('reads lastOrderSync from localStorage when present', () => {
    const ts = 1700000000000
    localStorage.setItem(SYNCED_AT_KEY, String(ts))
    const { result } = renderSync()
    expect(result.current.lastOrderSync).toBe(ts)
  })

  it('initialises lastOrderSync to null when absent', () => {
    const { result } = renderSync()
    expect(result.current.lastOrderSync).toBeNull()
  })

  it('starts with orderSyncStatus idle and orderSyncCount 0', () => {
    const { result } = renderSync()
    expect(result.current.orderSyncStatus).toBe('idle')
    expect(result.current.orderSyncCount).toBe(0)
  })
})

describe('useOrderSync — savePick', () => {
  it('records a quantity pick for an order item', () => {
    const { result } = renderSync()
    act(() => {
      result.current.savePick('ord-1', 0, 3)
    })
    expect(result.current.picks['ord-1'][0]).toBe(3)
    expect(JSON.parse(localStorage.getItem(PICKS_KEY))['ord-1'][0]).toBe(3)
  })

  it('merges picks without overwriting sibling items', () => {
    const { result } = renderSync()
    act(() => {
      result.current.savePick('ord-1', 0, 2)
      result.current.savePick('ord-1', 1, 5)
    })
    expect(result.current.picks['ord-1']).toEqual({ 0: 2, 1: 5 })
  })
})

describe('useOrderSync — handleSyncOrders (Squarespace)', () => {
  it('does nothing when no provider is configured', async () => {
    const { result } = renderSync()
    await act(async () => {
      await result.current.handleSyncOrders()
    })
    expect(fetchSquarespaceOrders).not.toHaveBeenCalled()
    expect(result.current.orderSyncStatus).toBe('idle')
  })

  it('syncs via squarespace when sqApiKey is provided', async () => {
    fetchSquarespaceOrders.mockResolvedValueOnce(FAKE_ORDERS)
    const { result } = renderSync({ sqApiKey: 'sqsp-key' })

    await act(async () => {
      await result.current.handleSyncOrders()
    })

    expect(fetchSquarespaceOrders).toHaveBeenCalledWith('sqsp-key', expect.any(Function))
    expect(result.current.orders).toEqual(FAKE_ORDERS)
    expect(result.current.orderSyncStatus).toBe('ok')
  })

  it('persists orders and timestamp to localStorage after sync', async () => {
    const before = Date.now()
    fetchSquarespaceOrders.mockResolvedValueOnce(FAKE_ORDERS)
    const { result } = renderSync({ sqApiKey: 'sqsp-key' })

    await act(async () => {
      await result.current.handleSyncOrders()
    })

    expect(JSON.parse(localStorage.getItem(ORDERS_KEY))).toEqual(FAKE_ORDERS)
    expect(result.current.lastOrderSync).toBeGreaterThanOrEqual(before)
  })

  it('sets orderSyncStatus to error when squarespace fetch throws', async () => {
    fetchSquarespaceOrders.mockRejectedValueOnce(new Error('network error'))
    const { result } = renderSync({ sqApiKey: 'sqsp-key' })

    await act(async () => {
      await result.current.handleSyncOrders()
    })

    expect(result.current.orderSyncStatus).toBe('error')
  })

  it('prunes picks for orders no longer in PENDING status after sync', async () => {
    // ord-1 is PENDING (kept), ord-2 is FULFILLED (pruned)
    localStorage.setItem(PICKS_KEY, JSON.stringify({ 'ord-1': { 0: 2 }, 'ord-2': { 0: 1 } }))
    fetchSquarespaceOrders.mockResolvedValueOnce(FAKE_ORDERS)
    const { result } = renderSync({ sqApiKey: 'sqsp-key' })

    await act(async () => {
      await result.current.handleSyncOrders()
    })

    expect(result.current.picks['ord-1']).toBeDefined()
    expect(result.current.picks['ord-2']).toBeUndefined()
  })
})

describe('useOrderSync — handleSyncOrders (Shopify)', () => {
  it('syncs via shopify when shopifyAccessToken is provided', async () => {
    fetchShopifyOrders.mockResolvedValueOnce(FAKE_ORDERS)
    const { result } = renderSync({
      shopifyShopDomain: 'mystore.myshopify.com',
      shopifyAccessToken: 'shpat_test',
    })

    await act(async () => {
      await result.current.handleSyncOrders()
    })

    expect(fetchShopifyOrders).toHaveBeenCalledWith(
      'mystore.myshopify.com',
      'shpat_test',
      expect.any(Function),
    )
    expect(result.current.orderSyncStatus).toBe('ok')
  })

  it('returns to idle when shopify domain is missing', async () => {
    const { result } = renderSync({
      activeIntegration: 'shopify',
      shopifyAccessToken: 'shpat_test',
    })

    await act(async () => {
      await result.current.handleSyncOrders()
    })

    expect(fetchShopifyOrders).not.toHaveBeenCalled()
  })

  it('sets orderSyncStatus to error when shopify fetch throws', async () => {
    fetchShopifyOrders.mockRejectedValueOnce(new Error('timeout'))
    const { result } = renderSync({
      shopifyShopDomain: 'mystore.myshopify.com',
      shopifyAccessToken: 'shpat_test',
    })

    await act(async () => {
      await result.current.handleSyncOrders()
    })

    expect(result.current.orderSyncStatus).toBe('error')
  })

  it('toasts network error message on Failed to fetch', async () => {
    const networkErr = new Error('Failed to fetch')
    fetchSquarespaceOrders.mockRejectedValueOnce(networkErr)
    const { result } = renderSync({ sqApiKey: 'sqsp-key' })

    await act(async () => {
      await result.current.handleSyncOrders()
    })

    expect(mockToast).toHaveBeenCalledWith('Sync failed: check your connection', 'error')
    expect(result.current.orderSyncStatus).toBe('error')
  })

  it('toasts auth error message on 401', async () => {
    const err = new Error('Unauthorized')
    err.status = 401
    fetchSquarespaceOrders.mockRejectedValueOnce(err)
    const { result } = renderSync({ sqApiKey: 'sqsp-key' })

    await act(async () => {
      await result.current.handleSyncOrders()
    })

    expect(mockToast).toHaveBeenCalledWith('Sync failed: API key invalid — check Settings', 'error')
    expect(result.current.orderSyncStatus).toBe('error')
  })

  it('toasts auth error message on 403', async () => {
    const err = new Error('Forbidden')
    err.status = 403
    fetchSquarespaceOrders.mockRejectedValueOnce(err)
    const { result } = renderSync({ sqApiKey: 'sqsp-key' })

    await act(async () => {
      await result.current.handleSyncOrders()
    })

    expect(mockToast).toHaveBeenCalledWith('Sync failed: API key invalid — check Settings', 'error')
    expect(result.current.orderSyncStatus).toBe('error')
  })

  it('toasts rate limit warning on 429', async () => {
    const err = new Error('Too Many Requests')
    err.status = 429
    fetchSquarespaceOrders.mockRejectedValueOnce(err)
    const { result } = renderSync({ sqApiKey: 'sqsp-key' })

    await act(async () => {
      await result.current.handleSyncOrders()
    })

    expect(mockToast).toHaveBeenCalledWith('Sync failed: rate limited — try again later', 'warning')
    expect(result.current.orderSyncStatus).toBe('error')
  })

  it('toasts generic message on unknown error', async () => {
    fetchSquarespaceOrders.mockRejectedValueOnce(new Error('something broke'))
    const { result } = renderSync({ sqApiKey: 'sqsp-key' })

    await act(async () => {
      await result.current.handleSyncOrders()
    })

    expect(mockToast).toHaveBeenCalledWith('Sync failed — try again later', 'error')
    expect(result.current.orderSyncStatus).toBe('error')
  })
})
