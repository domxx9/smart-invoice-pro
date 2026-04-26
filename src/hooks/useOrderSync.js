import { useState, useCallback } from 'react'
import { fetchSquarespaceOrders } from '../api/squarespace.js'
import { fetchShopifyOrders } from '../api/shopify.js'

export function useOrderSync({
  activeIntegration,
  sqApiKey,
  shopifyShopDomain,
  shopifyAccessToken,
}) {
  const [orders, setOrders] = useState(() => {
    const s = localStorage.getItem('sip_orders')
    try {
      return s ? JSON.parse(s) : []
    } catch {
      console.warn('sip_orders parse error — falling back to empty list')
      return []
    }
  })
  const [lastOrderSync, setLastOrderSync] = useState(() => {
    const ts = localStorage.getItem('sip_orders_synced_at')
    return ts ? parseInt(ts, 10) : null
  })
  const [orderSyncStatus, setOrderSyncStatus] = useState('idle')
  const [orderSyncCount, setOrderSyncCount] = useState(0)
  const [picks, setPicks] = useState(() => {
    const s = localStorage.getItem('sip_picks')
    try {
      return s ? JSON.parse(s) : {}
    } catch {
      console.warn('sip_picks parse error — falling back to empty picks')
      return {}
    }
  })

  const savePick = useCallback((orderId, itemIndex, qty) => {
    setPicks((prev) => {
      const next = { ...prev, [orderId]: { ...(prev[orderId] ?? {}), [itemIndex]: qty } }
      localStorage.setItem('sip_picks', JSON.stringify(next))
      return next
    })
  }, [])

  const handleSyncOrders = useCallback(async () => {
    const provider =
      activeIntegration || (sqApiKey ? 'squarespace' : shopifyAccessToken ? 'shopify' : null)
    if (!provider) return
    setOrderSyncStatus('syncing')
    setOrderSyncCount(0)
    try {
      let fetched
      if (provider === 'shopify') {
        if (!shopifyShopDomain || !shopifyAccessToken) return setOrderSyncStatus('idle')
        fetched = await fetchShopifyOrders(shopifyShopDomain, shopifyAccessToken, setOrderSyncCount)
      } else {
        if (!sqApiKey) return setOrderSyncStatus('idle')
        fetched = await fetchSquarespaceOrders(sqApiKey, setOrderSyncCount)
      }
      setOrders(fetched)
      const pendingIds = new Set(fetched.filter((o) => o.status === 'PENDING').map((o) => o.id))
      setPicks((prev) => {
        const next = {}
        for (const id of Object.keys(prev)) {
          if (pendingIds.has(id)) next[id] = prev[id]
        }
        localStorage.setItem('sip_picks', JSON.stringify(next))
        return next
      })
      const ts = Date.now()
      setLastOrderSync(ts)
      localStorage.setItem('sip_orders', JSON.stringify(fetched))
      localStorage.setItem('sip_orders_synced_at', String(ts))
      setOrderSyncStatus('ok')
    } catch {
      setOrderSyncStatus('error')
    }
  }, [activeIntegration, sqApiKey, shopifyShopDomain, shopifyAccessToken])

  return {
    orders,
    lastOrderSync,
    orderSyncStatus,
    orderSyncCount,
    picks,
    savePick,
    handleSyncOrders,
  }
}
