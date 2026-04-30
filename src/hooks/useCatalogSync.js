import { useState, useCallback } from 'react'
import { SAMPLE_PRODUCTS } from '../constants.js'
import { fetchSquarespaceProducts } from '../api/squarespace.js'
import { fetchShopifyProducts } from '../api/shopify.js'
import { useToast } from '../contexts/ToastContext.jsx'
import { classifySyncError } from './syncError.js'

// Full-sync completion is the single source of truth for post-sync side
// effects like `searchTier` (SMA-123). `onSyncStats` fires with catalog
// stats (e.g. `{ parentCount, variantCount }`) once the fetch resolves so
// the caller can update settings without reaching into the hook's state.
export function useCatalogSync({
  activeIntegration,
  sqApiKey,
  shopifyShopDomain,
  shopifyAccessToken,
  onSyncStats,
}) {
  const { toast } = useToast()
  const [products, setProducts] = useState(() => {
    const s = localStorage.getItem('sip_products')
    try {
      return s ? JSON.parse(s) : SAMPLE_PRODUCTS
    } catch {
      console.warn('sip_products parse error — falling back to sample products')
      return SAMPLE_PRODUCTS
    }
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
    let stats = null
    const captureStats = (s) => {
      stats = s
    }
    try {
      let fetched
      if (provider === 'shopify') {
        if (!shopifyShopDomain || !shopifyAccessToken) return setSyncStatus('idle')
        fetched = await fetchShopifyProducts(
          shopifyShopDomain,
          shopifyAccessToken,
          setSyncCount,
          captureStats,
        )
      } else {
        if (!sqApiKey) return setSyncStatus('idle')
        fetched = await fetchSquarespaceProducts(sqApiKey, setSyncCount, captureStats)
      }
      saveProducts(fetched)
      setSyncStatus('ok')
      if (stats && typeof onSyncStats === 'function') {
        try {
          onSyncStats(stats)
        } catch {
          // Consumer errors must not corrupt sync status — the stats callback
          // is advisory (tier routing) rather than load-bearing for the fetch.
        }
      }
    } catch (err) {
      setSyncStatus('error')
      const { message, type } = classifySyncError(err)
      toast(message, type)
    }
  }, [
    activeIntegration,
    sqApiKey,
    shopifyShopDomain,
    shopifyAccessToken,
    saveProducts,
    onSyncStats,
    toast,
  ])

  return {
    products,
    saveProducts,
    lastSynced,
    syncStatus,
    syncCount,
    handleSyncCatalog,
  }
}
