import { useState, useCallback } from 'react'
import { SAMPLE_PRODUCTS } from '../constants.js'
import { fetchSquarespaceProducts } from '../api/squarespace.js'
import { fetchShopifyProducts } from '../api/shopify.js'

export function useCatalogSync({
  activeIntegration,
  sqApiKey,
  shopifyShopDomain,
  shopifyAccessToken,
}) {
  const [products, setProducts] = useState(() => {
    const s = localStorage.getItem('sip_products')
    return s ? JSON.parse(s) : SAMPLE_PRODUCTS
  })
  const [lastSynced, setLastSynced] = useState(() => {
    const ts = localStorage.getItem('sip_products_synced_at')
    return ts ? parseInt(ts, 10) : null
  })
  const [syncStatus, setSyncStatus] = useState('idle')
  const [syncCount, setSyncCount] = useState(0)

  const saveProducts = useCallback((prods) => {
    setProducts(prods)
    const ts = Date.now()
    setLastSynced(ts)
    localStorage.setItem('sip_products', JSON.stringify(prods))
    localStorage.setItem('sip_products_synced_at', String(ts))
  }, [])

  const handleSyncCatalog = useCallback(async () => {
    const provider =
      activeIntegration || (sqApiKey ? 'squarespace' : shopifyAccessToken ? 'shopify' : null)
    if (!provider) return
    setSyncStatus('syncing')
    setSyncCount(0)
    try {
      let fetched
      if (provider === 'shopify') {
        if (!shopifyShopDomain || !shopifyAccessToken) return setSyncStatus('idle')
        fetched = await fetchShopifyProducts(shopifyShopDomain, shopifyAccessToken, setSyncCount)
      } else {
        if (!sqApiKey) return setSyncStatus('idle')
        fetched = await fetchSquarespaceProducts(sqApiKey, setSyncCount)
      }
      saveProducts(fetched)
      setSyncStatus('ok')
    } catch {
      setSyncStatus('error')
    }
  }, [activeIntegration, sqApiKey, shopifyShopDomain, shopifyAccessToken, saveProducts])

  return {
    products,
    saveProducts,
    lastSynced,
    syncStatus,
    syncCount,
    handleSyncCatalog,
  }
}
