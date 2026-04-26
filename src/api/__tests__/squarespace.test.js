import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { fetchSquarespaceProducts, fetchSquarespaceOrders } from '../squarespace.js'

function mockFetchSequence(responses) {
  let i = 0
  return vi.fn(async (url) => {
    const spec = responses[i++]
    if (!spec) throw new Error(`Unexpected fetch call #${i} to ${url}`)
    return {
      ok: spec.status ? spec.status < 400 : true,
      status: spec.status ?? 200,
      statusText: spec.statusText ?? 'OK',
      json: async () => spec.body,
    }
  })
}

const API_KEY = 'test-sqsp-key'

// Ensure tests use the browser path (no native Capacitor)
beforeEach(() => {
  if (typeof window !== 'undefined') {
    window.Capacitor = undefined
  }
})

afterEach(() => {
  vi.restoreAllMocks()
})

// Minimal product fixture
function makeProduct(overrides = {}) {
  return {
    id: 'prod-1',
    name: 'Test Widget',
    type: 'PHYSICAL',
    description: '<p>A <b>great</b> widget</p>',
    variants: [
      {
        id: 'var-1',
        pricing: { basePrice: { value: '19.99' } },
        stock: { unlimited: false, quantity: 5 },
        attributes: {},
      },
    ],
    ...overrides,
  }
}

describe('fetchSquarespaceProducts — browser path', () => {
  it('returns flattened products for a single-page response', async () => {
    globalThis.fetch = mockFetchSequence([
      {
        body: {
          products: [makeProduct()],
          pagination: { nextPageCursor: null },
        },
      },
    ])

    const products = await fetchSquarespaceProducts(API_KEY)
    expect(products).toHaveLength(1)
    expect(products[0]).toMatchObject({
      id: 'prod-1_v0',
      name: 'Test Widget',
      price: 19.99,
      stock: 5,
      category: 'Physical',
    })
  })

  it('strips HTML from descriptions', async () => {
    globalThis.fetch = mockFetchSequence([
      {
        body: {
          products: [makeProduct({ description: '<p>A <b>great</b> widget</p>' })],
          pagination: {},
        },
      },
    ])

    const [product] = await fetchSquarespaceProducts(API_KEY)
    expect(product.desc).toBe('A great widget')
  })

  it('follows pagination cursors until exhausted', async () => {
    const page1Product = makeProduct({ id: 'p1', name: 'Widget A' })
    const page2Product = makeProduct({ id: 'p2', name: 'Widget B' })

    globalThis.fetch = mockFetchSequence([
      {
        body: {
          products: [page1Product],
          pagination: { nextPageCursor: 'cursor-abc' },
        },
      },
      {
        body: {
          products: [page2Product],
          pagination: { nextPageCursor: null },
        },
      },
    ])

    const products = await fetchSquarespaceProducts(API_KEY)
    expect(products).toHaveLength(2)
    expect(globalThis.fetch).toHaveBeenCalledTimes(2)
    // Second call should include the cursor
    expect(globalThis.fetch.mock.calls[1][0]).toContain('cursor=cursor-abc')
  })

  it('calls onProgress with running total after each page', async () => {
    globalThis.fetch = mockFetchSequence([
      {
        body: { products: [makeProduct(), makeProduct({ id: 'p2' })], pagination: {} },
      },
    ])

    const onProgress = vi.fn()
    await fetchSquarespaceProducts(API_KEY, onProgress)
    expect(onProgress).toHaveBeenCalledWith(2)
  })

  it('calls onStats with parentCount and variantCount', async () => {
    const productWithTwoVariants = makeProduct({
      variants: [
        {
          id: 'v1',
          pricing: { basePrice: { value: '10' } },
          stock: { unlimited: true },
          attributes: { Size: 'S' },
        },
        {
          id: 'v2',
          pricing: { basePrice: { value: '12' } },
          stock: { unlimited: true },
          attributes: { Size: 'L' },
        },
      ],
    })

    globalThis.fetch = mockFetchSequence([
      { body: { products: [productWithTwoVariants], pagination: {} } },
    ])

    const onStats = vi.fn()
    await fetchSquarespaceProducts(API_KEY, undefined, onStats)
    expect(onStats).toHaveBeenCalledWith({ parentCount: 1, variantCount: 2 })
  })

  it('throws when products field is missing from response', async () => {
    globalThis.fetch = mockFetchSequence([{ body: { items: [] } }])

    await expect(fetchSquarespaceProducts(API_KEY)).rejects.toThrow(
      'Unexpected API response — products field missing',
    )
  })

  it('throws on non-OK HTTP response', async () => {
    globalThis.fetch = mockFetchSequence([{ status: 401, statusText: 'Unauthorized', body: {} }])

    await expect(fetchSquarespaceProducts(API_KEY)).rejects.toThrow('Squarespace API 401')
  })

  it('expands multi-option variants with suffix in name', async () => {
    const multiVariant = makeProduct({
      variants: [
        {
          id: 'v1',
          pricing: { basePrice: { value: '10' } },
          stock: { unlimited: true },
          attributes: { Color: 'Red', Size: 'S' },
        },
        {
          id: 'v2',
          pricing: { basePrice: { value: '10' } },
          stock: { unlimited: true },
          attributes: { Color: 'Blue', Size: 'M' },
        },
      ],
    })

    globalThis.fetch = mockFetchSequence([{ body: { products: [multiVariant], pagination: {} } }])

    const products = await fetchSquarespaceProducts(API_KEY)
    expect(products[0].name).toContain('Red')
    expect(products[1].name).toContain('Blue')
  })

  it('returns stock 99 for unlimited variants', async () => {
    const unlimited = makeProduct({
      variants: [
        {
          id: 'v1',
          pricing: { basePrice: { value: '5' } },
          stock: { unlimited: true },
          attributes: {},
        },
      ],
    })

    globalThis.fetch = mockFetchSequence([{ body: { products: [unlimited], pagination: {} } }])

    const [product] = await fetchSquarespaceProducts(API_KEY)
    expect(product.stock).toBe(99)
  })

  it('returns single row for products with no variants', async () => {
    const noVariants = makeProduct({ variants: [] })
    globalThis.fetch = mockFetchSequence([{ body: { products: [noVariants], pagination: {} } }])

    const products = await fetchSquarespaceProducts(API_KEY)
    expect(products).toHaveLength(1)
    expect(products[0].id).toBe('prod-1')
    expect(products[0].price).toBe(0)
    expect(products[0].stock).toBe(99)
  })
})

