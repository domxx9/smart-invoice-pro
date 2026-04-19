import { describe, it, expect, beforeEach } from 'vitest'
import { matchProduct, matchItems, getTopCandidates, invalidateProductIndex } from '../matcher.js'

const PRODUCTS = [
  { id: 'p1', name: 'Red Widget', price: 5 },
  { id: 'p2', name: 'Blue Connector', price: 3 },
  { id: 'p3', name: 'Large Wrench Set', price: 25 },
  { id: 'p4', name: 'Stainless Steel Bolt', price: 2 },
  { id: 'p5', name: 'Hex Nut Assorted', price: 1 },
]

describe('matchProduct', () => {
  beforeEach(() => invalidateProductIndex())

  it('returns a high-score hit for an exact name', () => {
    const m = matchProduct('Red Widget', PRODUCTS)
    expect(m).not.toBeNull()
    expect(m.id).toBe('p1')
    expect(m.name).toBe('Red Widget')
    expect(m.score).toBeGreaterThanOrEqual(95)
  })

  it('tolerates a 1-char typo', () => {
    const m = matchProduct('Red Wideget', PRODUCTS)
    expect(m).not.toBeNull()
    expect(m.id).toBe('p1')
    expect(m.score).toBeGreaterThanOrEqual(70)
  })

  it('finds an abbreviation / partial word', () => {
    const m = matchProduct('wrench', PRODUCTS)
    expect(m).not.toBeNull()
    expect(m.id).toBe('p3')
  })

  it('returns null for empty input', () => {
    expect(matchProduct('', PRODUCTS)).toBeNull()
    expect(matchProduct('   ', PRODUCTS)).toBeNull()
    expect(matchProduct(null, PRODUCTS)).toBeNull()
  })

  it('returns null when no product crosses the match threshold', () => {
    expect(matchProduct('piano', PRODUCTS)).toBeNull()
  })

  it('returns null for an empty catalogue', () => {
    expect(matchProduct('widget', [])).toBeNull()
    expect(matchProduct('widget', null)).toBeNull()
  })
})

describe('matchItems (Fuse-backed)', () => {
  beforeEach(() => invalidateProductIndex())

  it('flags an exact match as auto_match (>=80%)', () => {
    const [r] = matchItems([{ raw: 'red widget', name: 'red widget', qty: 1 }], PRODUCTS)
    expect(r.confidence).toBeGreaterThanOrEqual(80)
    expect(r.product?.name).toBe('Red Widget')
    expect(r.bestGuess).toBeNull()
  })

  it('returns a product or bestGuess for partial matches', () => {
    const [r] = matchItems([{ raw: 'wrench', name: 'wrench', qty: 1 }], PRODUCTS)
    const hit = r.product ?? r.bestGuess
    expect(hit?.name).toBe('Large Wrench Set')
  })

  it('returns null product for unrelated input', () => {
    const [r] = matchItems([{ raw: 'piano', name: 'piano', qty: 1 }], PRODUCTS)
    expect(r.product).toBeNull()
    expect(r.bestGuess).toBeNull()
    expect(r.confidence).toBe(0)
  })

  it('preserves raw/name/qty fields on every row', () => {
    const [r] = matchItems([{ raw: '2 x piano', name: 'piano', qty: 2 }], PRODUCTS)
    expect(r.raw).toBe('2 x piano')
    expect(r.name).toBe('piano')
    expect(r.qty).toBe(2)
  })

  it('returns an empty array for an empty extracted list', () => {
    expect(matchItems([], PRODUCTS)).toEqual([])
  })
})

describe('getTopCandidates', () => {
  beforeEach(() => invalidateProductIndex())

  it('returns up to N candidates ordered by score', () => {
    const results = getTopCandidates('nut', PRODUCTS, 3)
    expect(results.length).toBeGreaterThan(0)
    expect(results[0].name).toBe('Hex Nut Assorted')
  })

  it('returns an empty array for empty input', () => {
    expect(getTopCandidates('', PRODUCTS)).toEqual([])
    expect(getTopCandidates('widget', [])).toEqual([])
  })
})

