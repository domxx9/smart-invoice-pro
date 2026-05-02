import { createContext, useContext, useCallback } from 'react'
import { useCatalogSync } from '../hooks/useCatalogSync.js'
import { pickTier } from '../catalog/tier.js'
import { useSettings } from './SettingsContext.jsx'

export const CatalogContext = createContext(null)

export function CatalogProvider({ children }) {
  const { settings, saveSettings } = useSettings()

  const handleSyncStats = useCallback(
    (stats) => {
      const nextTier = pickTier(stats)
      if (nextTier !== settings.searchTier) {
        saveSettings({ ...settings, searchTier: nextTier })
      }
    },
    [settings, saveSettings],
  )

  const syncArgs = {
    activeIntegration: settings.activeIntegration,
    sqApiKey: settings.sqApiKey,
    shopifyShopDomain: settings.shopifyShopDomain,
    shopifyAccessToken: settings.shopifyAccessToken,
  }

  const catalog = useCatalogSync({ ...syncArgs, onSyncStats: handleSyncStats })

  return <CatalogContext.Provider value={{ catalog }}>{children}</CatalogContext.Provider>
}

export function useCatalog() {
  const ctx = useContext(CatalogContext)
  if (!ctx) throw new Error('useCatalog must be used within CatalogProvider')
  return ctx
}