describe('fetchSquarespaceOrders — browser path', () => {
  function makeOrder(overrides = {}) {
    return {
      id: 'ord-1',
      orderNumber: '1001',
      createdOn: '2024-03-01T10:00:00.000Z',
      modifiedOn: '2024-03-01T10:05:00.000Z',
      fulfillmentStatus: 'PENDING',
      paymentStatus: 'PAID',
      billingAddress: { firstName: 'Alice', lastName: 'Smith' },
      customerEmail: 'alice@example.com',
      grandTotal: { value: '49.99', currency: 'USD' },
      lineItems: [{ productName: 'Widget', quantity: 2, unitPricePaid: { value: '24.99' } }],
      ...overrides,
    }
  }

  it('returns mapped orders for a single-page response', async () => {
    globalThis.fetch = mockFetchSequence([{ body: { orders: [makeOrder()], pagination: {} } }])

    const orders = await fetchSquarespaceOrders(API_KEY)
    expect(orders).toHaveLength(1)
    expect(orders[0]).toMatchObject({
      id: 'ord-1',
      orderNumber: '1001',
      customer: 'Alice Smith',
      email: 'alice@example.com',
      total: 49.99,
      currency: 'USD',
      status: 'PENDING',
    })
    expect(orders[0].lineItems).toHaveLength(1)
  })

  it('throws on non-OK HTTP response', async () => {
    globalThis.fetch = mockFetchSequence([{ status: 403, statusText: 'Forbidden', body: {} }])
    await expect(fetchSquarespaceOrders(API_KEY)).rejects.toThrow('Squarespace Orders API 403')
  })

  it('filters out old non-PENDING orders beyond 30-day window', async () => {
    const old = makeOrder({
      id: 'old-1',
      orderNumber: '900',
      fulfillmentStatus: 'FULFILLED',
      modifiedOn: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString(),
    })
    const recent = makeOrder({
      id: 'recent-1',
      orderNumber: '901',
      fulfillmentStatus: 'FULFILLED',
      modifiedOn: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    })
    const pending = makeOrder({ id: 'pending-1', orderNumber: '902', fulfillmentStatus: 'PENDING' })

    globalThis.fetch = mockFetchSequence([
      { body: { orders: [old, recent, pending], pagination: {} } },
    ])

    const orders = await fetchSquarespaceOrders(API_KEY)
    const ids = orders.map((o) => o.id)
    expect(ids).not.toContain('old-1')
    expect(ids).toContain('recent-1')
    expect(ids).toContain('pending-1')
  })

  it('calls onProgress after each page', async () => {
    globalThis.fetch = mockFetchSequence([
      {
        body: {
          orders: [makeOrder(), makeOrder({ id: 'ord-2', orderNumber: '1002' })],
          pagination: {},
        },
      },
    ])

    const onProgress = vi.fn()
    await fetchSquarespaceOrders(API_KEY, onProgress)
    expect(onProgress).toHaveBeenCalledWith(2)
  })
})
