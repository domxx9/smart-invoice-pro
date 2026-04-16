import { describe, it, expect, beforeEach } from 'vitest'
import {
  fmt,
  setCurrency,
  setInvoicePrefix,
  setInvoicePadding,
  nextId,
  blankInvoice,
  calcTotals,
  timeAgo,
  cleanWhatsApp,
  extractItems,
  matchItems,
  getTopCandidates,
  groupProducts,
  searchGroups,
} from '../helpers.js'

// ─── calcTotals ──────────────────────────────────────────────────────────────

describe('calcTotals', () => {
  it('returns zeros for empty items', () => {
    expect(calcTotals([], 20)).toEqual({ sub: 0, tax: 0, total: 0 })
  })

  it('calculates subtotal, tax, and total correctly', () => {
    const items = [
      { qty: 2, price: 10 },
      { qty: 1, price: 5 },
    ]
    const result = calcTotals(items, 20)
    expect(result.sub).toBe(25)
    expect(result.tax).toBe(5)
    expect(result.total).toBe(30)
  })

  it('handles string qty and price values', () => {
    const items = [{ qty: '3', price: '7.50' }]
    const result = calcTotals(items, '10')
    expect(result.sub).toBe(22.5)
    expect(result.tax).toBeCloseTo(2.25)
    expect(result.total).toBeCloseTo(24.75)
  })

  it('treats missing/invalid values as zero', () => {
    const items = [{ qty: 'abc', price: 10 }, { qty: 2, price: '' }]
    expect(calcTotals(items, 0)).toEqual({ sub: 0, tax: 0, total: 0 })
  })
})

// ─── cleanWhatsApp ───────────────────────────────────────────────────────────

describe('cleanWhatsApp', () => {
  it('strips WhatsApp timestamps and sender names', () => {
    const input = '[10:30 AM] John: I need 5 red widgets\n[10:31 AM] John: and 3 blue ones'
    const result = cleanWhatsApp(input)
    expect(result).toContain('5 red widgets')
    expect(result).toContain('3 blue ones')
    expect(result).not.toContain('[10:30')
    expect(result).not.toContain('John:')
  })

  it('filters out greetings and short questions', () => {
    const input = 'hello\nhi there\nI need 10 bolts\nthanks\n?'
    const result = cleanWhatsApp(input)
    expect(result).toBe('I need 10 bolts')
  })

  it('keeps substantive lines', () => {
    const input = 'Can you send me a quote for 20 meters of cable\nAlso need connectors'
    const result = cleanWhatsApp(input)
    expect(result).toContain('quote for 20 meters of cable')
    expect(result).toContain('Also need connectors')
  })
})

// ─── extractItems ────────────────────────────────────────────────────────────

describe('extractItems', () => {
  it('extracts "Nx item" prefix format', () => {
    const result = extractItems('3x red widget')
    expect(result).toHaveLength(1)
    expect(result[0].qty).toBe(3)
    expect(result[0].name).toBe('red widget')
  })

  it('extracts "item xN" suffix format', () => {
    const result = extractItems('blue connector x5')
    expect(result).toHaveLength(1)
    expect(result[0].qty).toBe(5)
    expect(result[0].name).toBe('blue connector')
  })

  it('defaults qty to 1 when not specified', () => {
    const result = extractItems('large wrench')
    expect(result).toHaveLength(1)
    expect(result[0].qty).toBe(1)
  })

  it('handles multiple lines', () => {
    const result = extractItems('2x bolts\n3x nuts\nwashers')
    expect(result).toHaveLength(3)
    expect(result[0].qty).toBe(2)
    expect(result[2].qty).toBe(1)
  })

  it('strips filler words from item names', () => {
    const result = extractItems('please get some red paint for me')
    expect(result[0].name).not.toContain('please')
    expect(result[0].name).not.toContain('get')
    expect(result[0].name).toContain('red paint')
  })
})

// ─── matchItems (exercises wordSim + matchConfidence indirectly) ─────────────

describe('matchItems', () => {
  const products = [
    { name: 'Red Widget', price: 5 },
    { name: 'Blue Connector', price: 3 },
    { name: 'Large Wrench Set', price: 25 },
  ]

  it('matches exact product names with high confidence', () => {
    const extracted = [{ raw: 'red widget', name: 'red widget', qty: 1 }]
    const result = matchItems(extracted, products)
    expect(result[0].confidence).toBeGreaterThanOrEqual(80)
    expect(result[0].product.name).toBe('Red Widget')
  })

  it('returns bestGuess for partial matches', () => {
    const extracted = [{ raw: 'wrench', name: 'wrench', qty: 1 }]
    const result = matchItems(extracted, products)
    expect(result[0].bestGuess?.name || result[0].product?.name).toBe('Large Wrench Set')
  })

  it('returns null product for no-match items', () => {
    const extracted = [{ raw: 'piano', name: 'piano', qty: 1 }]
    const result = matchItems(extracted, products)
    expect(result[0].product).toBeNull()
    expect(result[0].confidence).toBeLessThan(80)
  })
})

// ─── nextId ──────────────────────────────────────────────────────────────────

describe('nextId', () => {
  beforeEach(() => {
    setInvoicePrefix('INV')
    setInvoicePadding(4)
  })

  it('returns INV0001 for empty invoice list', () => {
    expect(nextId([])).toBe('INV0001')
  })

  it('increments from the highest existing id', () => {
    const invoices = [{ id: 'INV0003' }, { id: 'INV0001' }]
    expect(nextId(invoices)).toBe('INV0004')
  })
})

// ─── fmt ─────────────────────────────────────────────────────────────────────

describe('fmt', () => {
  beforeEach(() => setCurrency('GBP'))

  it('formats a number as currency', () => {
    const result = fmt(100)
    expect(result).toContain('100')
  })

  it('formats zero/null safely', () => {
    expect(fmt(0)).toBeTruthy()
    expect(fmt(null)).toBeTruthy()
  })
})

// ─── timeAgo ─────────────────────────────────────────────────────────────────

describe('timeAgo', () => {
  it('returns null for falsy input', () => {
    expect(timeAgo(null)).toBeNull()
    expect(timeAgo(0)).toBeNull()
  })

  it('returns "just now" for recent timestamps', () => {
    expect(timeAgo(Date.now() - 5000)).toBe('just now')
  })

  it('returns minutes ago', () => {
    expect(timeAgo(Date.now() - 5 * 60 * 1000)).toBe('5m ago')
  })

  it('returns hours ago', () => {
    expect(timeAgo(Date.now() - 3 * 3600 * 1000)).toBe('3h ago')
  })

  it('returns days ago', () => {
    expect(timeAgo(Date.now() - 2 * 86400 * 1000)).toBe('2d ago')
  })
})
