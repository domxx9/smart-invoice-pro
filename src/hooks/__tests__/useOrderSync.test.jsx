import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useOrderSync } from '../useOrderSync.js'
import * as squarespaceApi from '../../api/squarespace.js'
import * as shopifyApi from '../../api/shopify.js'
import { ToastProvider } from '../../contexts/ToastContext.jsx'

vi.mock('../../api/squarespace.js')
vi.mock('../../api/shopify.js')

const fakeToast = vi.fn()

vi.mock('../../contexts/ToastContext.jsx', () => ({
  ToastProvider: ({ children }) => children,
  useToast: () => ({ toast: fakeToast }),
}))

beforeEach(() => {
  localStorage.clear()
  fakeToast.mockClear()
})

function renderUseOrderSync(overrides = {}) {
  const wrapper = ({ children }) => <ToastProvider>{children}</ToastProvider>
  return renderHook(
    () =>
      useOrderSync({
        activeIntegration: null,
        sqApiKey: null,
        shopifyShopDomain: null,
        shopifyAccessToken: null,
        ...overrides,
      }),
    { wrapper },
  )
}

describe('useOrderSync error surfacing via ToastContext', () => {
  it('shows network toast and sets orderSyncStatus error on TypeError (offline)', async () => {
    vi.mocked(squarespaceApi.fetchSquarespaceOrders).mockRejectedValueOnce(
      new TypeError('Failed to fetch'),
    )

    const { result } = renderUseOrderSync({ sqApiKey: 'test-key' })

    await act(async () => {
      await result.current.handleSyncOrders()
    })

    expect(fakeToast).toHaveBeenCalledWith('Order sync failed — check your connection.', 'error')
    expect(result.current.orderSyncStatus).toBe('error')
  })

  it('shows network toast on failed fetch with NetworkError message', async () => {
    vi.mocked(squarespaceApi.fetchSquarespaceOrders).mockRejectedValueOnce(
      new Error('NetworkError: Something went wrong'),
    )

    const { result } = renderUseOrderSync({ sqApiKey: 'test-key' })

    await act(async () => {
      await result.current.handleSyncOrders()
    })

    expect(fakeToast).toHaveBeenCalledWith('Order sync failed — check your connection.', 'error')
    expect(result.current.orderSyncStatus).toBe('error')
  })

  it('shows auth toast and sets orderSyncStatus error on 401/403', async () => {
    vi.mocked(squarespaceApi.fetchSquarespaceOrders).mockRejectedValueOnce(
      new Error('HTTP 401 Unauthorized'),
    )

    const { result } = renderUseOrderSync({ sqApiKey: 'test-key' })

    await act(async () => {
      await result.current.handleSyncOrders()
    })

    expect(fakeToast).toHaveBeenCalledWith(
      'Order sync failed — check your API key in Settings.',
      'error',
    )
    expect(result.current.orderSyncStatus).toBe('error')
  })

  it('shows rateLimit toast with warning type on 429', async () => {
    vi.mocked(squarespaceApi.fetchSquarespaceOrders).mockRejectedValueOnce(
      new Error('HTTP 429 Too Many Requests'),
    )

    const { result } = renderUseOrderSync({ sqApiKey: 'test-key' })

    await act(async () => {
      await result.current.handleSyncOrders()
    })

    expect(fakeToast).toHaveBeenCalledWith(
      'Order sync rate limited — try again in a moment.',
      'warning',
    )
    expect(result.current.orderSyncStatus).toBe('error')
  })

  it('shows generic api toast and sets orderSyncStatus error on unknown errors', async () => {
    vi.mocked(squarespaceApi.fetchSquarespaceOrders).mockRejectedValueOnce(
      new Error('Internal Server Error'),
    )

    const { result } = renderUseOrderSync({ sqApiKey: 'test-key' })

    await act(async () => {
      await result.current.handleSyncOrders()
    })

    expect(fakeToast).toHaveBeenCalledWith('Order sync failed — API error.', 'error')
    expect(result.current.orderSyncStatus).toBe('error')
  })

  it('shows network toast and sets error when shopify fetch fails', async () => {
    vi.mocked(shopifyApi.fetchShopifyOrders).mockRejectedValueOnce(new TypeError('network error'))

    const { result } = renderUseOrderSync({
      shopifyShopDomain: 'test.myshopify.com',
      shopifyAccessToken: 'test-token',
    })

    await act(async () => {
      await result.current.handleSyncOrders()
    })

    expect(fakeToast).toHaveBeenCalledWith('Order sync failed — check your connection.', 'error')
    expect(result.current.orderSyncStatus).toBe('error')
  })

  it('shows auth toast when shopify fetch returns 401', async () => {
    vi.mocked(shopifyApi.fetchShopifyOrders).mockRejectedValueOnce(
      new Error('HTTP 401 Unauthorized'),
    )

    const { result } = renderUseOrderSync({
      shopifyShopDomain: 'test.myshopify.com',
      shopifyAccessToken: 'test-token',
    })

    await act(async () => {
      await result.current.handleSyncOrders()
    })

    expect(fakeToast).toHaveBeenCalledWith(
      'Order sync failed — check your API key in Settings.',
      'error',
    )
    expect(result.current.orderSyncStatus).toBe('error')
  })

  it('shows auth toast when shopify fetch returns 403', async () => {
    vi.mocked(shopifyApi.fetchShopifyOrders).mockRejectedValueOnce(new Error('HTTP 403 Forbidden'))

    const { result } = renderUseOrderSync({
      shopifyShopDomain: 'test.myshopify.com',
      shopifyAccessToken: 'test-token',
    })

    await act(async () => {
      await result.current.handleSyncOrders()
    })

    expect(fakeToast).toHaveBeenCalledWith(
      'Order sync failed — check your API key in Settings.',
      'error',
    )
    expect(result.current.orderSyncStatus).toBe('error')
  })
})
