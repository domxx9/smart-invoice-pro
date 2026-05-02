import { useState, useCallback } from 'react'
import { STORAGE_KEYS } from '../constants/storageKeys.js'
import { fetchSquarespaceOrders } from '../api/squarespace.js'
import { fetchShopifyOrders } from '../api/shopify.js'
import { useToast } from '../contexts/ToastContext.jsx'

function classifyError(err) {
  const msg = err?.message ?? ''
  if (err instanceof TypeError || /failed to fetch|networkerror/i.test(msg)) return 'network'
  if (/\b40[13]\b/.test(msg)) return 'auth'
  if (/\b429\b/.test(msg)) return 'rateLimit'
  return 'api'
}

const MESSAGES = {
  network: 'Order sync failed — check your connection.',
  auth: 'Order sync failed — check your API key in Settings.',
  rateLimit: 'Order sync rate limited — try again in a moment.',
  api: 'Order sync failed — API error.',
}

export function useOrderSync({
  activeIntegration,
  sqApiKey,
  shopifyShopDomain,
  shopifyAccessToken,
}) {
  const { toast } = useToast()
  const [orders, setOrders] = useState(() => {
    const s = localStorage.getItem(STORAGE_KEYS.SIP_ORDERS)
    try {
      return s ? JSON.parse(s) : []
    } catch {
      console.warn('sip_orders parse error — falling back to empty list')
      return []
    }
  })
  const [lastOrderSync, setLastOrderSync] = useState(() => {
    const ts = localStorage.getItem(STORAGE_KEYS.SIP_ORDERS_SYNCED_AT)
    return ts ? parseInt(ts, 10) : null
  })
  const [orderSyncStatus, setOrderSyncStatus] = useState('idle')
  const [orderSyncCount, setOrderSyncCount] = useState(0)
  const [picks, setPicks] = useState(() => {
    const s = localStorage.getItem(STORAGE_KEYS.SIP_PICKS)
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
      localStorage.setItem(STORAGE_KEYS.SIP_PICKS, JSON.stringify(next))
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
        localStorage.setItem(STORAGE_KEYS.SIP_PICKS, JSON.stringify(next))
        return next
      })
      const ts = Date.now()
      setLastOrderSync(ts)
      localStorage.setItem(STORAGE_KEYS.SIP_ORDERS, JSON.stringify(fetched))
      localStorage.setItem(STORAGE_KEYS.SIP_ORDERS_SYNCED_AT, String(ts))
      setOrderSyncStatus('ok')
    } catch (err) {
      const kind = classifyError(err)
      toast(MESSAGES[kind], kind === 'rateLimit' ? 'warning' : 'error')
      setOrderSyncStatus('error')
    }
  }, [activeIntegration, sqApiKey, shopifyShopDomain, shopifyAccessToken, toast])

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
