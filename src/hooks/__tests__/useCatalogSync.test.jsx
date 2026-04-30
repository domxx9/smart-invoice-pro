import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useCatalogSync } from '../useCatalogSync.js'
import { SAMPLE_PRODUCTS } from '../../constants.js'
import { ToastProvider } from '../../contexts/ToastContext.jsx'

vi.mock('../../api/squarespace.js', () => ({
  fetchSquarespaceProducts: vi.fn(),
}))
vi.mock('../../api/shopify.js', () => ({
  fetchShopifyProducts: vi.fn(),
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

import { fetchSquarespaceProducts } from '../../api/squarespace.js'
import { fetchShopifyProducts } from '../../api/shopify.js'

const PRODUCT_KEY = 'sip_products'
const SYNCED_AT_KEY = 'sip_products_synced_at'

const FAKE_PRODUCTS = [{ id: 'p1', name: 'Widget', price: 9.99 }]

function renderSync(props = {}) {
  return renderHook(
    () =>
      useCatalogSync({
        activeIntegration: null,
        sqApiKey: null,
        shopifyShopDomain: null,
        shopifyAccessToken: null,
        onSyncStats: null,
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

describe('useCatalogSync — initial state', () => {
  it('loads products from localStorage when present', () => {
    localStorage.setItem(PRODUCT_KEY, JSON.stringify(FAKE_PRODUCTS))
    const { result } = renderSync()
    expect(result.current.products).toEqual(FAKE_PRODUCTS)
  })

  it('falls back to SAMPLE_PRODUCTS when localStorage is empty', () => {
    const { result } = renderSync()
    expect(result.current.products).toEqual(SAMPLE_PRODUCTS)
  })

  it('falls back to SAMPLE_PRODUCTS when localStorage contains malformed JSON', () => {
    localStorage.setItem(PRODUCT_KEY, 'not valid json {{{')
    const { result } = renderSync()
    expect(result.current.products).toEqual(SAMPLE_PRODUCTS)
  })

  it('reads lastSynced from localStorage when present', () => {
    const ts = 1700000000000
    localStorage.setItem(SYNCED_AT_KEY, String(ts))
    const { result } = renderSync()
    expect(result.current.lastSynced).toBe(ts)
  })

  it('initialises lastSynced to null when absent', () => {
    const { result } = renderSync()
    expect(result.current.lastSynced).toBeNull()
  })

  it('starts with syncStatus idle and syncCount 0', () => {
    const { result } = renderSync()
    expect(result.current.syncStatus).toBe('idle')
    expect(result.current.syncCount).toBe(0)
  })
})

describe('useCatalogSync — saveProducts', () => {
  it('updates products state and persists to localStorage', () => {
    const { result } = renderSync()
    act(() => {
      result.current.saveProducts(FAKE_PRODUCTS)
    })
    expect(result.current.products).toEqual(FAKE_PRODUCTS)
    expect(JSON.parse(localStorage.getItem(PRODUCT_KEY))).toEqual(FAKE_PRODUCTS)
  })

  it('updates lastSynced to a recent timestamp', () => {
    const before = Date.now()
    const { result } = renderSync()
    act(() => {
      result.current.saveProducts([])
    })
    expect(result.current.lastSynced).toBeGreaterThanOrEqual(before)
    expect(result.current.lastSynced).toBeLessThanOrEqual(Date.now())
  })
})

describe('useCatalogSync — handleSyncCatalog (Squarespace)', () => {
  it('does nothing when no provider is configured', async () => {
    const { result } = renderSync()
    await act(async () => {
      await result.current.handleSyncCatalog()
    })
    expect(fetchSquarespaceProducts).not.toHaveBeenCalled()
    expect(result.current.syncStatus).toBe('idle')
  })

  it('syncs via squarespace when sqApiKey is provided', async () => {
    fetchSquarespaceProducts.mockResolvedValueOnce(FAKE_PRODUCTS)
    const { result } = renderSync({ sqApiKey: 'sqsp-key' })

    await act(async () => {
      await result.current.handleSyncCatalog()
    })

    expect(fetchSquarespaceProducts).toHaveBeenCalledWith(
      'sqsp-key',
      expect.any(Function),
      expect.any(Function),
    )
    expect(result.current.products).toEqual(FAKE_PRODUCTS)
    expect(result.current.syncStatus).toBe('ok')
  })

  it('sets syncStatus to error when squarespace fetch throws', async () => {
    fetchSquarespaceProducts.mockRejectedValueOnce(new Error('network error'))
    const { result } = renderSync({ sqApiKey: 'sqsp-key' })

    await act(async () => {
      await result.current.handleSyncCatalog()
    })

    expect(result.current.syncStatus).toBe('error')
  })

  it('fires onSyncStats callback after successful sync', async () => {
    const stats = { parentCount: 5, variantCount: 12 }
    fetchSquarespaceProducts.mockImplementationOnce(async (_key, _onProgress, onStats) => {
      onStats(stats)
      return FAKE_PRODUCTS
    })
    const onSyncStats = vi.fn()
    const { result } = renderSync({ sqApiKey: 'sqsp-key', onSyncStats })

    await act(async () => {
      await result.current.handleSyncCatalog()
    })

    expect(onSyncStats).toHaveBeenCalledWith(stats)
    expect(result.current.syncStatus).toBe('ok')
  })

  it('does not propagate errors thrown by onSyncStats', async () => {
    const stats = { parentCount: 1, variantCount: 1 }
    fetchSquarespaceProducts.mockImplementationOnce(async (_key, _onProgress, onStats) => {
      onStats(stats)
      return FAKE_PRODUCTS
    })
    const onSyncStats = vi.fn(() => {
      throw new Error('consumer crash')
    })
    const { result } = renderSync({ sqApiKey: 'sqsp-key', onSyncStats })

    await act(async () => {
      await result.current.handleSyncCatalog()
    })

    expect(result.current.syncStatus).toBe('ok')
  })

  it('prefers activeIntegration over key-based provider detection', async () => {
    fetchSquarespaceProducts.mockResolvedValueOnce(FAKE_PRODUCTS)
    const { result } = renderSync({
      activeIntegration: 'squarespace',
      sqApiKey: 'sqsp-key',
    })

    await act(async () => {
      await result.current.handleSyncCatalog()
    })

    expect(fetchSquarespaceProducts).toHaveBeenCalled()
  })
})

describe('useCatalogSync — handleSyncCatalog (Shopify)', () => {
  it('syncs via shopify when shopifyAccessToken is provided', async () => {
    fetchShopifyProducts.mockResolvedValueOnce(FAKE_PRODUCTS)
    const { result } = renderSync({
      shopifyShopDomain: 'mystore.myshopify.com',
      shopifyAccessToken: 'shpat_test',
    })

    await act(async () => {
      await result.current.handleSyncCatalog()
    })

    expect(fetchShopifyProducts).toHaveBeenCalledWith(
      'mystore.myshopify.com',
      'shpat_test',
      expect.any(Function),
      expect.any(Function),
    )
    expect(result.current.products).toEqual(FAKE_PRODUCTS)
    expect(result.current.syncStatus).toBe('ok')
  })

  it('returns to idle when shopify domain is missing', async () => {
    const { result } = renderSync({
      activeIntegration: 'shopify',
      shopifyAccessToken: 'shpat_test',
    })

    await act(async () => {
      await result.current.handleSyncCatalog()
    })

    expect(fetchShopifyProducts).not.toHaveBeenCalled()
  })

  it('sets syncStatus to error when shopify fetch throws', async () => {
    fetchShopifyProducts.mockRejectedValueOnce(new Error('timeout'))
    const { result } = renderSync({
      shopifyShopDomain: 'mystore.myshopify.com',
      shopifyAccessToken: 'shpat_test',
    })

    await act(async () => {
      await result.current.handleSyncCatalog()
    })

    expect(result.current.syncStatus).toBe('error')
  })

  it('toasts network error message on Failed to fetch', async () => {
    const networkErr = new Error('Failed to fetch')
    fetchSquarespaceProducts.mockRejectedValueOnce(networkErr)
    const { result } = renderSync({ sqApiKey: 'sqsp-key' })

    await act(async () => {
      await result.current.handleSyncCatalog()
    })

    expect(mockToast).toHaveBeenCalledWith('Sync failed: check your connection', 'error')
    expect(result.current.syncStatus).toBe('error')
  })

  it('toasts auth error message on 401', async () => {
    const err = new Error('Unauthorized')
    err.status = 401
    fetchSquarespaceProducts.mockRejectedValueOnce(err)
    const { result } = renderSync({ sqApiKey: 'sqsp-key' })

    await act(async () => {
      await result.current.handleSyncCatalog()
    })

    expect(mockToast).toHaveBeenCalledWith('Sync failed: API key invalid — check Settings', 'error')
    expect(result.current.syncStatus).toBe('error')
  })

  it('toasts auth error message on 403', async () => {
    const err = new Error('Forbidden')
    err.status = 403
    fetchSquarespaceProducts.mockRejectedValueOnce(err)
    const { result } = renderSync({ sqApiKey: 'sqsp-key' })

    await act(async () => {
      await result.current.handleSyncCatalog()
    })

    expect(mockToast).toHaveBeenCalledWith('Sync failed: API key invalid — check Settings', 'error')
    expect(result.current.syncStatus).toBe('error')
  })

  it('toasts rate limit warning on 429', async () => {
    const err = new Error('Too Many Requests')
    err.status = 429
    fetchSquarespaceProducts.mockRejectedValueOnce(err)
    const { result } = renderSync({ sqApiKey: 'sqsp-key' })

    await act(async () => {
      await result.current.handleSyncCatalog()
    })

    expect(mockToast).toHaveBeenCalledWith('Sync failed: rate limited — try again later', 'warning')
    expect(result.current.syncStatus).toBe('error')
  })

  it('toasts generic message on unknown error', async () => {
    fetchSquarespaceProducts.mockRejectedValueOnce(new Error('something broke'))
    const { result } = renderSync({ sqApiKey: 'sqsp-key' })

    await act(async () => {
      await result.current.handleSyncCatalog()
    })

    expect(mockToast).toHaveBeenCalledWith('Sync failed — try again later', 'error')
    expect(result.current.syncStatus).toBe('error')
  })
})
