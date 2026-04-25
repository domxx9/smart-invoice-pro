import { describe, it, expect, beforeEach } from 'vitest'
import { getTopCandidates, invalidateProductIndex } from '../matcher.js'

const FILTER_CATALOG = [
  { id: 'p1', name: 'Oil Filter', category: 'Auto Parts', desc: 'Fits Tacoma 2016+', price: 12 },
  { id: 'p2', name: 'Coffee Filter', category: 'Kitchen', desc: 'Paper drip filter', price: 5 },
  {
    id: 'p3',
    name: 'Air Filter',
    category: 'Auto Parts',
    desc: 'High-flow panel filter',
    price: 18,
  },
  { id: 'p4', name: 'Fuel Filter', category: 'Auto Parts', desc: 'In-line fuel filter', price: 22 },
]

describe('getTopCandidates context-aware re-ranking (SMA-201)', () => {
  beforeEach(() => {
    invalidateProductIndex()
  })

  it('returns top N candidates with no context (backwards compatible)', () => {
    const results = getTopCandidates('filter', FILTER_CATALOG, 3)
    expect(results.length).toBeGreaterThan(0)
    expect(results.length).toBeLessThanOrEqual(3)
  })

  it('does not override exact-name matches with context boost', () => {
    const results = getTopCandidates('Oil Filter', FILTER_CATALOG, 3, { productType: 'Kitchen' })
    expect(results[0].name).toBe('Oil Filter')
  })

  it('ranks products in the matching category higher when context is provided', () => {
    const results = getTopCandidates('filter', FILTER_CATALOG, 3, { productType: 'Auto Parts' })
    const ids = results.map((r) => r.id)
    expect(ids).toContain('p1')
    expect(ids).toContain('p3')
    expect(ids).toContain('p4')
    const nonAutoPartsResult = getTopCandidates('filter', FILTER_CATALOG, 4, {
      productType: 'Auto Parts',
    })
    const allIds = nonAutoPartsResult.map((r) => r.id)
    expect(allIds.indexOf('p1')).toBeLessThan(allIds.indexOf('p2'))
    expect(allIds.indexOf('p3')).toBeLessThan(allIds.indexOf('p2'))
  })

  it('boosts products whose desc contains vocabulary terms', () => {
    const results = getTopCandidates('filter', FILTER_CATALOG, 4, { vocabulary: 'tacoma' })
    const ids = results.map((r) => r.id)
    expect(ids).toContain('p1')
    expect(ids.indexOf('p1')).toBeLessThan(ids.indexOf('p2'))
  })

  it('accepts context without productType', () => {
    const results = getTopCandidates('filter', FILTER_CATALOG, 4, { vocabulary: 'tacoma' })
    expect(results.length).toBeGreaterThan(0)
  })

  it('accepts context without vocabulary', () => {
    const results = getTopCandidates('filter', FILTER_CATALOG, 4, { productType: 'Auto Parts' })
    expect(results.length).toBeGreaterThan(0)
  })

  it('is back-compatible with callers passing no context', () => {
    const withCtx = getTopCandidates('filter', FILTER_CATALOG, 3, { productType: 'Auto Parts' })
    const withoutCtx = getTopCandidates('filter', FILTER_CATALOG, 3)
    expect(withCtx.length).toBe(withoutCtx.length)
  })
})
