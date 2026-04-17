import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { fetchShopifyProducts, fetchShopifyOrders, __test } from '../shopify.js'

const SHOP = 'acme-shop.myshopify.com'
const TOKEN = 'shpat_test_token'

function mockFetchSequence(responses) {
  let i = 0
  return vi.fn(async (url, init) => {
    const spec = responses[i++]
    if (!spec) throw new Error(`Unexpected fetch call #${i} to ${url}`)
    spec.capturedUrl = url
    spec.capturedInit = init
    const headers = new Map(Object.entries(spec.headers || {}))
    return {
      ok: spec.status ? spec.status < 400 : true,
      status: spec.status ?? 200,
      statusText: spec.statusText ?? 'OK',
      headers: {
        get: (name) => headers.get(name) ?? headers.get(name.toLowerCase()) ?? null,
      },
      json: async () => spec.body,
    }
  })
}

describe('shopify.js — Link header parser', () => {
  const { extractNextPageInfo } = __test

  it('returns null when header is absent or has no rel=next', () => {
    expect(extractNextPageInfo(null)).toBeNull()
    expect(extractNextPageInfo('')).toBeNull()
    expect(
      extractNextPageInfo(
        '<https://x.myshopify.com/admin/api/2024-01/products.json?page_info=prev>; rel="previous"',
      ),
    ).toBeNull()
  })

  it('extracts the page_info cursor from a rel="next" link', () => {
    const header =
      '<https://x.myshopify.com/admin/api/2024-01/products.json?limit=250&page_info=abc123>; rel="next"'
    expect(extractNextPageInfo(header)).toBe('abc123')
  })

  it('handles multi-entry Link headers with both prev and next', () => {
    const header = [
      '<https://x.myshopify.com/admin/api/2024-01/products.json?limit=250&page_info=prev>; rel="previous"',
      '<https://x.myshopify.com/admin/api/2024-01/products.json?limit=250&page_info=nxt>; rel="next"',
    ].join(', ')
    expect(extractNextPageInfo(header)).toBe('nxt')
  })
})

describe('shopify.js — variant flatten', () => {
  const { flattenProduct } = __test

  it('returns a placeholder row for products with no variants', () => {
    const out = flattenProduct({ id: 1, title: 'Bare', body_html: '<p>x</p>', variants: [] })
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({
      id: '1',
      name: 'Bare',
      stock: 99,
      price: 0,
      category: 'Product',
    })
  })

  it('flattens N variants into N rows with price + stock + suffix', () => {
    const out = flattenProduct({
      id: 'p1',
      title: 'Tee',
      product_type: 'Apparel',
      body_html: '<p>Cotton <b>shirt</b></p>',
      variants: [
        {
          id: 'v1',
          price: '19.99',
          option1: 'Red',
          option2: 'S',
          inventory_management: 'shopify',
          inventory_policy: 'deny',
          inventory_quantity: 5,
        },
        {
          id: 'v2',
          price: '21.50',
          option1: 'Blue',
          option2: 'L',
          inventory_management: null,
          inventory_quantity: 0,
        },
      ],
    })
    expect(out).toHaveLength(2)
    expect(out[0]).toMatchObject({
      id: 'v1',
      name: 'Tee — Red / S',
      price: 19.99,
      stock: 5,
      category: 'Apparel',
    })
    // v2 has inventory_management=null → treated as unlimited
    expect(out[1]).toMatchObject({ id: 'v2', name: 'Tee — Blue / L', price: 21.5, stock: 99 })
    // HTML is stripped for desc
    expect(out[0].desc).toBe('Cotton shirt')
  })

  it('does not append a suffix when only one variant has no option values', () => {
    const out = flattenProduct({
      id: 'p2',
      title: 'Mug',
      variants: [
        { id: 'v1', price: '5.00', inventory_management: 'shopify', inventory_quantity: 2 },
      ],
    })
    expect(out[0].name).toBe('Mug')
  })

  it('treats inventory_policy=continue as unlimited stock', () => {
    const out = flattenProduct({
      id: 'p3',
      title: 'Pre-order',
      variants: [
        {
          id: 'v1',
          price: '10',
          inventory_management: 'shopify',
          inventory_policy: 'continue',
          inventory_quantity: 0,
        },
      ],
    })
    expect(out[0].stock).toBe(99)
  })
})

describe('shopify.js — order projection', () => {
  const { projectOrder, shopifyOrderStatus } = __test

  it('maps fulfillment_status to PENDING / FULFILLED / PARTIALLY_FULFILLED', () => {
    expect(shopifyOrderStatus({ fulfillment_status: null })).toBe('PENDING')
    expect(shopifyOrderStatus({ fulfillment_status: 'fulfilled' })).toBe('FULFILLED')
    expect(shopifyOrderStatus({ fulfillment_status: 'partial' })).toBe('PARTIALLY_FULFILLED')
  })

  it('projects an order into the shared shape', () => {
    const o = projectOrder({
      id: 1001,
      name: '#1042',
      order_number: 42,
      created_at: '2026-04-10T10:00:00Z',
      updated_at: '2026-04-11T12:00:00Z',
      email: 'buyer@example.com',
      total_price: '99.50',
      currency: 'USD',
      financial_status: 'paid',
      fulfillment_status: null,
      billing_address: { first_name: 'Ada', last_name: 'Lovelace' },
      line_items: [
        { title: 'Widget', quantity: 2, price: '25.00' },
        { title: 'Gizmo', quantity: 1, price: '49.50' },
      ],
    })
    expect(o).toMatchObject({
      id: '1001',
      orderNumber: '#1042',
      customer: 'Ada Lovelace',
      email: 'buyer@example.com',
      status: 'PENDING',
      payStatus: 'PAID',
      total: 99.5,
      currency: 'USD',
    })
    expect(o.lineItems).toHaveLength(2)
    expect(o.lineItems[0]).toEqual({ name: 'Widget', qty: 2, price: 25 })
  })
})

