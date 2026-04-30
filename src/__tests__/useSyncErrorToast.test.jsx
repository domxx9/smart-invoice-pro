import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'

const mockToast = vi.fn()

vi.mock('../contexts/ToastContext.jsx', () => ({
  useToast: () => ({ toast: mockToast, dismissToast: vi.fn() }),
  ToastProvider: ({ children }) => children,
}))

vi.mock('../api/squarespace.js', () => ({
  fetchSquarespaceProducts: vi.fn(),
  fetchSquarespaceOrders: vi.fn(),
}))

import { fetchSquarespaceProducts, fetchSquarespaceOrders } from '../api/squarespace.js'
import { useCatalogSync } from '../hooks/useCatalogSync.js'
import { useOrderSync } from '../hooks/useOrderSync.js'

function makeNetworkError(msg = 'Failed to fetch') {
  return new TypeError(msg)
}

function makeApiError(status) {
  return new Error(`HTTP ${status} Unauthorized`)
}

describe('useCatalogSync — error surfacing', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
  })

  it('shows network toast on TypeError (offline)', async () => {
    fetchSquarespaceProducts.mockRejectedValueOnce(makeNetworkError())
    const { result } = renderHook(() =>
      useCatalogSync({ sqApiKey: 'key', activeIntegration: 'squarespace' }),
    )

    await act(async () => {
      await result.current.handleSyncCatalog()
    })

    expect(mockToast).toHaveBeenCalledWith('Sync failed — check your connection.', 'error')
    expect(result.current.syncStatus).toBe('error')
  })

  it('shows auth toast on 401 error', async () => {
    fetchSquarespaceProducts.mockRejectedValueOnce(makeApiError(401))
    const { result } = renderHook(() =>
      useCatalogSync({ sqApiKey: 'key', activeIntegration: 'squarespace' }),
    )

    await act(async () => {
      await result.current.handleSyncCatalog()
    })

    expect(mockToast).toHaveBeenCalledWith(
      'Sync failed — API key invalid — check Settings.',
      'error',
    )
    expect(result.current.syncStatus).toBe('error')
  })

  it('shows rate-limit toast with warning type on 429', async () => {
    fetchSquarespaceProducts.mockRejectedValueOnce(new Error('HTTP 429 Too Many Requests'))
    const { result } = renderHook(() =>
      useCatalogSync({ sqApiKey: 'key', activeIntegration: 'squarespace' }),
    )

    await act(async () => {
      await result.current.handleSyncCatalog()
    })

    expect(mockToast).toHaveBeenCalledWith('Sync rate limited — try again later.', 'warning')
    expect(result.current.syncStatus).toBe('error')
  })

  it('shows api toast on generic error', async () => {
    fetchSquarespaceProducts.mockRejectedValueOnce(new Error('Squarespace API error'))
    const { result } = renderHook(() =>
      useCatalogSync({ sqApiKey: 'key', activeIntegration: 'squarespace' }),
    )

    await act(async () => {
      await result.current.handleSyncCatalog()
    })

    expect(mockToast).toHaveBeenCalledWith('Sync failed — API error.', 'error')
    expect(result.current.syncStatus).toBe('error')
  })

  it('sets syncStatus to error after all failure paths', async () => {
    fetchSquarespaceProducts.mockRejectedValueOnce(new Error('Unknown'))
    const { result } = renderHook(() =>
      useCatalogSync({ sqApiKey: 'key', activeIntegration: 'squarespace' }),
    )

    await act(async () => {
      await result.current.handleSyncCatalog()
    })

    expect(result.current.syncStatus).toBe('error')
  })
})

describe('useOrderSync — error surfacing', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
  })

  it('shows network toast on TypeError (offline)', async () => {
    fetchSquarespaceOrders.mockRejectedValueOnce(makeNetworkError())
    const { result } = renderHook(() =>
      useOrderSync({ sqApiKey: 'key', activeIntegration: 'squarespace' }),
    )

    await act(async () => {
      await result.current.handleSyncOrders()
    })

    expect(mockToast).toHaveBeenCalledWith('Order sync failed — check your connection.', 'error')
    expect(result.current.orderSyncStatus).toBe('error')
  })

  it('shows auth toast on 401 error', async () => {
    fetchSquarespaceOrders.mockRejectedValueOnce(makeApiError(401))
    const { result } = renderHook(() =>
      useOrderSync({ sqApiKey: 'key', activeIntegration: 'squarespace' }),
    )

    await act(async () => {
      await result.current.handleSyncOrders()
    })

    expect(mockToast).toHaveBeenCalledWith(
      'Order sync failed — check your API key in Settings.',
      'error',
    )
    expect(result.current.orderSyncStatus).toBe('error')
  })

  it('shows auth toast on 403 error', async () => {
    fetchSquarespaceOrders.mockRejectedValueOnce(new Error('HTTP 403 Forbidden'))
    const { result } = renderHook(() =>
      useOrderSync({ sqApiKey: 'key', activeIntegration: 'squarespace' }),
    )

    await act(async () => {
      await result.current.handleSyncOrders()
    })

    expect(mockToast).toHaveBeenCalledWith(
      'Order sync failed — check your API key in Settings.',
      'error',
    )
    expect(result.current.orderSyncStatus).toBe('error')
  })

  it('shows rate-limit toast with warning type on 429', async () => {
    fetchSquarespaceOrders.mockRejectedValueOnce(new Error('HTTP 429 Too Many Requests'))
    const { result } = renderHook(() =>
      useOrderSync({ sqApiKey: 'key', activeIntegration: 'squarespace' }),
    )

    await act(async () => {
      await result.current.handleSyncOrders()
    })

    expect(mockToast).toHaveBeenCalledWith(
      'Order sync rate limited — try again in a moment.',
      'warning',
    )
    expect(result.current.orderSyncStatus).toBe('error')
  })

  it('shows api toast on generic error', async () => {
    fetchSquarespaceOrders.mockRejectedValueOnce(new Error('Squarespace API error'))
    const { result } = renderHook(() =>
      useOrderSync({ sqApiKey: 'key', activeIntegration: 'squarespace' }),
    )

    await act(async () => {
      await result.current.handleSyncOrders()
    })

    expect(mockToast).toHaveBeenCalledWith('Order sync failed — API error.', 'error')
    expect(result.current.orderSyncStatus).toBe('error')
  })

  it('sets orderSyncStatus to error after all failure paths', async () => {
    fetchSquarespaceOrders.mockRejectedValueOnce(new Error('Unknown'))
    const { result } = renderHook(() =>
      useOrderSync({ sqApiKey: 'key', activeIntegration: 'squarespace' }),
    )

    await act(async () => {
      await result.current.handleSyncOrders()
    })

    expect(result.current.orderSyncStatus).toBe('error')
  })
})
