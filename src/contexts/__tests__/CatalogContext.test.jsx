import { describe, it, expect, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { CatalogProvider, useCatalog } from '../CatalogContext.jsx'
import { SettingsProvider } from '../SettingsContext.jsx'

vi.mock('../../hooks/useCatalogSync.js', () => ({
  useCatalogSync: vi.fn(() => ({
    products: [],
    saveProducts: vi.fn(),
    lastSynced: null,
    syncStatus: 'idle',
    syncCount: 0,
    handleSyncCatalog: vi.fn(),
  })),
}))

describe('CatalogContext', () => {
  describe('CatalogProvider', () => {
    it('provides catalog context to children', async () => {
      const { result } = renderHook(() => useCatalog(), {
        wrapper: ({ children }) => (
          <SettingsProvider>
            <CatalogProvider>{children}</CatalogProvider>
          </SettingsProvider>
        ),
      })
      await waitFor(() => {
        expect(result.current).toBeTruthy()
        expect(result.current.catalog).toBeDefined()
        expect(result.current.catalog.products).toBeDefined()
      })
    })
  })
})
