/**
 * Direct unit tests for runByokCatalogSearch (SMA-123 / SMA-185).
 *
 * runInference is injected so tests never hit the network. getCorrectionMap
 * is mocked so correction-injection assertions stay deterministic.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { runByokCatalogSearch, BYOK_CATALOG_CHUNK_SIZE } from '../byokSearch.js'

vi.mock('../../services/correctionStore.js', () => ({
  getCorrectionMap: vi.fn(() => new Map()),
}))

vi.mock('../../utils/logger.js', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), debug: vi.fn(), error: vi.fn() },
}))

import { getCorrectionMap } from '../../services/correctionStore.js'

const PRODUCTS = [
  { id: 'p1', name: 'Bilstein 5100 Front Shock', sku: 'B5100F', price: 89.99 },
  { id: 'p2', name: 'Bilstein 5100 Rear Shock', sku: 'B5100R', price: 79.99 },
  { id: 'p3', name: 'Brake Pad Set Front', sku: 'BPF', price: 35.0 },
]

function extractResponse(items) {
  return { text: JSON.stringify(items), source: 'test' }
}

function matchResponse(productId, confidence) {
  return { text: JSON.stringify([{ productId, confidence }]), source: 'test' }
}

describe('BYOK_CATALOG_CHUNK_SIZE', () => {
  it('is 200', () => {
    expect(BYOK_CATALOG_CHUNK_SIZE).toBe(200)
  })
})

describe('runByokCatalogSearch input validation', () => {
  it('throws when runInference is not a function', async () => {
    await expect(
      runByokCatalogSearch({ text: 'test', products: PRODUCTS, runInference: null }),
    ).rejects.toThrow('runInference is required')
  })

  it('throws when runInference is omitted entirely', async () => {
    await expect(runByokCatalogSearch({ text: 'test', products: PRODUCTS })).rejects.toThrow(
      'runInference is required',
    )
  })
})

describe('runByokCatalogSearch — fallback paths', () => {
  it('returns fallback when Stage 1 extracts no items', async () => {
    const runInference = vi.fn().mockResolvedValue(extractResponse([]))
    const result = await runByokCatalogSearch({
      text: 'nonsense text that extracts nothing',
      products: PRODUCTS,
      runInference,
    })
    expect(result.fallback).toBe(true)
    expect(result.mode).toBe('byok')
    expect(result.rows).toEqual([])
    expect(result.extracted).toEqual([])
  })

  it('returns fallback with fallbackReason when Stage 1 times out', async () => {
    const timeoutErr = Object.assign(new Error('On-device inference exceeded 60000ms — aborted'), {
      code: 'stage1_timeout',
      timeoutMs: 60000,
    })
    const runInference = vi.fn().mockRejectedValue(timeoutErr)
    const result = await runByokCatalogSearch({
      text: 'any text',
      products: PRODUCTS,
      runInference,
    })
    expect(result.fallback).toBe(true)
    expect(result.fallbackReason).toBe('stage1_timeout')
    expect(result.mode).toBe('byok')
  })

  it('returns fallback with no fallbackReason when extraction simply yields []', async () => {
    const runInference = vi.fn().mockResolvedValueOnce(extractResponse([]))
    const result = await runByokCatalogSearch({
      text: 'nothing useful',
      products: PRODUCTS,
      runInference,
    })
    expect(result.fallback).toBe(true)
    expect(result.fallbackReason).toBeUndefined()
  })

  it('treats a non-array products arg as an empty catalog', async () => {
    const runInference = vi
      .fn()
      .mockResolvedValueOnce(extractResponse([{ text: 'front shock', qty: 1, description: '' }]))
      .mockResolvedValueOnce(matchResponse(null, 0))
    const result = await runByokCatalogSearch({
      text: 'front shock',
      products: undefined,
      runInference,
    })
    expect(result.fallback).toBeUndefined()
    expect(result.rows[0].product).toBeNull()
    expect(result.rows[0].source).toBe('none')
  })
})

describe('runByokCatalogSearch — happy path', () => {
  beforeEach(() => {
    getCorrectionMap.mockReturnValue(new Map())
  })

  it('returns mode=byok with extracted + rows for a matched item', async () => {
    const runInference = vi
      .fn()
      .mockResolvedValueOnce(
        extractResponse([{ text: 'front shock', qty: 2, description: 'lifted Tacoma' }]),
      )
      .mockResolvedValueOnce(matchResponse('p1', 88))

    const result = await runByokCatalogSearch({
      text: '2 front shocks for a lifted Tacoma',
      products: PRODUCTS,
      runInference,
    })

    expect(result.mode).toBe('byok')
    expect(result.fallback).toBeUndefined()
    expect(result.extracted).toHaveLength(1)
    expect(result.rows).toHaveLength(1)
    const row = result.rows[0]
    expect(row.product?.id).toBe('p1')
    expect(row.confidence).toBe(88)
    expect(row.source).toBe('ai')
  })

  it('emits onStage events: extract then match per line', async () => {
    const runInference = vi
      .fn()
      .mockResolvedValueOnce(
        extractResponse([
          { text: 'front shock', qty: 1, description: '' },
          { text: 'brake pads', qty: 1, description: '' },
        ]),
      )
      .mockResolvedValueOnce(matchResponse('p1', 90))
      .mockResolvedValueOnce(matchResponse('p3', 75))

    const stages = []
    await runByokCatalogSearch({
      text: 'front shock and brake pads',
      products: PRODUCTS,
      runInference,
      onStage: (e) => stages.push(e),
    })

    expect(stages[0]).toEqual({ stage: 'extract' })
    expect(stages[1]).toEqual({ stage: 'match', batchIndex: 0, totalBatches: 2 })
    expect(stages[2]).toEqual({ stage: 'match', batchIndex: 1, totalBatches: 2 })
  })

  it('handles multiple extracted items and returns one row per item', async () => {
    const runInference = vi
      .fn()
      .mockResolvedValueOnce(
        extractResponse([
          { text: 'front shock', qty: 2, description: '' },
          { text: 'rear shock', qty: 2, description: '' },
          { text: 'brake pads', qty: 1, description: 'front' },
        ]),
      )
      .mockResolvedValueOnce(matchResponse('p1', 90))
      .mockResolvedValueOnce(matchResponse('p2', 85))
      .mockResolvedValueOnce(matchResponse('p3', 70))

    const result = await runByokCatalogSearch({
      text: '2 front shocks, 2 rear shocks, brake pads front',
      products: PRODUCTS,
      runInference,
    })

    expect(result.rows).toHaveLength(3)
    expect(result.rows[0].product?.id).toBe('p1')
    expect(result.rows[1].product?.id).toBe('p2')
    expect(result.rows[2].product?.id).toBe('p3')
  })

  it('sets source=none when LLM returns productId=null', async () => {
    const runInference = vi
      .fn()
      .mockResolvedValueOnce(extractResponse([{ text: 'mystery item', qty: 1, description: '' }]))
      .mockResolvedValueOnce(matchResponse(null, 0))

    const result = await runByokCatalogSearch({
      text: 'mystery item',
      products: PRODUCTS,
      runInference,
    })

    const row = result.rows[0]
    expect(row.product).toBeNull()
    expect(row.source).toBe('none')
    expect(row.confidence).toBe(0)
  })

  it('clamps confidence to [0, 100]', async () => {
    const runInference = vi
      .fn()
      .mockResolvedValueOnce(extractResponse([{ text: 'front shock', qty: 1, description: '' }]))
      .mockResolvedValueOnce({ text: JSON.stringify([{ productId: 'p1', confidence: 150 }]) })

    const result = await runByokCatalogSearch({
      text: 'front shock',
      products: PRODUCTS,
      runInference,
    })

    expect(result.rows[0].confidence).toBe(100)
  })

  it('rounds fractional confidence to nearest integer', async () => {
    const runInference = vi
      .fn()
      .mockResolvedValueOnce(extractResponse([{ text: 'front shock', qty: 1, description: '' }]))
      .mockResolvedValueOnce({ text: JSON.stringify([{ productId: 'p1', confidence: 87.6 }]) })

    const result = await runByokCatalogSearch({
      text: 'front shock',
      products: PRODUCTS,
      runInference,
    })

    expect(result.rows[0].confidence).toBe(88)
  })
})

describe('runByokCatalogSearch — catalog chunking', () => {
  beforeEach(() => {
    getCorrectionMap.mockReturnValue(new Map())
  })

  it('makes one match call per chunk when catalog exceeds chunkSize', async () => {
    const bigCatalog = Array.from({ length: 5 }, (_, i) => ({
      id: `p${i}`,
      name: `Product ${i}`,
      sku: `SKU${i}`,
      price: 10,
    }))

    const runInference = vi
      .fn()
      .mockResolvedValueOnce(extractResponse([{ text: 'item', qty: 1, description: '' }]))
      .mockResolvedValueOnce(matchResponse('p2', 60))
      .mockResolvedValueOnce(matchResponse('p4', 80))

    const result = await runByokCatalogSearch({
      text: 'item',
      products: bigCatalog,
      runInference,
      chunkSize: 3,
    })

    // 5 products / 3 per chunk = 2 chunks + 1 extract call = 3 total
    expect(runInference).toHaveBeenCalledTimes(3)
    // Best confidence (80) wins across chunks
    expect(result.rows[0].product?.id).toBe('p4')
    expect(result.rows[0].confidence).toBe(80)
  })

  it('uses the highest-confidence result across all chunks', async () => {
    const catalog = Array.from({ length: 4 }, (_, i) => ({
      id: `p${i}`,
      name: `P${i}`,
      sku: `S${i}`,
      price: 1,
    }))

    const runInference = vi
      .fn()
      .mockResolvedValueOnce(extractResponse([{ text: 'x', qty: 1, description: '' }]))
      .mockResolvedValueOnce(matchResponse('p0', 30))
      .mockResolvedValueOnce(matchResponse('p2', 95))

    const result = await runByokCatalogSearch({
      text: 'x',
      products: catalog,
      runInference,
      chunkSize: 2,
    })

    expect(result.rows[0].product?.id).toBe('p2')
    expect(result.rows[0].confidence).toBe(95)
  })

  it('honors a chunkSize of 1 (one product per call)', async () => {
    const catalog = [
      { id: 'a', name: 'Alpha', sku: 'A', price: 1 },
      { id: 'b', name: 'Beta', sku: 'B', price: 2 },
    ]

    const runInference = vi
      .fn()
      .mockResolvedValueOnce(extractResponse([{ text: 'alpha', qty: 1, description: '' }]))
      .mockResolvedValueOnce(matchResponse('a', 85))
      .mockResolvedValueOnce(matchResponse(null, 0))

    const result = await runByokCatalogSearch({
      text: 'alpha',
      products: catalog,
      runInference,
      chunkSize: 1,
    })

    expect(runInference).toHaveBeenCalledTimes(3) // 1 extract + 2 chunks
    expect(result.rows[0].product?.id).toBe('a')
  })

  it('sends whole catalog as one chunk when chunkSize >= catalog length', async () => {
    const runInference = vi
      .fn()
      .mockResolvedValueOnce(extractResponse([{ text: 'brake pads', qty: 1, description: '' }]))
      .mockResolvedValueOnce(matchResponse('p3', 78))

    await runByokCatalogSearch({
      text: 'brake pads',
      products: PRODUCTS,
      runInference,
      chunkSize: 1000,
    })

    expect(runInference).toHaveBeenCalledTimes(2)
  })

  it('treats chunkSize <= 0 as whole-catalog single chunk', async () => {
    const runInference = vi
      .fn()
      .mockResolvedValueOnce(extractResponse([{ text: 'brake pads', qty: 1, description: '' }]))
      .mockResolvedValueOnce(matchResponse('p3', 72))

    await runByokCatalogSearch({
      text: 'brake pads',
      products: PRODUCTS,
      runInference,
      chunkSize: 0,
    })

    expect(runInference).toHaveBeenCalledTimes(2)
  })
})

describe('runByokCatalogSearch — error resilience', () => {
  beforeEach(() => {
    getCorrectionMap.mockReturnValue(new Map())
  })

  it('skips a failed chunk and continues to the next', async () => {
    const catalog = [
      { id: 'a', name: 'Alpha', sku: 'A', price: 1 },
      { id: 'b', name: 'Beta', sku: 'B', price: 2 },
    ]

    const runInference = vi
      .fn()
      .mockResolvedValueOnce(extractResponse([{ text: 'beta', qty: 1, description: '' }]))
      .mockRejectedValueOnce(new Error('network failure on chunk 0'))
      .mockResolvedValueOnce(matchResponse('b', 88))

    const result = await runByokCatalogSearch({
      text: 'beta',
      products: catalog,
      runInference,
      chunkSize: 1,
    })

    // Chunk 0 failed, chunk 1 succeeded — product from chunk 1 wins
    expect(result.rows[0].product?.id).toBe('b')
    expect(result.rows[0].confidence).toBe(88)
  })

  it('returns null product with confidence 0 when ALL chunks fail', async () => {
    const runInference = vi
      .fn()
      .mockResolvedValueOnce(extractResponse([{ text: 'item', qty: 1, description: '' }]))
      .mockRejectedValue(new Error('all chunks broken'))

    const result = await runByokCatalogSearch({
      text: 'item',
      products: PRODUCTS,
      runInference,
    })

    const row = result.rows[0]
    expect(row.product).toBeNull()
    expect(row.confidence).toBe(0)
    expect(row.source).toBe('none')
  })

  it('skips unparseable LLM response for a chunk and tries next', async () => {
    const catalog = [
      { id: 'a', name: 'Alpha', sku: 'A', price: 1 },
      { id: 'b', name: 'Beta', sku: 'B', price: 2 },
    ]

    const runInference = vi
      .fn()
      .mockResolvedValueOnce(extractResponse([{ text: 'beta', qty: 1, description: '' }]))
      .mockResolvedValueOnce({ text: 'not json at all' })
      .mockResolvedValueOnce(matchResponse('b', 91))

    const result = await runByokCatalogSearch({
      text: 'beta',
      products: catalog,
      runInference,
      chunkSize: 1,
    })

    expect(result.rows[0].product?.id).toBe('b')
  })

  it('handles a string result from runInference (not an object)', async () => {
    const runInference = vi
      .fn()
      .mockResolvedValueOnce(extractResponse([{ text: 'front shock', qty: 1, description: '' }]))
      .mockResolvedValueOnce(JSON.stringify([{ productId: 'p1', confidence: 77 }]))

    const result = await runByokCatalogSearch({
      text: 'front shock',
      products: PRODUCTS,
      runInference,
    })

    expect(result.rows[0].product?.id).toBe('p1')
    expect(result.rows[0].confidence).toBe(77)
  })
})

describe('runByokCatalogSearch — correction map injection', () => {
  it('includes corrections block in match prompt when corrections exist', async () => {
    getCorrectionMap.mockReturnValue(
      new Map([
        ['front shock', { productId: 'p1', productName: 'Bilstein 5100 Front Shock', count: 3 }],
      ]),
    )

    const capturedPrompts = []
    const runInference = vi.fn().mockImplementation(async ({ prompt }) => {
      capturedPrompts.push(prompt)
      if (capturedPrompts.length === 1) {
        return extractResponse([{ text: 'front shock', qty: 1, description: '' }])
      }
      return matchResponse('p1', 92)
    })

    await runByokCatalogSearch({
      text: 'front shock',
      products: PRODUCTS,
      runInference,
    })

    // The match prompt (second call) should contain the corrections block
    const matchPrompt = capturedPrompts[1]
    expect(matchPrompt).toContain('Known product corrections')
    expect(matchPrompt).toContain('front shock')
    expect(matchPrompt).toContain('p1')
  })

  it('omits corrections block when correction map is empty', async () => {
    getCorrectionMap.mockReturnValue(new Map())

    const capturedPrompts = []
    const runInference = vi.fn().mockImplementation(async ({ prompt }) => {
      capturedPrompts.push(prompt)
      if (capturedPrompts.length === 1) {
        return extractResponse([{ text: 'brake pads', qty: 1, description: '' }])
      }
      return matchResponse('p3', 70)
    })

    await runByokCatalogSearch({
      text: 'brake pads',
      products: PRODUCTS,
      runInference,
    })

    const matchPrompt = capturedPrompts[1]
    expect(matchPrompt).not.toContain('Known product corrections')
  })

  it('caps corrections at 20 in match prompt even when more exist', async () => {
    const bigMap = new Map(
      Array.from({ length: 25 }, (_, i) => [
        `term ${i}`,
        { productId: `p${i}`, productName: `Product ${i}`, count: i },
      ]),
    )
    getCorrectionMap.mockReturnValue(bigMap)

    const capturedPrompts = []
    const runInference = vi.fn().mockImplementation(async ({ prompt }) => {
      capturedPrompts.push(prompt)
      if (capturedPrompts.length === 1) {
        return extractResponse([{ text: 'term 0', qty: 1, description: '' }])
      }
      return matchResponse('p0', 80)
    })

    await runByokCatalogSearch({
      text: 'term 0',
      products: PRODUCTS,
      runInference,
    })

    const matchPrompt = capturedPrompts[1]
    // Count how many correction entries appear (each starts with `- "term`)
    const correctionLines = matchPrompt.split('\n').filter((l) => l.startsWith('- "term '))
    expect(correctionLines.length).toBe(20)
  })

  it('sorts corrections by count descending in match prompt', async () => {
    getCorrectionMap.mockReturnValue(
      new Map([
        ['low count term', { productId: 'pL', productName: 'Low', count: 1 }],
        ['high count term', { productId: 'pH', productName: 'High', count: 10 }],
      ]),
    )

    const capturedPrompts = []
    const runInference = vi.fn().mockImplementation(async ({ prompt }) => {
      capturedPrompts.push(prompt)
      if (capturedPrompts.length === 1) {
        return extractResponse([{ text: 'x', qty: 1, description: '' }])
      }
      return matchResponse(null, 0)
    })

    await runByokCatalogSearch({ text: 'x', products: PRODUCTS, runInference })

    const matchPrompt = capturedPrompts[1]
    const highIdx = matchPrompt.indexOf('high count term')
    const lowIdx = matchPrompt.indexOf('low count term')
    expect(highIdx).toBeLessThan(lowIdx)
  })
})

describe('runByokCatalogSearch — context forwarding', () => {
  beforeEach(() => {
    getCorrectionMap.mockReturnValue(new Map())
  })

  it('passes context to runInference in the match prompt', async () => {
    const context = { productType: 'auto parts', shopType: 'retail', customerType: 'mechanics' }
    const capturedPrompts = []

    const runInference = vi.fn().mockImplementation(async ({ prompt }) => {
      capturedPrompts.push(prompt)
      if (capturedPrompts.length === 1) {
        return extractResponse([{ text: 'front shock', qty: 1, description: '' }])
      }
      return matchResponse('p1', 85)
    })

    await runByokCatalogSearch({
      text: 'front shock',
      products: PRODUCTS,
      context,
      runInference,
    })

    const matchPrompt = capturedPrompts[1]
    expect(matchPrompt).toContain('auto parts')
  })

  it('works without context (context omitted)', async () => {
    const runInference = vi
      .fn()
      .mockResolvedValueOnce(extractResponse([{ text: 'rear shock', qty: 1, description: '' }]))
      .mockResolvedValueOnce(matchResponse('p2', 82))

    const result = await runByokCatalogSearch({
      text: 'rear shock',
      products: PRODUCTS,
      runInference,
    })

    expect(result.rows[0].product?.id).toBe('p2')
  })
})
