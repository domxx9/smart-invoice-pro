/**
 * Shopify Admin API 2024-01 client.
 *
 * Parity with src/api/squarespace.js:
 *   - same `onProgress(count)` callback shape
 *   - same native vs browser URL branch (Capacitor HTTP on device, /api/shopify/* proxy in dev)
 *   - same product shape: { id, name, desc, price, stock, category }
 *   - same order shape: { id, orderNumber, customer, email, status, total, lineItems[] }
 *
 * Shopify-specific details:
 *   - auth header is `X-Shopify-Access-Token: <token>` (not Bearer)
 *   - pagination uses the `Link` response header with `rel="next"` and a `page_info` cursor
 *   - each product has 1..N variants; we flatten to one row per variant
 */

import { logger } from '../utils/logger.js'
import { platformFetch } from './platformFetch.js'

const API_VERSION = '2024-01'
const PAGE_LIMIT = 250

const isNative = () => typeof window !== 'undefined' && window.Capacitor?.isNativePlatform?.()

function normalizeShopDomain(shopDomain) {
  if (!shopDomain) throw new Error('Shopify shop domain is required')
  return shopDomain.replace(/^https?:\/\//, '').replace(/\/$/, '')
}

// Shopify returns cursors in the Link header:
//   <https://shop.myshopify.com/admin/api/2024-01/products.json?limit=250&page_info=abc>; rel="next"
// We only care about the `page_info` query param — not the full URL — so we can rebuild the
// request against either the direct host or the dev proxy.
function extractNextPageInfo(linkHeader) {
  if (!linkHeader) return null
  for (const part of linkHeader.split(',')) {
    if (!/rel="?next"?/.test(part)) continue
    const urlMatch = part.match(/<([^>]+)>/)
    if (!urlMatch) continue
    try {
      const url = new URL(urlMatch[1])
      const info = url.searchParams.get('page_info')
      if (info) return info
    } catch {
      // malformed URL in Link header — skip
    }
  }
  return null
}

function buildUrl(host, resource, { pageInfo, query }) {
  const base = `${host}/admin/api/${API_VERSION}/${resource}.json`
  // When paginating, Shopify explicitly rejects any filter params other than `limit` and
  // `page_info`. Drop filters on subsequent pages.
  const params = new URLSearchParams()
  params.set('limit', String(PAGE_LIMIT))
  if (pageInfo) {
    params.set('page_info', pageInfo)
  } else if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null && v !== '') params.set(k, String(v))
    }
  }
  return `${base}?${params.toString()}`
}

async function shopifyFetch(shopDomain, accessToken, { resource, pageInfo, query }) {
  const host = `https://${normalizeShopDomain(shopDomain)}`
  const url = buildUrl(host, resource, { pageInfo, query })

  const params = new URLSearchParams()
  params.set('limit', String(PAGE_LIMIT))
  if (pageInfo) {
    params.set('page_info', pageInfo)
  } else if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null && v !== '') params.set(k, String(v))
    }
  }
  const devUrl = `/api/shopify/admin/api/${API_VERSION}/${resource}.json?${params.toString()}`

  const { data, raw } = await platformFetch(
    url,
    {
      'X-Shopify-Access-Token': accessToken,
      ...(isNative() ? {} : { 'X-Shopify-Shop-Domain': normalizeShopDomain(shopDomain) }),
    },
    { devUrl },
  )

  let link = ''
  if (isNative()) {
    const headers = raw.headers || {}
    link = headers.link ?? headers.Link ?? headers['link'] ?? headers['Link'] ?? ''
  } else {
    link = raw.headers.get('Link') ?? ''
  }

  return { data, nextPageInfo: extractNextPageInfo(link) }
}

function stripHtml(html) {
  if (!html) return ''
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
}

function flattenProduct(p) {
  const desc = stripHtml(p.body_html || '')
  const category = p.product_type || 'Product'
  const variants = Array.isArray(p.variants) ? p.variants : []

  if (!variants.length) {
    return [
      {
        id: String(p.id),
        name: p.title,
        desc,
        price: 0,
        stock: 99,
        category,
      },
    ]
  }

  // Expand variant name suffix only when variants are genuinely distinct — i.e. more than
  // one, or the single variant carries option values. This matches how Squarespace attaches
  // " — Red / Large" to variant names.
  const expand =
    variants.length > 1 ||
    [variants[0]?.option1, variants[0]?.option2, variants[0]?.option3].some(Boolean)

  return variants.map((v) => {
    const opts = [v.option1, v.option2, v.option3].filter(Boolean)
    const suffix = expand && opts.length ? ` — ${opts.join(' / ')}` : ''
    const price = parseFloat(v.price ?? 0) || 0
    // Shopify "inventory_policy: continue" means keep selling after stock hits 0 → treat as
    // unlimited, like Squarespace's `stock.unlimited`. If inventory isn't tracked we also
    // treat it as unlimited.
    const tracked = !!v.inventory_management
    const unlimited = !tracked || v.inventory_policy === 'continue'
    const qty = typeof v.inventory_quantity === 'number' ? v.inventory_quantity : 0
    return {
      id: String(v.id),
      name: `${p.title}${suffix}`,
      desc,
      price,
      stock: unlimited ? 99 : qty,
      category,
    }
  })
}

