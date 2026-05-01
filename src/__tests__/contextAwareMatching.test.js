import { describe, it, expect, beforeEach } from 'vitest'
import { getTopCandidates, invalidateProductIndex } from '../matcher.js'

const PRODUCTS = [
  { id: 'p1', name: 'Oil Filter', category: 'Auto Parts' },
  { id: 'p2', name: 'Coffee Filter', category: 'Kitchen' },
  { id: 'p3', name: 'Air Filter', category: 'Auto Parts' },
  { id: 'p4', name: 'Water Filter', category: 'Home' },
]

describe('Context-Aware Fuzzy Re-Ranking', () => {
  beforeEach(() => invalidateProductIndex())

  it('ranks products in the matching category higher when context is provided', async () => {
    const context = { productType: 'Auto Parts' }
    const results = await getTopCandidates('filter', PRODUCTS, 4, context)

    // With context-aware re-ranking, 'Oil Filter' or 'Air Filter' should be #1 or #2
    const top2Ids = results.slice(0, 2).map((r) => r.id)
    expect(top2Ids).toContain('p1')
    expect(top2Ids).toContain('p3')

    // 'Coffee Filter' should be lower
    expect(results[2].id).toBe('p2')
  })

  it('still respects lexical similarity (exact match beats context boost)', async () => {
    const context = { productType: 'Kitchen' }
    const results = await getTopCandidates('Air Filter', PRODUCTS, 4, context)

    // Even if context is 'Kitchen', 'Air Filter' is an exact match for the query
    expect(results[0].id).toBe('p3')
  })

  it('uses vocabulary from context to boost matches', async () => {
    const context = { vocabulary: 'Bilstein Tacoma' }
    const products = [
      { id: 'p1', name: 'Front Shock', desc: 'Bilstein 5100', category: 'Suspension' },
      { id: 'p2', name: 'Front Shock', desc: 'OEM', category: 'Suspension' },
    ]
    const results = await getTopCandidates('Front Shock', products, 2, context)

    // Both are 'Front Shock', but p1 matches the vocabulary 'Bilstein'
    expect(results[0].id).toBe('p1')
  })
})
