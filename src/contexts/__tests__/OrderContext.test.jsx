import { describe, it, expect, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { OrderProvider, useOrders } from '../OrderContext.jsx'
import { SettingsProvider } from '../SettingsContext.jsx'

vi.mock('../../hooks/useOrderSync.js', () => ({
  useOrderSync: vi.fn(() => ({
    orders: [],
    lastOrderSync: null,
    orderSyncStatus: 'idle',
    orderSyncCount: 0,
    picks: {},
    savePick: vi.fn(),
    handleSyncOrders: vi.fn(),
  })),
}))

describe('OrderContext', () => {
  describe('OrderProvider', () => {
    it('provides orderSync context to children', async () => {
      const { result } = renderHook(() => useOrders(), {
        wrapper: ({ children }) => (
          <SettingsProvider>
            <OrderProvider>{children}</OrderProvider>
          </SettingsProvider>
        ),
      })
      await waitFor(() => {
        expect(result.current).toBeTruthy()
        expect(result.current.orderSync).toBeDefined()
        expect(result.current.orderSync.orders).toBeDefined()
      })
    })
  })
})
