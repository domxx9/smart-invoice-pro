import { describe, it, expect, beforeEach, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useCatalogSync } from '../useCatalogSync.js'
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

function renderUseCatalogSync(overrides = {}) {
  const wrapper = ({ children }) => <ToastProvider>{children}</ToastProvider>
  return renderHook(
    () =>
      useCatalogSync({
        activeIntegration: 'squarespace',
        sqApiKey: 'test-key',
        shopifyShopDomain: '',
        shopifyAccessToken: '',
        ...overrides,
      }),
    { wrapper },
  )
}

describe('useCatalogSync error surfacing via ToastContext', () => {
  it('shows network toast and sets syncStatus error on TypeError (offline)', async () => {
    vi.mocked(squarespaceApi.fetchSquarespaceProducts).mockRejectedValueOnce(
      new TypeError('Failed to fetch'),
    )

    const { result } = renderUseCatalogSync()

    await act(async () => {
      await result.current.handleSyncCatalog()
    })

    expect(fakeToast).toHaveBeenCalledWith('Sync failed — check your connection.', 'error')
    expect(result.current.syncStatus).toBe('error')
  })

  it('shows network toast on failed fetch with NetworkError message', async () => {
    vi.mocked(squarespaceApi.fetchSquarespaceProducts).mockRejectedValueOnce(
      new Error('NetworkError: Something went wrong'),
    )

    const { result } = renderUseCatalogSync()

    await act(async () => {
      await result.current.handleSyncCatalog()
    })

    expect(fakeToast).toHaveBeenCalledWith('Sync failed — check your connection.', 'error')
    expect(result.current.syncStatus).toBe('error')
  })

  it('shows auth toast and sets syncStatus error on 401/403', async () => {
    vi.mocked(squarespaceApi.fetchSquarespaceProducts).mockRejectedValueOnce(
      new Error('HTTP 401 Unauthorized'),
    )

    const { result } = renderUseCatalogSync()

    await act(async () => {
      await result.current.handleSyncCatalog()
    })

    expect(fakeToast).toHaveBeenCalledWith(
      'Sync failed — API key invalid — check Settings.',
      'error',
    )
    expect(result.current.syncStatus).toBe('error')
  })

  it('shows rateLimit toast with warning type on 429', async () => {
    vi.mocked(squarespaceApi.fetchSquarespaceProducts).mockRejectedValueOnce(
      new Error('HTTP 429 Too Many Requests'),
    )

    const { result } = renderUseCatalogSync()

    await act(async () => {
      await result.current.handleSyncCatalog()
    })

    expect(fakeToast).toHaveBeenCalledWith('Sync rate limited — try again later.', 'warning')
    expect(result.current.syncStatus).toBe('error')
  })

  it('shows generic api toast and sets syncStatus error on unknown errors', async () => {
    vi.mocked(squarespaceApi.fetchSquarespaceProducts).mockRejectedValueOnce(
      new Error('Internal Server Error'),
    )

    const { result } = renderUseCatalogSync()

    await act(async () => {
      await result.current.handleSyncCatalog()
    })

    expect(fakeToast).toHaveBeenCalledWith('Sync failed — API error.', 'error')
    expect(result.current.syncStatus).toBe('error')
  })

  it('sets syncStatus error and shows toast when shopify fetch fails', async () => {
    const { result } = renderUseCatalogSync({
      activeIntegration: 'shopify',
      sqApiKey: '',
      shopifyShopDomain: 'test.myshopify.com',
      shopifyAccessToken: 'test-token',
    })

    vi.mocked(shopifyApi.fetchShopifyProducts).mockRejectedValueOnce(new TypeError('network error'))

    await act(async () => {
      await result.current.handleSyncCatalog()
    })

    expect(fakeToast).toHaveBeenCalledWith('Sync failed — check your connection.', 'error')
    expect(result.current.syncStatus).toBe('error')
  })
})
