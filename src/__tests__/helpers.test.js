import { describe, it, expect, beforeEach } from 'vitest'
import {
  fmt,
  setCurrency,
  setInvoicePrefix,
  setInvoicePadding,
  nextId,
  calcTotals,
  blankInvoice,
  timeAgo,
  cleanWhatsApp,
  extractItems,
  matchItems,
  normalizeText,
  EXTENDED_STOPWORDS,
} from '../helpers.js'

// ─── calcTotals ──────────────────────────────────────────────────────────────

describe('calcTotals', () => {
  it('returns zeros for empty items', () => {
    const r = calcTotals([], 20)
    expect(r.sub).toBe(0)
    expect(r.tax).toBe(0)
    expect(r.total).toBe(0)
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
    const items = [
      { qty: 'abc', price: 10 },
      { qty: 2, price: '' },
    ]
    const r = calcTotals(items, 0)
    expect(r.sub).toBe(0)
    expect(r.tax).toBe(0)
    expect(r.total).toBe(0)
  })

  it('is unchanged when no discounts argument is provided (back-compat)', () => {
    const items = [{ qty: 4, price: 25 }] // sub = 100
    const r = calcTotals(items, 10)
    expect(r.sub).toBe(100)
    expect(r.discountTotal).toBe(0)
    expect(r.discountLines).toEqual([])
    expect(r.discounted).toBe(100)
    expect(r.tax).toBeCloseTo(10)
    expect(r.total).toBeCloseTo(110)
  })
})

describe('calcTotals with discounts', () => {
  const items = [{ qty: 4, price: 25 }] // sub = 100

  it('applies a single percent discount before tax', () => {
    const r = calcTotals(items, 10, [{ type: 'percent', value: 10 }])
    expect(r.sub).toBe(100)
    expect(r.discountTotal).toBeCloseTo(10)
    expect(r.discounted).toBeCloseTo(90)
    expect(r.tax).toBeCloseTo(9)
    expect(r.total).toBeCloseTo(99)
  })

  it('applies a single fixed discount before tax', () => {
    const r = calcTotals(items, 10, [{ type: 'fixed', value: 15 }])
    expect(r.discountTotal).toBe(15)
    expect(r.discounted).toBe(85)
    expect(r.tax).toBeCloseTo(8.5)
    expect(r.total).toBeCloseTo(93.5)
  })

  it('applies multiple percent discounts additively against subtotal', () => {
    const r = calcTotals(items, 0, [
      { type: 'percent', value: 10 },
      { type: 'percent', value: 5 },
    ])
    expect(r.discountTotal).toBeCloseTo(15)
    expect(r.discounted).toBeCloseTo(85)
    expect(r.total).toBeCloseTo(85)
  })

  it('applies percents first then fixed, tax on the reduced amount', () => {
    const r = calcTotals(items, 20, [
      { type: 'percent', value: 10 }, // -10 → 90
      { type: 'fixed', value: 20 }, // -20 → 70
    ])
    expect(r.discountTotal).toBeCloseTo(30)
    expect(r.discounted).toBeCloseTo(70)
    expect(r.tax).toBeCloseTo(14)
    expect(r.total).toBeCloseTo(84)
  })

  it('zeros out totals at 100% discount', () => {
    const r = calcTotals(items, 20, [{ type: 'percent', value: 100 }])
    expect(r.discountTotal).toBe(100)
    expect(r.discounted).toBe(0)
    expect(r.tax).toBe(0)
    expect(r.total).toBe(0)
  })

  it('clamps when discounts exceed the subtotal', () => {
    const r = calcTotals(items, 10, [
      { type: 'percent', value: 75 }, // -75
      { type: 'fixed', value: 500 }, // would be -500
    ])
    expect(r.discountTotal).toBe(100)
    expect(r.discounted).toBe(0)
    expect(r.tax).toBe(0)
    expect(r.total).toBe(0)
  })

  it('ignores negative discount values', () => {
    const r = calcTotals(items, 10, [
      { type: 'percent', value: -10 },
      { type: 'fixed', value: -5 },
    ])
    expect(r.discountTotal).toBe(0)
    expect(r.discounted).toBe(100)
    expect(r.total).toBeCloseTo(110)
  })

  it('ignores zero and non-finite discount values', () => {
    const r = calcTotals(items, 0, [
      { type: 'percent', value: 0 },
      { type: 'fixed', value: 'abc' },
      { type: 'fixed', value: null },
    ])
    expect(r.discountTotal).toBe(0)
    expect(r.discounted).toBe(100)
  })

  it('ignores unknown discount types', () => {
    const r = calcTotals(items, 0, [
      { type: 'mystery', value: 50 },
      { type: 'percent', value: 10 },
    ])
    expect(r.discountTotal).toBeCloseTo(10)
    expect(r.discountLines).toHaveLength(1)
  })

  it('accepts string discount values like form inputs', () => {
    const r = calcTotals(items, 0, [
      { type: 'percent', value: '15' },
      { type: 'fixed', value: '2.50' },
    ])
    expect(r.discountTotal).toBeCloseTo(17.5)
    expect(r.discounted).toBeCloseTo(82.5)
  })

  it('safely handles null / non-array discounts', () => {
    expect(calcTotals(items, 0, null).discountTotal).toBe(0)
    expect(calcTotals(items, 0, 'oops').discountTotal).toBe(0)
    expect(calcTotals(items, 0, undefined).discountTotal).toBe(0)
  })

  it('returns a line entry per discount with computed amount', () => {
    const r = calcTotals(items, 0, [
      { type: 'percent', value: 25, name: 'Promo' },
      { type: 'fixed', value: 5, name: 'Goodwill' },
    ])
    expect(r.discountLines).toEqual([
      { type: 'percent', value: 25, name: 'Promo', amount: 25 },
      { type: 'fixed', value: 5, name: 'Goodwill', amount: 5 },
    ])
  })
})

