import { useState, useEffect, useCallback, useRef } from 'react'
import { SAMPLE_PRODUCTS } from '../constants.js'
import { SyncManager } from '../sync/core/SyncManager.js'
import { SquarespaceAdapter } from '../sync/adapters/SquarespaceAdapter.js'
import { LocalStorageSync } from '../sync/storage/LocalStorageSync.js'
import { fetchShopifyProducts } from '../api/shopify.js'

export function useCatalogSync({
  activeIntegration,
  sqApiKey,
  shopifyShopDomain,
  shopifyAccessToken,
  onSyncStats,
}) {
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
  const syncManagerRef = useRef(null)
  const scheduledRef = useRef(false)
  const fallbackCleanupRef = useRef(null)

  const saveProducts = useCallback((prods) => {
    setProducts(prods)
    const ts = Date.now()
    setLastSynced(ts)
    localStorage.setItem('sip_products', JSON.stringify(prods))
    localStorage.setItem('sip_products_synced_at', String(ts))
  }, [])

  const scheduleEnrichment = useCallback(() => {
    if (scheduledRef.current) return
    scheduledRef.current = true

    const winCap = window.Capacitor
    if (winCap?.Plugins?.BackgroundRunner) {
      winCap.Plugins.BackgroundRunner.dispatchEvent({
        label: 'com.smartinvoicepro.background.enrichment',
        event: 'enrich_chunk',
        details: {},
      }).catch((err) => {
        console.warn('[useCatalogSync] BackgroundRunner dispatch failed', err)
        const cleanup = fallbackEnrichmentInterval()
        fallbackCleanupRef.current = cleanup
      })
    } else {
      const cleanup = fallbackEnrichmentInterval()
      fallbackCleanupRef.current = cleanup
    }
  }, [fallbackEnrichmentInterval])

  const fallbackEnrichmentInterval = useCallback(() => {
    const interval = setInterval(
      async () => {
        if (!syncManagerRef.current) return
        try {
          await syncManagerRef.current.runEnrichmentChunk()
        } catch (err) {
          console.warn('[useCatalogSync] enrichment interval error', err)
        }
      },
      30 * 60 * 1000,
    )
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    const storage = new LocalStorageSync('sip')

    const runPhase1 = async () => {
      if (!sqApiKey && !shopifyAccessToken) return

      setSyncStatus('syncing')
      setSyncCount(0)

      if (sqApiKey) {
        const adapter = new SquarespaceAdapter({ apiKey: sqApiKey, storage })
        const manager = new SyncManager({
          adapter,
          storage,
          onProgress: ({ phase, count }) => {
            if (phase === 'initial') setSyncCount(count)
          },
        })
        syncManagerRef.current = manager

        try {
          let stats = null
          const captureStats = (s) => { stats = s }
          const result = await manager.runInitialSync(null, captureStats)
          saveProducts(result)
          const syncedAt = await storage.get('products_synced_at')
          if (syncedAt) {
            const ts = typeof syncedAt === 'number' ? syncedAt : Date.now()
            setLastSynced(ts)
            localStorage.setItem('sip_products_synced_at', String(ts))
          }
          setSyncStatus('ok')
          if (stats && typeof onSyncStats === 'function') {
            try {
              onSyncStats(stats)
            } catch {
              /* noop */
            }
          }
          scheduleEnrichment()
        } catch (err) {
          console.warn('[useCatalogSync] Phase 1 error', err)
          setSyncStatus('error')
        }
      } else if (shopifyAccessToken && shopifyShopDomain) {
        setSyncStatus('syncing')
        let stats = null
        try {
          const fetched = await fetchShopifyProducts(
            shopifyShopDomain,
            shopifyAccessToken,
            (count) => setSyncCount(count),
            (s) => {
              stats = s
            },
          )
          saveProducts(fetched)
          setSyncStatus('ok')
          if (stats && typeof onSyncStats === 'function') {
            try {
              onSyncStats(stats)
            } catch {
              /* noop */
            }
          }
        } catch {
          setSyncStatus('error')
        }
      }
    }

    runPhase1()

    return () => {
      if (fallbackCleanupRef.current) {
        fallbackCleanupRef.current()
        fallbackCleanupRef.current = null
      }
    }
  }, [
    sqApiKey,
    shopifyAccessToken,
    shopifyShopDomain,
    saveProducts,
    onSyncStats,
    scheduleEnrichment,
  ])

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

    const storage = new LocalStorageSync('sip')

    try {
      if (provider === 'shopify') {
        if (!shopifyShopDomain || !shopifyAccessToken) return setSyncStatus('idle')
        const fetched = await fetchShopifyProducts(
          shopifyShopDomain,
          shopifyAccessToken,
          (count) => setSyncCount(count),
          captureStats,
        )
        saveProducts(fetched)
        setSyncStatus('ok')
        if (stats && typeof onSyncStats === 'function') {
          try {
            onSyncStats(stats)
          } catch {
            /* noop */
          }
        }
        return
      }

      if (!sqApiKey) return setSyncStatus('idle')

      if (syncManagerRef.current) {
        const result = await syncManagerRef.current.runInitialSync(null, captureStats)
        saveProducts(result)
        setSyncStatus('ok')
        if (stats && typeof onSyncStats === 'function') {
          try {
            onSyncStats(stats)
          } catch {
            /* noop */
          }
        }
        scheduleEnrichment()
      } else {
        const adapter = new SquarespaceAdapter({ apiKey: sqApiKey, storage })
        const manager = new SyncManager({
          adapter,
          storage,
          onProgress: ({ phase, count }) => {
            if (phase === 'initial') setSyncCount(count)
          },
        })
        syncManagerRef.current = manager
        const result = await manager.runInitialSync(null, captureStats)
        saveProducts(result)
        setSyncStatus('ok')
        if (stats && typeof onSyncStats === 'function') {
          try {
            onSyncStats(stats)
          } catch {
            /* noop */
          }
        }
        scheduleEnrichment()
      }
    } catch {
      setSyncStatus('error')
    }
  }, [
    activeIntegration,
    sqApiKey,
    shopifyShopDomain,
    shopifyAccessToken,
    saveProducts,
    onSyncStats,
    scheduleEnrichment,
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
