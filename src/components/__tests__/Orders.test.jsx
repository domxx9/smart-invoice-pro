import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { OrderContext } from '../../contexts/OrderContext.jsx'
import { Orders } from '../Orders.jsx'

vi.mock('../../contexts/SettingsContext.jsx', () => ({
  useSettings: vi.fn(),
}))

vi.mock('../PickSheet.jsx', () => ({
  PickSheet: ({ order, onClose }) => (
    <div data-testid="pick-sheet">
      <span>PickSheet for {order.orderNumber}</span>
      <button onClick={onClose}>Close</button>
    </div>
  ),
}))

import { useSettings } from '../../contexts/SettingsContext.jsx'

function makeOrder(overrides = {}) {
  return {
    id: 'ord-1',
    orderNumber: '1001',
    status: 'PENDING',
    customer: 'Alice',
    email: 'alice@example.com',
    createdOn: '2024-06-01T10:00:00.000Z',
    total: 150,
    lineItems: [{ name: 'Widget', qty: 2, price: 50 }],
    ...overrides,
  }
}

function makeOrderSync(overrides = {}) {
  return {
    orders: [],
    handleSyncOrders: vi.fn(),
    orderSyncStatus: 'idle',
    orderSyncCount: 0,
    lastOrderSync: null,
    picks: {},
    savePick: vi.fn(),
    ...overrides,
  }
}

function makeSettings(overrides = {}) {
  return {
    activeIntegration: 'squarespace',
    sqApiKey: 'sqsp-test-key',
    shopifyShopDomain: '',
    shopifyAccessToken: '',
    ...overrides,
  }
}

