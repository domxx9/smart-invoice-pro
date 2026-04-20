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

// ─── SMA-119 Bag-of-words scoring ────────────────────────────────────────────

describe('bag-of-words matcher (SMA-119)', () => {
  const SURGICAL = [
    { id: 's1', name: 'Adson Scissors Straight Blue', desc: 'Operating theatre issue' },
    { id: 's2', name: 'Straight Scissors', desc: 'Stainless' },
    { id: 's3', name: 'Blue Widget', desc: 'Plastic' },
    { id: 's4', name: 'Curved Forceps', desc: 'Nickel plated' },
  ]

  beforeEach(() => invalidateProductIndex())

  it('auto-matches permuted query against reordered product name (acceptance)', () => {
    const m = matchProduct('blue straight scissors', SURGICAL)
    expect(m).not.toBeNull()
    expect(m.id).toBe('s1')
    expect(m.score).toBeGreaterThanOrEqual(80)
  })

  it('is order-independent: every 3-word permutation gets identical confidence', () => {
    const perms = [
      'blue straight scissors',
      'blue scissors straight',
      'straight blue scissors',
      'straight scissors blue',
      'scissors blue straight',
      'scissors straight blue',
    ]
    const scores = perms.map((q) => {
      invalidateProductIndex()
      return matchProduct(q, SURGICAL)?.score
    })
    expect(new Set(scores).size).toBe(1)
    expect(scores[0]).toBeGreaterThanOrEqual(80)
  })

  it('ranks higher-overlap products above partial-overlap products', () => {
    const results = getTopCandidates('blue straight scissors', SURGICAL, 4)
    expect(results[0].id).toBe('s1') // 3/3 tokens
    expect(results[1].id).toBe('s2') // 2/3 tokens (straight, scissors)
    // s3/s4 may or may not show; they must not outrank s1/s2.
    const ids = results.map((r) => r.id)
    expect(ids.indexOf('s1')).toBeLessThan(ids.indexOf('s2'))
  })

  it('drops partial-overlap products below auto-match threshold but keeps them as bestGuess', () => {
    const [r] = matchItems(
      [{ raw: 'blue straight scissors', name: 'blue straight scissors', qty: 1 }],
      SURGICAL,
    )
    expect(r.confidence).toBeGreaterThanOrEqual(80)
    expect(r.product?.id).toBe('s1')

    invalidateProductIndex()
    const [r2] = matchItems(
      // Only 1 of 3 tokens (blue) overlaps with any realistic product here.
      [{ raw: 'blue foo bar', name: 'blue foo bar', qty: 1 }],
      SURGICAL,
    )
    expect(r2.confidence).toBeGreaterThanOrEqual(30)
    expect(r2.confidence).toBeLessThan(80)
    expect(r2.bestGuess).not.toBeNull()
    expect(r2.product).toBeNull()
  })

  it('ignores SMA-118 stopwords in the query token set', () => {
    // "the", "and", "of" should not count toward query-token-count.
    const m = matchProduct('the blue and straight scissors', SURGICAL)
    expect(m).not.toBeNull()
    expect(m.id).toBe('s1')
    expect(m.score).toBeGreaterThanOrEqual(80)
  })

  it('still routes single-token queries through the Fuse fallback', () => {
    // "scissors" alone must hit the product that contains it; Fuse handles
    // the typo-tolerance profile the bag path deliberately does not emulate.
    const m = matchProduct('scissors', SURGICAL)
    expect(m).not.toBeNull()
    expect(['s1', 's2']).toContain(m.id)
  })

  it('returns null when no query token overlaps any product', () => {
    const m = matchProduct('piano accordion harp', SURGICAL)
    expect(m).toBeNull()
  })

  it('ranks the same product top even when one query token has a typo', () => {
    // "bleu" (typo of blue) + 2 exact tokens → s1 still wins over s2 (which
    // only has 2 of 3 tokens), because the per-token Fuse pass lifts s1 to
    // either 3/3 or, at minimum, ties on matched count and wins on subscore.
    const m = matchProduct('bleu scissors straight', SURGICAL)
    expect(m).not.toBeNull()
    expect(m.id).toBe('s1')
    // Must at least carry the 2-exact-token floor (2/3 → 67%).
    expect(m.score).toBeGreaterThanOrEqual(67)
  })

  it('does not mutate caller-supplied product objects', () => {
    const fresh = [
      { id: 'x1', name: 'Gizmo Blue', desc: 'Tiny shiny thing' },
      { id: 'x2', name: 'Red Gadget' },
    ]
    const before = fresh.map((p) => ({ ...p }))
    matchProduct('blue gizmo', fresh)
    expect(fresh).toEqual(before)
  })

  it('keeps 500-product multi-token scoring under 200ms', () => {
    invalidateProductIndex()
    const big = Array.from({ length: 500 }, (_, i) => ({
      id: `id-${i}`,
      name: `Product ${i} ${['Widget', 'Bolt', 'Nut', 'Cable', 'Screw'][i % 5]}`,
      desc: `Heavy duty ${i} hardware for industrial use`,
      price: i,
    }))
    for (let i = 0; i < 5; i++) matchProduct('widget 42 industrial', big) // warm
    const iterations = 20
    const t0 = performance.now()
    for (let i = 0; i < iterations; i++) matchProduct('widget 42 industrial', big)
    const avg = (performance.now() - t0) / iterations
    expect(avg).toBeLessThan(200)
  })
})
