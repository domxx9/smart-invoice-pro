import { useState, useCallback } from 'react'
import { STORAGE_KEYS } from '../constants/storageKeys.js'
import { SAMPLE_PRODUCTS } from '../constants.js'
import { fetchSquarespaceProducts } from '../api/squarespace.js'
import { fetchShopifyProducts } from '../api/shopify.js'
import { useToast } from '../contexts/ToastContext.jsx'

function classifyError(err) {
  const msg = err?.message ?? ''
  if (err instanceof TypeError || /failed to fetch|networkerror/i.test(msg)) return 'network'
  if (/\b40[13]\b/.test(msg)) return 'auth'
  if (/\b429\b/.test(msg)) return 'rateLimit'
  return 'api'
}

const MESSAGES = {
  network: 'Sync failed — check your connection.',
  auth: 'Sync failed — API key invalid — check Settings.',
  rateLimit: 'Sync rate limited — try again later.',
  api: 'Sync failed — API error.',
}

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
    const s = localStorage.getItem(STORAGE_KEYS.SIP_PRODUCTS)
    try {
      return s ? JSON.parse(s) : SAMPLE_PRODUCTS
    } catch {
      console.warn('sip_products parse error — falling back to sample products')
      return SAMPLE_PRODUCTS
    }
  })
  const [lastSynced, setLastSynced] = useState(() => {
    const ts = localStorage.getItem(STORAGE_KEYS.SIP_PRODUCTS_SYNCED_AT)
    return ts ? parseInt(ts, 10) : null
  })
  const [syncStatus, setSyncStatus] = useState('idle')
  const [syncCount, setSyncCount] = useState(0)

  const saveProducts = useCallback((prods) => {
    setProducts(prods)
    const ts = Date.now()
    setLastSynced(ts)
    localStorage.setItem(STORAGE_KEYS.SIP_PRODUCTS, JSON.stringify(prods))
    localStorage.setItem(STORAGE_KEYS.SIP_PRODUCTS_SYNCED_AT, String(ts))
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
      const kind = classifyError(err)
      toast(MESSAGES[kind], kind === 'rateLimit' ? 'warning' : 'error')
      setSyncStatus('error')
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
