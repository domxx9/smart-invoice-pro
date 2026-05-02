import { logger } from '../utils/logger.js'
import { platformFetch } from './platformFetch.js'

export async function fetchSquarespaceProducts(apiKey, onProgress, onStats) {
  const allProducts = []
  let cursor = null

  do {
    const url = `https://api.squarespace.com/1.0/commerce/products${cursor ? `?cursor=${cursor}` : ''}`
    const devUrl = `/api/sqsp/1.0/commerce/products${cursor ? `?cursor=${cursor}` : ''}`
    const { data } = await platformFetch(
      url,
      { Authorization: `Bearer ${apiKey}` },
      { devUrl },
    ).catch((err) => {
      const msg = err.message.replace(/^API /, '')
      throw new Error(`Squarespace API ${msg}`)
    })

    if (!Array.isArray(data.products))
      throw new Error(
        `Unexpected API response — products field missing. Got: ${JSON.stringify(data).slice(0, 200)}`,
      )

    allProducts.push(...data.products)
    onProgress?.(allProducts.length)
    cursor = data.pagination?.nextPageCursor ?? null
  } while (cursor)

  const category = (p) => (p.type ? p.type.charAt(0) + p.type.slice(1).toLowerCase() : 'Product')
  const stripDesc = (html) => {
    if (!html) return ''
    return html
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 80)
  }
  logger.info('squarespace', `synced ${allProducts.length} products`)
  const flattened = allProducts.flatMap((p) => {
    const variants = p.variants ?? []
    const desc = stripDesc(p.description || p.body || '')
    if (!variants.length)
      return [{ id: p.id, name: p.name, desc, price: 0, stock: 99, category: category(p) }]
    const expand =
      variants.length > 1 || Object.values(variants[0]?.attributes ?? {}).some((v) => v)
    return variants.map((v, idx) => {
      const price = parseFloat(v.pricing?.basePrice?.value ?? 0)
      const unlimited = v.stock?.unlimited ?? true
      const qty = v.stock?.quantity ?? 0
      const attrs = Object.values(v.attributes ?? {}).filter(Boolean)
      const suffix = expand && attrs.length ? ` — ${attrs.join(' / ')}` : ''
      return {
        id: `${p.id}_v${idx}`,
        name: `${p.name}${suffix}`,
        desc,
        price,
        stock: unlimited ? 99 : qty,
        category: category(p),
      }
    })
  })
  onStats?.({ parentCount: allProducts.length, variantCount: flattened.length })
  return flattened
}

export async function fetchSquarespaceOrders(apiKey, onProgress) {
  const all = []
  let cursor = null

  do {
    const url = `https://api.squarespace.com/1.0/commerce/orders${cursor ? `?cursor=${cursor}` : ''}`
    const devUrl = `/api/sqsp/1.0/commerce/orders${cursor ? `?cursor=${cursor}` : ''}`
    const { data } = await platformFetch(
      url,
      { Authorization: `Bearer ${apiKey}` },
      { devUrl },
    ).catch((err) => {
      const msg = err.message.replace(/^API /, '')
      throw new Error(`Squarespace Orders API ${msg}`)
    })

    const batch = data.result ?? data.orders ?? []
    if (!Array.isArray(batch))
      throw new Error(`Unexpected orders response: ${JSON.stringify(data).slice(0, 200)}`)

    all.push(
      ...batch.map((o) => ({
        id: o.id,
        orderNumber: o.orderNumber ?? o.id,
        createdOn: o.createdOn,
        modifiedOn: o.modifiedOn ?? o.createdOn,
        customer:
          [o.billingAddress?.firstName, o.billingAddress?.lastName].filter(Boolean).join(' ') ||
          o.customerEmail ||
          '—',
        email: o.customerEmail ?? '',
        status: o.fulfillmentStatus ?? 'PENDING',
        payStatus: o.paymentStatus ?? '',
        total: parseFloat(o.grandTotal?.value ?? 0),
        currency: o.grandTotal?.currency ?? 'USD',
        lineItems: (o.lineItems ?? []).map((li) => ({
          name: li.productName ?? li.variantLabel ?? 'Item',
          qty: li.quantity ?? 1,
          price: parseFloat(li.unitPricePaid?.value ?? 0),
        })),
      })),
    )
    onProgress?.(all.length)
    cursor = data.pagination?.nextPageCursor ?? null
  } while (cursor)

  const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000
  const now = Date.now()
  const filtered = all.filter((o) => {
    if (o.status === 'PENDING') return true
    const refDate = new Date(o.modifiedOn || o.createdOn).getTime()
    return now - refDate <= THIRTY_DAYS
  })
  logger.info('squarespace', `synced ${all.length} orders (${filtered.length} within window)`)
  return filtered.sort((a, b) => new Date(b.createdOn) - new Date(a.createdOn))
}
