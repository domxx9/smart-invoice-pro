import { describe, it, expect } from 'vitest'
import { runBm25Fallback, __test } from '../bm25.js'

const products = [
  { id: 'p1', name: 'Blue Molar Extractor', desc: 'Dental surgery tool' },
  { id: 'p2', name: 'Red Incisor Extractor', desc: 'Dental surgery tool' },
  { id: 'p3', name: 'Sterilisation Cassette 10 Instruments', desc: '' },
  { id: 'p4', name: 'Cotton Rolls Box of 500', desc: '' },
]

describe('runBm25Fallback (SMA-123 BYOK-tier fallback)', () => {
  it('returns empty when no paste text is provided', () => {
    expect(runBm25Fallback({ text: '', products })).toEqual({ extracted: [], rows: [] })
  })

  it('picks the best lexical match per line', () => {
    const { rows } = runBm25Fallback({
      text: '2 x Blue Molar Extractor\n5 x Cotton Rolls',
      products,
    })
    expect(rows).toHaveLength(2)
    expect(rows[0].product?.id).toBe('p1')
    expect(rows[0].source).toBe('bm25')
    expect(rows[0].confidence).toBeGreaterThan(0)
    expect(rows[1].product?.id).toBe('p4')
  })

  it('returns null product when no catalog entry shares any token', () => {
    const { rows } = runBm25Fallback({
      text: '1 x Widget Framistat',
      products,
    })
    expect(rows).toHaveLength(1)
    expect(rows[0].product).toBeNull()
    expect(rows[0].source).toBe('none')
  })

  it('handles an empty catalog gracefully', () => {
    const { rows } = runBm25Fallback({ text: '1 x whatever', products: [] })
    expect(rows).toHaveLength(1)
    expect(rows[0].product).toBeNull()
  })
})

describe('bm25 internals', () => {
  it('tokenizes lowercase alphanumerics and drops stopwords / short tokens', () => {
    expect(__test.tokenize('Blue Molar Extractor and the Kit')).toEqual([
      'blue',
      'molar',
      'extractor',
    ])
  })
})