describe('performance: 500-item catalogue', () => {
  // Threshold is deliberately generous to absorb CI runner variance, which is
  // especially harsh on the vitest parallel pool (20+ files competing for a
  // single CPU core). Intent is a smoke check that matching stays well under
  // UI-perceptible latency, not a micro-benchmark — isolated runs land in the
  // single-digit-ms range. Raised from 50ms → 200ms when SMA-98 added the
  // `keywords` + `desc` Fuse keys (roughly doubles per-query bitap work).
  it('matches well under UI-perceptible latency', () => {
    invalidateProductIndex()
    const big = Array.from({ length: 500 }, (_, i) => ({
      id: `id-${i}`,
      name: `Product ${i} ${['Widget', 'Bolt', 'Nut', 'Cable', 'Screw'][i % 5]}`,
      desc: `Heavy duty ${i} hardware for industrial use`,
      price: i,
    }))
    for (let i = 0; i < 10; i++) matchProduct('Widget', big) // warm index + JIT
    const iterations = 20
    const t0 = performance.now()
    for (let i = 0; i < iterations; i++) matchProduct('widget 42', big)
    const avg = (performance.now() - t0) / iterations
    expect(avg).toBeLessThan(200)
  })
})

describe('desc + keyword indexing', () => {
  const CATALOG = [
    { id: 'p1', name: 'Front Shock', desc: 'Bilstein 5100 lifted Tacoma', price: 120 },
    { id: 'p2', name: 'Rear Shock', desc: 'OEM replacement sedan', price: 85 },
    { id: 'p3', name: 'Brake Pad', desc: 'Ceramic low-dust daily driver', price: 45 },
    { id: 'p4', name: 'Oil Filter', desc: 'Compatible with Tacoma 2016+', price: 12 },
  ]

  beforeEach(() => invalidateProductIndex())

  it('matches a word that only appears in desc', () => {
    const m = matchProduct('bilstein', CATALOG)
    expect(m).not.toBeNull()
    expect(m.id).toBe('p1')
  })

  it('matches a multi-word description phrase', () => {
    const m = matchProduct('lifted tacoma', CATALOG)
    expect(m).not.toBeNull()
    expect(m.id).toBe('p1')
  })

  it('still prefers exact name matches over desc-only hits', () => {
    // "Tacoma" appears in both p1 desc and p4 desc; a name-word like "Shock"
    // should beat desc-only noise.
    const m = matchProduct('Shock', CATALOG)
    expect(m).not.toBeNull()
    expect(['p1', 'p2']).toContain(m.id)
    expect(m.score).toBeGreaterThanOrEqual(80)
  })

  it('does not expose the internal keywords field on matchProduct output', () => {
    const m = matchProduct('Front Shock', CATALOG)
    expect(m).not.toBeNull()
    expect(m).not.toHaveProperty('keywords')
    expect(m).not.toHaveProperty('desc')
  })

  it('does not mutate caller-supplied product objects', () => {
    const fresh = [{ id: 'x1', name: 'Gizmo', desc: 'Tiny shiny thing' }]
    matchProduct('gizmo', fresh)
    expect(fresh[0]).not.toHaveProperty('keywords')
    expect(Object.keys(fresh[0]).sort()).toEqual(['desc', 'id', 'name'])
  })

  it('returns the original product object from getTopCandidates (no keywords leak)', () => {
    const [top] = getTopCandidates('bilstein', CATALOG, 1)
    expect(top).toBeDefined()
    expect(top.id).toBe('p1')
    expect(top).not.toHaveProperty('keywords')
  })

  it('returns the original product object from matchItems (no keywords leak)', () => {
    const [r] = matchItems([{ raw: 'bilstein', name: 'bilstein', qty: 1 }], CATALOG)
    const hit = r.product ?? r.bestGuess
    expect(hit?.id).toBe('p1')
    expect(hit).not.toHaveProperty('keywords')
  })

  it('tolerates products with missing/null desc', () => {
    const mixed = [
      { id: 'a', name: 'Red Widget' },
      { id: 'b', name: 'Blue Widget', desc: null },
      { id: 'c', name: 'Green Widget', desc: undefined },
    ]
    const m = matchProduct('widget', mixed)
    expect(m).not.toBeNull()
  })
})