function renderOrders({ orderSync = {}, settings = {} } = {}) {
  const orderSyncValue = makeOrderSync(orderSync)
  const settingsValue = makeSettings(settings)
  useSettings.mockReturnValue({ settings: settingsValue, saveSettings: vi.fn() })
  return render(
    <OrderContext.Provider value={{ orderSync: orderSyncValue }}>
      <Orders />
    </OrderContext.Provider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('Orders — empty state', () => {
  it('shows "No orders synced yet." when orders is empty', () => {
    renderOrders()
    expect(screen.getByText('No orders synced yet.')).toBeInTheDocument()
  })

  it('renders an Orders heading with count', () => {
    renderOrders()
    expect(screen.getByRole('heading', { level: 2 })).toBeInTheDocument()
    expect(screen.getByText('(0)')).toBeInTheDocument()
  })

  it('shows Sync button', () => {
    renderOrders()
    expect(screen.getByRole('button', { name: /sync/i })).toBeInTheDocument()
  })

  it('disables Sync button when no API key is set', () => {
    renderOrders({ settings: { activeIntegration: 'squarespace', sqApiKey: '' } })
    expect(screen.getByRole('button', { name: /sync/i })).toBeDisabled()
  })

  it('shows warning message when no API key is configured', () => {
    renderOrders({ settings: { activeIntegration: 'squarespace', sqApiKey: '' } })
    expect(screen.getByText(/squarespace api key/i)).toBeInTheDocument()
  })

  it('disables Sync button while syncing', () => {
    renderOrders({ orderSync: { orderSyncStatus: 'syncing' } })
    expect(screen.getByRole('button', { name: /syncing/i })).toBeDisabled()
  })

  it('calls handleSyncOrders on Sync click', () => {
    const handleSyncOrders = vi.fn()
    renderOrders({ orderSync: { handleSyncOrders } })
    fireEvent.click(screen.getByRole('button', { name: /sync/i }))
    expect(handleSyncOrders).toHaveBeenCalledOnce()
  })
})

describe('Orders — sync status labels', () => {
  it('shows "Synced ✓" when status is ok', () => {
    renderOrders({ orderSync: { orderSyncStatus: 'ok' } })
    expect(screen.getByRole('button', { name: /synced/i })).toBeInTheDocument()
  })

  it('shows "Retry" when status is error', () => {
    renderOrders({ orderSync: { orderSyncStatus: 'error' } })
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument()
  })

  it('shows error message when sync failed', () => {
    renderOrders({ orderSync: { orderSyncStatus: 'error' } })
    expect(screen.getByText(/sync failed/i)).toBeInTheDocument()
  })

  it('shows fetch count while syncing', () => {
    renderOrders({ orderSync: { orderSyncStatus: 'syncing', orderSyncCount: 12 } })
    expect(screen.getByText(/12 fetched/i)).toBeInTheDocument()
  })
})

describe('Orders — rendering orders', () => {
  it('renders order number and customer', () => {
    renderOrders({ orderSync: { orders: [makeOrder()] } })
    expect(screen.getByText('#1001')).toBeInTheDocument()
    expect(screen.getByText(/Alice/)).toBeInTheDocument()
  })

  it('updates visible count in heading', () => {
    renderOrders({
      orderSync: {
        orders: [makeOrder({ id: 'o1' }), makeOrder({ id: 'o2', orderNumber: '1002' })],
      },
    })
    expect(screen.getByText('(2)')).toBeInTheDocument()
  })

  it('expands order on click to show line items', () => {
    renderOrders({ orderSync: { orders: [makeOrder()] } })
    fireEvent.click(screen.getByRole('button', { name: /order 1001/i }))
    expect(screen.getByText(/Widget × 2/)).toBeInTheDocument()
  })

  it('collapses order on second click', () => {
    renderOrders({ orderSync: { orders: [makeOrder()] } })
    const btn = screen.getByRole('button', { name: /order 1001/i })
    fireEvent.click(btn)
    fireEvent.click(btn)
    expect(screen.queryByText(/Widget × 2/)).toBeNull()
  })

  it('shows customer email when expanded', () => {
    renderOrders({ orderSync: { orders: [makeOrder()] } })
    fireEvent.click(screen.getByRole('button', { name: /order 1001/i }))
    expect(screen.getByText('alice@example.com')).toBeInTheDocument()
  })

  it('shows "Start Pick" for PENDING orders when expanded', () => {
    renderOrders({ orderSync: { orders: [makeOrder({ status: 'PENDING' })] } })
    fireEvent.click(screen.getByRole('button', { name: /order 1001/i }))
    expect(screen.getByRole('button', { name: /start pick/i })).toBeInTheDocument()
  })

  it('does not show "Start Pick" for FULFILLED orders', () => {
    renderOrders({ orderSync: { orders: [makeOrder({ status: 'FULFILLED' })] } })
    fireEvent.click(screen.getByRole('button', { name: /order 1001/i }))
    expect(screen.queryByRole('button', { name: /start pick/i })).toBeNull()
  })
})

describe('Orders — filter chips', () => {
  const orders = [
    makeOrder({ id: 'o1', status: 'PENDING' }),
    makeOrder({ id: 'o2', orderNumber: '1002', status: 'FULFILLED' }),
  ]

  it('shows All filter chip pressed by default', () => {
    renderOrders({ orderSync: { orders } })
    const allChip = screen.getAllByRole('button').find((b) => b.textContent === 'All')
    expect(allChip).toHaveAttribute('aria-pressed', 'true')
  })

  it('filters to PENDING orders', () => {
    renderOrders({ orderSync: { orders } })
    fireEvent.click(screen.getByRole('button', { name: 'Pending' }))
    expect(screen.getByText('#1001')).toBeInTheDocument()
    expect(screen.queryByText('#1002')).toBeNull()
  })

  it('shows "No orders match this filter." when filter has no results', () => {
    renderOrders({ orderSync: { orders: [makeOrder({ status: 'PENDING' })] } })
    fireEvent.click(screen.getByRole('button', { name: 'Fulfilled' }))
    expect(screen.getByText(/no orders match this filter/i)).toBeInTheDocument()
  })
})

describe('Orders — pick sheet', () => {
  it('opens PickSheet when "Start Pick" is clicked', () => {
    renderOrders({ orderSync: { orders: [makeOrder()] } })
    fireEvent.click(screen.getByRole('button', { name: /order 1001/i }))
    fireEvent.click(screen.getByRole('button', { name: /start pick/i }))
    expect(screen.getByTestId('pick-sheet')).toBeInTheDocument()
    expect(screen.getByText('PickSheet for 1001')).toBeInTheDocument()
  })

  it('closes PickSheet when onClose is called', () => {
    renderOrders({ orderSync: { orders: [makeOrder()] } })
    fireEvent.click(screen.getByRole('button', { name: /order 1001/i }))
    fireEvent.click(screen.getByRole('button', { name: /start pick/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.queryByTestId('pick-sheet')).toBeNull()
  })

  it('shows pick progress when some items are picked', () => {
    const orders = [makeOrder()]
    const picks = { 'ord-1': { 0: 1 } }
    renderOrders({ orderSync: { orders, picks } })
    expect(screen.getByText('1/2 picked')).toBeInTheDocument()
  })

  it('shows "✓ Picked" when all items are picked', () => {
    const orders = [makeOrder()]
    const picks = { 'ord-1': { 0: 2 } }
    renderOrders({ orderSync: { orders, picks } })
    expect(screen.getByText('✓ Picked')).toBeInTheDocument()
  })

  it('shows "Resume Pick" label when picking is partially done and order is expanded', () => {
    const orders = [makeOrder()]
    const picks = { 'ord-1': { 0: 1 } }
    renderOrders({ orderSync: { orders, picks } })
    fireEvent.click(screen.getByRole('button', { name: /order 1001/i }))
    expect(screen.getByRole('button', { name: /resume pick/i })).toBeInTheDocument()
  })
})

describe('Orders — Shopify integration', () => {
  it('enables Sync when shopify credentials are both set', () => {
    renderOrders({
      settings: {
        activeIntegration: 'shopify',
        shopifyShopDomain: 'my-store.myshopify.com',
        shopifyAccessToken: 'shpat_abc',
      },
    })
    expect(screen.getByRole('button', { name: /sync/i })).not.toBeDisabled()
  })

  it('disables Sync when shopify domain is missing', () => {
    renderOrders({
      settings: {
        activeIntegration: 'shopify',
        shopifyShopDomain: '',
        shopifyAccessToken: 'shpat_abc',
      },
    })
    expect(screen.getByRole('button', { name: /sync/i })).toBeDisabled()
  })
})
