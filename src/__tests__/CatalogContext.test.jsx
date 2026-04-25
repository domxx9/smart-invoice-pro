import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CatalogProvider, useCatalog } from '../contexts/CatalogContext.jsx'
import { SettingsProvider } from '../contexts/SettingsContext.jsx'

const TestConsumer = () => {
  const { catalog } = useCatalog()
  return (
    <div>
      <span data-testid="products">
        {Array.isArray(catalog.products) ? 'array' : typeof catalog.products}
      </span>
      <span data-testid="sync-status">{typeof catalog.syncStatus}</span>
      <span data-testid="save-products">{typeof catalog.saveProducts}</span>
      <span data-testid="handle-sync-catalog">{typeof catalog.handleSyncCatalog}</span>
    </div>
  )
}

describe('<CatalogProvider />', () => {
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
    expect(screen.getByTestId('sync-status')).toHaveTextContent('string')
    expect(screen.getByTestId('save-products')).toHaveTextContent('function')
    expect(screen.getByTestId('handle-sync-catalog')).toHaveTextContent('function')
  })

  it('throws if used outside CatalogProvider', () => {
    const consoleError = vi.spyOn(console, 'error').mockReturnValue(undefined)
    expect(() => render(<TestConsumer />)).toThrow('useCatalog must be used within CatalogProvider')
    consoleError.mockRestore()
  })
})
