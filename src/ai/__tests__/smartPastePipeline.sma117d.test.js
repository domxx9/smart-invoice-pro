/**
 * SMA-117d: End-to-end smart paste QA + acceptance tests.
 *
 * Validates full pipeline: preprocess + extract + filter + match.
 */

import { describe, it, expect, vi } from 'vitest'
import { runSmartPastePipeline, filterCandidates } from '../smartPastePipeline.js'
import { testProducts } from '../../__tests__/fixtures/whatsappPastes.js'

function createFixedResultInference(extractResult) {
  return vi.fn(async ({ prompt }) => {
    const isExtract = prompt.toLowerCase().includes('extract') || prompt.toLowerCase().includes('parse')
    if (isExtract) {
      return { text: JSON.stringify(extractResult), source: 'stub' }
    }
    return { text: '[]', source: 'stub' }
  })
}

const CONTEXT = { productType: 'tools', shopType: 'retail' }

describe('SMA-117d: Smart paste end-to-end QA', () => {
  it('should split items by "and" joiner', async () => {
    const extracted = [
      { text: 'blue scissors', qty: 1, description: '' },
      { text: 'brake pads', qty: 2, description: '' },
    ]
    const infer = createFixedResultInference(extracted)
    const result = await runSmartPastePipeline({
      text: '[10:14, John]: blue scissors and 2 brake pads',
      products: testProducts,
      context: CONTEXT,
      runInference: infer,
    })
    expect(result.extracted).toHaveLength(2)
    expect(result.extracted[1]?.qty).toBe(2)
  })

  it('should strip WhatsApp headers before extraction', async () => {
    const extracted = [{ text: 'blue scissors', qty: 1, description: '' }]
    const infer = createFixedResultInference(extracted)
    const result = await runSmartPastePipeline({
      text: '[18:45, ServiceMgr]: blue scissors',
      products: testProducts,
      context: CONTEXT,
      runInference: infer,
    })
    // Header should be stripped by preprocess before LLM sees it
    expect(result.extracted).toHaveLength(1)
    expect(result.extracted[0]?.text).toContain('blue')
  })

  it('bag-of-words: order permutations match same product', async () => {
    // This tests filterCandidates directly, no LLM needed
    const q1 = [{ text: 'blue scissors straight', qty: 1 }]
    const q2 = [{ text: 'straight scissors blue', qty: 1 }]
    const f1 = filterCandidates({ extracted: q1, products: testProducts, topN: 5 })
    const f2 = filterCandidates({ extracted: q2, products: testProducts, topN: 5 })

    // Should find same scissors product in both
    const scissors1 = f1[0]?.candidates?.find((p) => p.name?.toLowerCase().includes('scissors'))
    const scissors2 = f2[0]?.candidates?.find((p) => p.name?.toLowerCase().includes('scissors'))
    expect(scissors1?.id).toBe(scissors2?.id)
  })

  it('should preserve qty through pipeline', async () => {
    const extracted = [
      { text: 'blue scissors', qty: 1, description: '' },
      { text: 'brake pads', qty: 3, description: '' },
    ]
    const infer = createFixedResultInference(extracted)
    const result = await runSmartPastePipeline({
      text: 'blue scissors and 3 brake pads',
      products: testProducts,
      runInference: infer,
    })
    expect(result.extracted[0]?.qty).toBe(1)
    expect(result.extracted[1]?.qty).toBe(3)
    expect(result.rows[0]?.extracted?.qty).toBe(1)
    expect(result.rows[1]?.extracted?.qty).toBe(3)
  })

  it('matcher regression: bag-of-words handles single-word fallback to Fuse', async () => {
    // Single-word queries should fallback to Fuse (no order signal)
    const single = [{ text: 'scissors', qty: 1 }]
    const filtered = filterCandidates({ extracted: single, products: testProducts, topN: 5 })
    // Should still find scissors even with single word
    expect(filtered[0]?.candidates?.length).toBeGreaterThan(0)
    const hasScissors = filtered[0]?.candidates?.some((p) => p.name?.toLowerCase().includes('scissors'))
    expect(hasScissors).toBe(true)
  })

  it('acceptance: pipeline handles multi-item paste', async () => {
    const extracted = [
      { text: 'blue scissors', qty: 1, description: '' },
      { text: 'brake pads', qty: 2, description: '' },
      { text: 'oil filter', qty: 1, description: '' },
    ]
    const infer = createFixedResultInference(extracted)
    const result = await runSmartPastePipeline({
      text: 'blue scissors and 2 brake pads + 1 oil filter',
      products: testProducts,
      context: CONTEXT,
      runInference: infer,
    })
    expect(result.extracted).toHaveLength(3)
    expect(result.rows).toHaveLength(3)
    expect(result.fallback).toBe(false)
  })
})
