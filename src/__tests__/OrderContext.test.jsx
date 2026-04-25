import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { OrderProvider, useOrders } from '../contexts/OrderContext.jsx'
import { SettingsProvider } from '../contexts/SettingsContext.jsx'

const TestConsumer = () => {
  const { orderSync } = useOrders()
  return (
    <div>
      <span data-testid="orders">
        {Array.isArray(orderSync.orders) ? 'array' : typeof orderSync.orders}
      </span>
      <span data-testid="sync-status">{typeof orderSync.orderSyncStatus}</span>
      <span data-testid="handle-sync-orders">{typeof orderSync.handleSyncOrders}</span>
      <span data-testid="save-pick">{typeof orderSync.savePick}</span>
    </div>
  )
}

describe('<OrderProvider />', () => {
  it('renders children', () => {
    render(
      <SettingsProvider>
        <OrderProvider>
          <div data-testid="child">child</div>
        </OrderProvider>
      </SettingsProvider>,
    )
    expect(screen.getByTestId('child')).toBeInTheDocument()
  })

  it('useOrders() returns expected shape', () => {
    render(
      <SettingsProvider>
        <OrderProvider>
          <TestConsumer />
        </OrderProvider>
      </SettingsProvider>,
    )
    expect(screen.getByTestId('orders')).toHaveTextContent('array')
    expect(screen.getByTestId('sync-status')).toHaveTextContent('string')
    expect(screen.getByTestId('handle-sync-orders')).toHaveTextContent('function')
    expect(screen.getByTestId('save-pick')).toHaveTextContent('function')
  })

  it('throws if used outside OrderProvider', () => {
    const consoleError = vi.spyOn(console, 'error').mockReturnValue(undefined)
    expect(() => render(<TestConsumer />)).toThrow('useOrders must be used within OrderProvider')
    consoleError.mockRestore()
  })
})
