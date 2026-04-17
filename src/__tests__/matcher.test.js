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
  it('matches within 10ms', () => {
    invalidateProductIndex()
    const big = Array.from({ length: 500 }, (_, i) => ({
      id: `id-${i}`,
      name: `Product ${i} ${['Widget', 'Bolt', 'Nut', 'Cable', 'Screw'][i % 5]}`,
      price: i,
    }))
    matchProduct('Widget', big) // warm index
    const t0 = performance.now()
    for (let i = 0; i < 5; i++) matchProduct('widget 42', big)
    const avg = (performance.now() - t0) / 5
    expect(avg).toBeLessThan(10)
  })
})
