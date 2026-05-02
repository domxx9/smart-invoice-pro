import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CatalogProvider, useCatalog } from '../CatalogContext.jsx'
import { SettingsProvider } from '../SettingsContext.jsx'

let mockUseCatalogSync = vi.fn(() => ({
  products: [],
  saveProducts: vi.fn(),
  lastSynced: null,
  syncStatus: 'idle',
  syncCount: 0,
  handleSyncCatalog: vi.fn(),
}))

vi.mock('../../hooks/useCatalogSync.js', () => ({
  useCatalogSync: (...args) => mockUseCatalogSync(...args),
}))

const TestConsumer = () => {
  const { catalog } = useCatalog()
  return (
    <div>
      <span data-testid="products">
        {Array.isArray(catalog.products) ? 'array' : typeof catalog.products}
      </span>
      <span data-testid="sync-status">{catalog.syncStatus}</span>
      <span data-testid="save-products">{typeof catalog.saveProducts}</span>
      <span data-testid="handle-sync-catalog">{typeof catalog.handleSyncCatalog}</span>
    </div>
  )
}

const ErrorConsumer = () => {
  const { catalog } = useCatalog()
  return <span data-testid="sync-status">{catalog.syncStatus}</span>
}

describe('<CatalogProvider />', () => {
  beforeEach(() => {
    mockUseCatalogSync = vi.fn(() => ({
      products: [],
      saveProducts: vi.fn(),
      lastSynced: null,
      syncStatus: 'idle',
      syncCount: 0,
      handleSyncCatalog: vi.fn(),
    }))
  })

  it('renders children', () => {
    render(
      <SettingsProvider>
        <CatalogProvider>
          <div data-testid="child">child</div>
        </CatalogProvider>
      </SettingsProvider>,
    )
    expect(screen.getByTestId('child')).toBeInTheDocument()
  })

  it('useCatalog() returns expected shape', () => {
    render(
      <SettingsProvider>
        <CatalogProvider>
          <TestConsumer />
        </CatalogProvider>
      </SettingsProvider>,
    )
    expect(screen.getByTestId('products')).toHaveTextContent('array')
    expect(screen.getByTestId('sync-status')).toHaveTextContent('idle')
    expect(screen.getByTestId('save-products')).toHaveTextContent('function')
    expect(screen.getByTestId('handle-sync-catalog')).toHaveTextContent('function')
  })

  it('throws if used outside CatalogProvider', () => {
    const consoleError = vi.spyOn(console, 'error').mockReturnValue(undefined)
    expect(() => render(<TestConsumer />)).toThrow('useCatalog must be used within CatalogProvider')
    consoleError.mockRestore()
  })

  it('mutation fns accessible from context', () => {
    render(
      <SettingsProvider>
        <CatalogProvider>
          <TestConsumer />
        </CatalogProvider>
      </SettingsProvider>,
    )
    expect(screen.getByTestId('handle-sync-catalog')).toHaveTextContent('function')
    expect(screen.getByTestId('save-products')).toHaveTextContent('function')
  })

  it('error syncStatus propagated through context', () => {
    mockUseCatalogSync = vi.fn(() => ({
      products: [],
      saveProducts: vi.fn(),
      lastSynced: null,
      syncStatus: 'error',
      syncCount: 0,
      handleSyncCatalog: vi.fn(),
    }))
    render(
      <SettingsProvider>
        <CatalogProvider>
          <ErrorConsumer />
        </CatalogProvider>
      </SettingsProvider>,
    )
    expect(screen.getByTestId('sync-status')).toHaveTextContent('error')
  })
})