export async function fetchShopifyProducts(shopDomain, accessToken, onProgress, onStats) {
  if (!shopDomain) throw new Error('Shopify shop domain is required')
  if (!accessToken) throw new Error('Shopify access token is required')

  const flattened = []
  let pageInfo = null
  let rawCount = 0

  do {
    const { data, nextPageInfo } = await shopifyFetch(shopDomain, accessToken, {
      resource: 'products',
      pageInfo,
    })
    if (!Array.isArray(data?.products)) {
      throw new Error(
        `Unexpected Shopify response — products field missing. Got: ${JSON.stringify(data).slice(0, 200)}`,
      )
    }
    rawCount += data.products.length
    for (const p of data.products) flattened.push(...flattenProduct(p))
    onProgress?.(flattened.length)
    pageInfo = nextPageInfo
  } while (pageInfo)

  logger.info('shopify', `synced ${rawCount} products → ${flattened.length} variants`)
  onStats?.({ parentCount: rawCount, variantCount: flattened.length })
  return flattened
}

function shopifyOrderStatus(o) {
  // Map Shopify's (financial_status, fulfillment_status) to the single status Orders.jsx
  // already knows: PENDING vs everything else. Anything unfulfilled and paid/authorized is
  // pending. Squarespace uses uppercase, so we match that.
  const fulfillment = (o.fulfillment_status || 'unfulfilled').toLowerCase()
  if (fulfillment === 'fulfilled') return 'FULFILLED'
  if (fulfillment === 'partial') return 'PARTIALLY_FULFILLED'
  return 'PENDING'
}

function projectOrder(o) {
  const billing = o.billing_address || {}
  const customerName =
    [billing.first_name, billing.last_name].filter(Boolean).join(' ') ||
    [o.customer?.first_name, o.customer?.last_name].filter(Boolean).join(' ') ||
    o.email ||
    '—'

  return {
    id: String(o.id),
    orderNumber: o.name || String(o.order_number ?? o.id),
    createdOn: o.created_at,
    modifiedOn: o.updated_at || o.created_at,
    customer: customerName,
    email: o.email || '',
    status: shopifyOrderStatus(o),
    payStatus: (o.financial_status || '').toUpperCase(),
    total: parseFloat(o.total_price ?? 0) || 0,
    currency: o.currency || 'USD',
    lineItems: Array.isArray(o.line_items)
      ? o.line_items.map((li) => ({
          name: li.title || li.name || 'Item',
          qty: li.quantity ?? 1,
          price: parseFloat(li.price ?? 0) || 0,
        }))
      : [],
  }
}

export async function fetchShopifyOrders(shopDomain, accessToken, onProgress) {
  if (!shopDomain) throw new Error('Shopify shop domain is required')
  if (!accessToken) throw new Error('Shopify access token is required')

  const all = []
  let pageInfo = null

  do {
    const { data, nextPageInfo } = await shopifyFetch(shopDomain, accessToken, {
      resource: 'orders',
      pageInfo,
      query: { status: 'any' },
    })
    const batch = data?.orders
    if (!Array.isArray(batch)) {
      throw new Error(`Unexpected Shopify orders response: ${JSON.stringify(data).slice(0, 200)}`)
    }
    all.push(...batch.map(projectOrder))
    onProgress?.(all.length)
    pageInfo = nextPageInfo
  } while (pageInfo)

  // Match Squarespace rule: keep everything PENDING, plus anything modified in the last
  // 30 days so the Orders view keeps a short history of recently-fulfilled orders.
  const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000
  const now = Date.now()
  const filtered = all.filter((o) => {
    if (o.status === 'PENDING') return true
    const ref = new Date(o.modifiedOn || o.createdOn).getTime()
    return now - ref <= THIRTY_DAYS
  })
  logger.info('shopify', `synced ${all.length} orders (${filtered.length} within window)`)
  return filtered.sort((a, b) => new Date(b.createdOn) - new Date(a.createdOn))
}

// Exported for tests — lets us verify the Link-header parser without mocking fetch.
export const __test = { extractNextPageInfo, flattenProduct, projectOrder, shopifyOrderStatus }
