import { createContext, useContext } from 'react'
import { useOrderSync } from '../hooks/useOrderSync.js'
import { useSettings } from './SettingsContext.jsx'

export const OrderContext = createContext(null)

export function OrderProvider({ children }) {
  const { settings } = useSettings()

  const syncArgs = {
    activeIntegration: settings.activeIntegration,
    sqApiKey: settings.sqApiKey,
    shopifyShopDomain: settings.shopifyShopDomain,
    shopifyAccessToken: settings.shopifyAccessToken,
  }

  const orderSync = useOrderSync(syncArgs)

  return <OrderContext.Provider value={{ orderSync }}>{children}</OrderContext.Provider>
}

export function useOrders() {
  const ctx = useContext(OrderContext)
  if (!ctx) throw new Error('useOrders must be used within OrderProvider')
  return ctx
}