describe('fetchShopifyProducts — URL, auth, pagination', () => {
  beforeEach(() => {
    vi.stubGlobal('window', /** @type {any} */ ({ Capacitor: undefined }))
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('calls the dev proxy URL with X-Shopify-Access-Token and paginates via Link header', async () => {
    const page1 = {
      status: 200,
      headers: {
        Link: '<https://acme-shop.myshopify.com/admin/api/2024-01/products.json?limit=250&page_info=CURSOR2>; rel="next"',
      },
      body: {
        products: [{ id: 1, title: 'A', variants: [{ id: 10, price: '1.00' }] }],
      },
    }
    const page2 = {
      status: 200,
      headers: {},
      body: {
        products: [{ id: 2, title: 'B', variants: [{ id: 20, price: '2.00' }] }],
      },
    }
    const fetchMock = mockFetchSequence([page1, page2])
    vi.stubGlobal('fetch', fetchMock)

    const progress = vi.fn()
    const out = await fetchShopifyProducts(SHOP, TOKEN, progress)

    expect(fetchMock).toHaveBeenCalledTimes(2)

    // First call: dev proxy path + auth + shop headers + limit=250 + no page_info.
    expect(page1.capturedUrl).toContain('/api/shopify/admin/api/2024-01/products.json')
    expect(page1.capturedUrl).toContain('limit=250')
    expect(page1.capturedUrl).not.toContain('page_info=')
    expect(page1.capturedInit.headers['X-Shopify-Access-Token']).toBe(TOKEN)
    expect(page1.capturedInit.headers['X-Shopify-Shop-Domain']).toBe(SHOP)

    // Second call must include the extracted page_info cursor.
    expect(page2.capturedUrl).toContain('page_info=CURSOR2')

    // Two products flattened into two variant rows.
    expect(out).toHaveLength(2)
    expect(out.map((p) => p.id)).toEqual(['10', '20'])
    // onProgress called with the running variant count.
    expect(progress).toHaveBeenNthCalledWith(1, 1)
    expect(progress).toHaveBeenNthCalledWith(2, 2)
  })

  it('throws when products field is missing', async () => {
    vi.stubGlobal('fetch', mockFetchSequence([{ status: 200, headers: {}, body: { foo: 'bar' } }]))
    await expect(fetchShopifyProducts(SHOP, TOKEN)).rejects.toThrow(/products field missing/)
  })

  it('rejects non-2xx responses with a useful error', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetchSequence([{ status: 401, statusText: 'Unauthorized', headers: {}, body: {} }]),
    )
    await expect(fetchShopifyProducts(SHOP, TOKEN)).rejects.toThrow(/401/)
  })

  it('requires a shop domain and access token', async () => {
    await expect(fetchShopifyProducts('', TOKEN)).rejects.toThrow(/shop domain/i)
    await expect(fetchShopifyProducts(SHOP, '')).rejects.toThrow(/access token/i)
  })
})

describe('fetchShopifyOrders — 30-day + PENDING filter', () => {
  beforeEach(() => {
    vi.stubGlobal('window', /** @type {any} */ ({ Capacitor: undefined }))
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('keeps PENDING orders regardless of age and drops old fulfilled orders', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-17T00:00:00Z'))

    const recentPending = {
      id: 1,
      name: '#1',
      created_at: '2026-04-15T00:00:00Z',
      updated_at: '2026-04-15T00:00:00Z',
      fulfillment_status: null,
      financial_status: 'paid',
      total_price: '10',
      currency: 'USD',
      line_items: [],
      billing_address: { first_name: 'A', last_name: 'B' },
      email: 'a@b.com',
    }
    const oldPending = {
      ...recentPending,
      id: 2,
      name: '#2',
      created_at: '2025-04-15T00:00:00Z',
      updated_at: '2025-04-15T00:00:00Z',
    }
    const recentFulfilled = {
      ...recentPending,
      id: 3,
      name: '#3',
      fulfillment_status: 'fulfilled',
      updated_at: '2026-04-10T00:00:00Z',
    }
    const oldFulfilled = {
      ...recentPending,
      id: 4,
      name: '#4',
      fulfillment_status: 'fulfilled',
      updated_at: '2025-12-01T00:00:00Z',
    }

    vi.stubGlobal(
      'fetch',
      mockFetchSequence([
        {
          status: 200,
          headers: {},
          body: { orders: [recentPending, oldPending, recentFulfilled, oldFulfilled] },
        },
      ]),
    )

    const out = await fetchShopifyOrders(SHOP, TOKEN)
    const ids = out.map((o) => o.id)
    expect(ids).toContain('1') // recent pending
    expect(ids).toContain('2') // old pending — kept because PENDING
    expect(ids).toContain('3') // recent fulfilled — within 30 days
    expect(ids).not.toContain('4') // old fulfilled dropped
  })

  it('passes status=any query on first request, then drops it on paginated requests', async () => {
    const p1 = {
      status: 200,
      headers: {
        Link: '<https://x.myshopify.com/admin/api/2024-01/orders.json?limit=250&page_info=NEXT>; rel="next"',
      },
      body: { orders: [] },
    }
    const p2 = { status: 200, headers: {}, body: { orders: [] } }
    vi.stubGlobal('fetch', mockFetchSequence([p1, p2]))

    await fetchShopifyOrders(SHOP, TOKEN)
    expect(p1.capturedUrl).toContain('status=any')
    expect(p2.capturedUrl).toContain('page_info=NEXT')
    expect(p2.capturedUrl).not.toContain('status=any')
  })
})