describe('blankInvoice', () => {
  it('initialises discounts as an empty array', () => {
    const inv = blankInvoice([], 20)
    expect(inv.discounts).toEqual([])
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

  // SMA-118 — joiner split, normalize, container-of pattern
  it('splits on the joining word "and" (SMA-118)', () => {
    const result = extractItems('5 blue bolts and 3 washers')
    expect(result).toHaveLength(2)
    expect(result[0]).toMatchObject({ name: 'blue bolts', qty: 5 })
    expect(result[1]).toMatchObject({ name: 'washers', qty: 3 })
  })

  it('splits on "also"/"plus" joiners (SMA-118)', () => {
    const r1 = extractItems('2 hammers also 4 nails')
    expect(r1).toHaveLength(2)
    expect(r1[0].qty).toBe(2)
    expect(r1[1].qty).toBe(4)

    const r2 = extractItems('1 drill plus 6 bits')
    expect(r2).toHaveLength(2)
    expect(r2[0].qty).toBe(1)
    expect(r2[1].qty).toBe(6)
  })

  it('splits on "&" / "+" when surrounded by letters (SMA-118)', () => {
    const r = extractItems('nuts & bolts + washers')
    expect(r).toHaveLength(3)
    expect(r.map((i) => i.name)).toEqual(['nuts', 'bolts', 'washers'])
  })

  it('preserves qty inside "Box of N <item>" pattern (SMA-118)', () => {
    const result = extractItems('Box of 12 widgets, also a hammer')
    expect(result).toHaveLength(2)
    expect(result[0]).toMatchObject({ name: 'widgets', qty: 12 })
    expect(result[1]).toMatchObject({ name: 'hammer', qty: 1 })
  })

  it('does NOT split numeric expressions like "2 + 3" (SMA-118)', () => {
    const result = extractItems('2 + 3 widgets')
    expect(result).toHaveLength(1)
    expect(result[0].raw).toContain('2 + 3 widgets')
  })

  it('does NOT split inside a qty pattern like "2 x 4" (SMA-118)', () => {
    const result = extractItems('2 x 4')
    expect(result).toHaveLength(1)
    expect(result[0].qty).toBe(2)
  })

  it('normalizes smart quotes and dashes before extraction (SMA-118)', () => {
    const result = extractItems('3 red widgets \u2014 express')
    expect(result).toHaveLength(1)
    expect(result[0].qty).toBe(3)
    expect(result[0].raw).toContain('-')
    expect(result[0].raw).not.toContain('\u2014')
  })

  it('normalizes NFKC full-width digits and collapses whitespace (SMA-118)', () => {
    const result = extractItems('\uFF13    blue     bolts')
    expect(result).toHaveLength(1)
    expect(result[0].qty).toBe(3)
    expect(result[0].name).toBe('blue bolts')
  })

  it('preserves WhatsApp regression through the preprocess pipeline (SMA-118)', () => {
    const wa = '[10:30 AM] John: 2x bolts\n[10:31 AM] John: hi'
    const result = extractItems(wa)
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ name: 'bolts', qty: 2 })
  })
})

// ─── normalizeText (SMA-118) ─────────────────────────────────────────────────

describe('normalizeText (SMA-118)', () => {
  it('returns empty string for null/undefined/empty input', () => {
    expect(normalizeText(null)).toBe('')
    expect(normalizeText(undefined)).toBe('')
    expect(normalizeText('')).toBe('')
  })

  it('applies NFKC normalization (full-width → ASCII)', () => {
    expect(normalizeText('\uFF11\uFF12\uFF13')).toBe('123')
    expect(normalizeText('\uFB01')).toBe('fi')
  })

  it('maps smart quotes to ASCII', () => {
    expect(normalizeText('\u2018hello\u2019')).toBe("'hello'")
    expect(normalizeText('\u201Chello\u201D')).toBe('"hello"')
  })

  it('maps en/em dash + minus to ASCII hyphen', () => {
    expect(normalizeText('a\u2013b\u2014c\u2212d')).toBe('a-b-c-d')
  })

  it('collapses horizontal whitespace but preserves newlines', () => {
    expect(normalizeText('a  \t  b\n  c')).toBe('a b\nc')
  })

  it('replaces non-breaking and exotic whitespace', () => {
    expect(normalizeText('a\u00A0b\u2003c')).toBe('a b c')
  })
})

// ─── EXTENDED_STOPWORDS (SMA-118) ────────────────────────────────────────────

describe('EXTENDED_STOPWORDS (SMA-118)', () => {
  it('exports the full expected stopword list', () => {
    expect([...EXTENDED_STOPWORDS]).toEqual([
      'the',
      'a',
      'an',
      'some',
      'please',
      'need',
      'order',
      'of',
      'with',
      'for',
      'and',
      'also',
      'plus',
    ])
  })

  it('is frozen / immutable', () => {
    expect(Object.isFrozen(EXTENDED_STOPWORDS)).toBe(true)
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
