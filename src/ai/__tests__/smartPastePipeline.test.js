/**
 * Smart Paste pipeline tests (SMA-58 / SMA-56 Stages 1-3).
 *
 * The pipeline takes `runInference` as a dependency, so each test feeds it a
 * stub that returns either canned JSON for the extract call or canned JSON
 * for each match batch. We exercise the public surface only — the prompt
 * builders are validated indirectly through the prompt strings the stub sees.
 */

import { describe, it, expect, vi } from 'vitest'

import {
  extractLineItems,
  filterCandidates,
  matchBatch,
  runSmartPastePipeline,
  safeParseJsonArray,
} from '../smartPastePipeline.js'

const CONTEXT = {
  productType: 'auto parts',
  shopType: 'brick and mortar',
  customerType: 'mechanics',
  vocabulary: 'EOM = end of month, Bilstein 5100',
  locale: 'US English',
}

const PRODUCTS = [
  { id: 'p1', name: 'Bilstein 5100 Front Shock' },
  { id: 'p2', name: 'Bilstein 5100 Rear Shock' },
  { id: 'p3', name: 'Brake Pad Set Front' },
  { id: 'p4', name: 'Brake Pad Set Rear' },
  { id: 'p5', name: 'Oil Filter Standard' },
  { id: 'p6', name: 'Air Filter Premium' },
  { id: 'p7', name: 'Spark Plug NGK' },
  { id: 'p8', name: 'Wiper Blade 22"' },
]

function jsonResponse(payload) {
  return { text: JSON.stringify(payload), source: 'test' }
}

describe('safeParseJsonArray', () => {
  it('parses bare arrays', () => {
    expect(safeParseJsonArray('[{"a":1}]')).toEqual({ ok: true, value: [{ a: 1 }] })
  })

  it('strips markdown code fences', () => {
    expect(safeParseJsonArray('```json\n[1,2,3]\n```')).toEqual({ ok: true, value: [1, 2, 3] })
  })

  it('extracts the first array even with surrounding prose', () => {
    expect(safeParseJsonArray('Sure! [42] hope that helps')).toEqual({ ok: true, value: [42] })
  })

  it('reports failure on empty input', () => {
    const r = safeParseJsonArray('   ')
    expect(r.ok).toBe(false)
  })

  it('reports failure when no array can be found', () => {
    const r = safeParseJsonArray('not json at all')
    expect(r.ok).toBe(false)
  })

  it('reports failure when JSON is malformed', () => {
    const r = safeParseJsonArray('[1, 2,')
    expect(r.ok).toBe(false)
  })

  it('runs the optional schema validator on each element', () => {
    const r = safeParseJsonArray('[{"x":1},{"x":"bad"}]', {
      schema: (item) => (typeof item.x === 'number' ? true : 'x must be number'),
    })
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/x must be number/)
  })
})

describe('extractLineItems', () => {
  it('returns the parsed items on a clean response and clamps qty to >=1', async () => {
    const runInference = vi.fn().mockResolvedValue(
      jsonResponse([
        { text: '5100 fronts', qty: 2, description: 'lifted Tacoma' },
        { text: 'oil filter', qty: 0, description: '' },
      ]),
    )
    const out = await extractLineItems({
      text: 'need 2x 5100 fronts for a lifted Tacoma and an oil filter',
      context: CONTEXT,
      runInference,
    })
    expect(runInference).toHaveBeenCalledTimes(1)
    expect(out).toEqual([
      { text: '5100 fronts', qty: 2, description: 'lifted Tacoma' },
      { text: 'oil filter', qty: 1, description: '' },
    ])
  })

  it('returns [] (fallback signal) when the model returns non-JSON', async () => {
    const runInference = vi.fn().mockResolvedValue({ text: 'no idea, sorry', source: 'test' })
    const out = await extractLineItems({
      text: 'nonsense',
      context: CONTEXT,
      runInference,
    })
    expect(out).toEqual([])
  })

  it('returns [] when runInference throws (network error etc.)', async () => {
    const runInference = vi.fn().mockRejectedValue(new Error('boom'))
    const out = await extractLineItems({ text: 'hi', runInference })
    expect(out).toEqual([])
  })

  it('returns [] for empty input without calling the model', async () => {
    const runInference = vi.fn()
    const out = await extractLineItems({ text: '   ', runInference })
    expect(out).toEqual([])
    expect(runInference).not.toHaveBeenCalled()
  })

  it('passes a prompt that includes the business context labels', async () => {
    const runInference = vi.fn().mockResolvedValue(jsonResponse([]))
    await extractLineItems({ text: 'hi', context: CONTEXT, runInference })
    const sent = runInference.mock.calls[0][0].prompt
    expect(sent).toMatch(/Product type: auto parts/)
    expect(sent).toMatch(/Shop type: brick and mortar/)
    expect(sent).toMatch(/Customer type: mechanics/)
    expect(sent).toMatch(/Vocabulary: EOM/)
    expect(sent).toMatch(/Locale: US English/)
  })
})

describe('filterCandidates', () => {
  it('returns one entry per extracted line', () => {
    const extracted = [
      { text: 'front shock', qty: 1, description: '' },
      { text: 'oil filter', qty: 1, description: '' },
    ]
    const out = filterCandidates({ extracted, products: PRODUCTS, topN: 3 })
    expect(out).toHaveLength(2)
    expect(out[0].extracted.text).toBe('front shock')
  })

  it('caps each line at topN candidates', () => {
    const extracted = [{ text: 'brake', qty: 1, description: '' }]
    const out = filterCandidates({ extracted, products: PRODUCTS, topN: 1 })
    expect(out[0].candidates.length).toBeLessThanOrEqual(1)
  })

  it('returns empty candidates when products is empty', () => {
    const out = filterCandidates({
      extracted: [{ text: 'whatever', qty: 1, description: '' }],
      products: [],
    })
    expect(out[0].candidates).toEqual([])
  })
})

describe('matchBatch', () => {
  it('parses the model response and returns the match objects', async () => {
    const runInference = vi.fn().mockResolvedValue(
      jsonResponse([
        { lineIndex: 0, productId: 'p1', confidence: 92 },
        { lineIndex: 1, productId: null, confidence: 0 },
      ]),
    )
    const batch = [
      {
        extracted: { text: 'front shock', qty: 1, description: '' },
        candidates: PRODUCTS.slice(0, 2),
      },
      { extracted: { text: 'mystery', qty: 1, description: '' }, candidates: [] },
    ]
    const out = await matchBatch({ batch, context: CONTEXT, runInference })
    expect(out).toEqual([
      { lineIndex: 0, productId: 'p1', confidence: 92 },
      { lineIndex: 1, productId: null, confidence: 0 },
    ])
  })

  it('throws on malformed JSON so the orchestrator can mark the batch failed', async () => {
    const runInference = vi.fn().mockResolvedValue({ text: 'I cannot do this', source: 'test' })
    await expect(
      matchBatch({
        batch: [{ extracted: { text: 'x', qty: 1, description: '' }, candidates: [] }],
        runInference,
      }),
    ).rejects.toThrow(/matchBatch/)
  })

  it('returns [] for an empty batch without calling the model', async () => {
    const runInference = vi.fn()
    const out = await matchBatch({ batch: [], runInference })
    expect(out).toEqual([])
    expect(runInference).not.toHaveBeenCalled()
  })
})

describe('runSmartPastePipeline', () => {
  function buildRunInference({ extract, matchBatches }) {
    let matchCall = 0
    return vi.fn(async ({ prompt }) => {
      if (prompt.startsWith('Business context:') && prompt.includes('Customer message:')) {
        return jsonResponse(extract)
      }
      if (prompt.includes('Customer message:')) {
        return jsonResponse(extract)
      }
      const batch = matchBatches[matchCall++]
      if (typeof batch === 'function') return batch()
      return jsonResponse(batch)
    })
  }

  it('5-line paste produces ceil(5/2)=3 batches and 4 total calls', async () => {
    const extract = [
      { text: '5100 front', qty: 1, description: '' },
      { text: '5100 rear', qty: 1, description: '' },
      { text: 'brake front', qty: 2, description: '' },
      { text: 'oil filter', qty: 5, description: '' },
      { text: 'spark plug', qty: 8, description: '' },
    ]
    const matchBatches = [
      [
        { lineIndex: 0, productId: 'p1', confidence: 95 },
        { lineIndex: 1, productId: 'p2', confidence: 95 },
      ],
      [
        { lineIndex: 0, productId: 'p3', confidence: 88 },
        { lineIndex: 1, productId: 'p5', confidence: 90 },
      ],
      [{ lineIndex: 0, productId: 'p7', confidence: 80 }],
    ]
    const onStage = vi.fn()
    const runInference = buildRunInference({ extract, matchBatches })

    const result = await runSmartPastePipeline({
      text: 'big order',
      products: PRODUCTS,
      context: CONTEXT,
      runInference,
      onStage,
    })

    expect(result.fallback).toBe(false)
    expect(result.callCount).toBe(4)
    expect(result.rows).toHaveLength(5)
    expect(result.rows[0].product?.id).toBe('p1')
    expect(result.rows[3].product?.id).toBe('p5')
    expect(result.rows[4].product?.id).toBe('p7')
    const matchEvents = onStage.mock.calls.filter(([e]) => e.stage === 'match' && !e.error)
    expect(matchEvents).toHaveLength(3)
    expect(matchEvents[0][0]).toMatchObject({ batchIndex: 0, totalBatches: 3 })
  })

  it('falls back when extract returns non-JSON', async () => {
    const runInference = vi.fn().mockResolvedValue({ text: 'sorry no', source: 'test' })
    const result = await runSmartPastePipeline({
      text: 'whatever',
      products: PRODUCTS,
      context: CONTEXT,
      runInference,
    })
    expect(result).toEqual({ extracted: [], rows: [], callCount: 1, fallback: true })
  })

  it('continues when one match batch throws — fallback stays false, failed rows keep source=fuzzy', async () => {
    const extract = [
      { text: 'front shock', qty: 1, description: '' },
      { text: 'rear shock', qty: 1, description: '' },
      { text: 'brake front', qty: 1, description: '' },
    ]
    const onStage = vi.fn()
    let call = 0
    const runInference = vi.fn(async ({ prompt }) => {
      if (prompt.includes('Customer message:')) return jsonResponse(extract)
      call += 1
      if (call === 1) throw new Error('rate limit')
      return jsonResponse([{ lineIndex: 0, productId: 'p3', confidence: 75 }])
    })

    const result = await runSmartPastePipeline({
      text: 'order',
      products: PRODUCTS,
      context: CONTEXT,
      runInference,
      onStage,
    })

    expect(result.fallback).toBe(false)
    expect(result.callCount).toBe(3)
    expect(result.rows[0].source).toBe('fuzzy')
    expect(result.rows[1].source).toBe('fuzzy')
    expect(result.rows[2].source).toBe('ai')
    expect(result.rows[2].product?.id).toBe('p3')
    const errorEvents = onStage.mock.calls.filter(([e]) => e.stage === 'match' && e.error)
    expect(errorEvents).toHaveLength(1)
    expect(errorEvents[0][0].batchIndex).toBe(0)
  })

  it('builds prompts and runs cleanly when context is entirely blank', async () => {
    const blankContext = {
      productType: '',
      shopType: '',
      customerType: '',
      vocabulary: '',
      locale: '',
    }
    const extract = [{ text: 'front shock', qty: 1, description: '' }]
    let sawExtractPrompt = ''
    const runInference = vi.fn(async ({ prompt }) => {
      if (prompt.includes('Customer message:')) {
        sawExtractPrompt = prompt
        return jsonResponse(extract)
      }
      return jsonResponse([{ lineIndex: 0, productId: 'p1', confidence: 90 }])
    })

    const result = await runSmartPastePipeline({
      text: 'need a front shock',
      products: PRODUCTS,
      context: blankContext,
      runInference,
    })

    expect(result.fallback).toBe(false)
    expect(result.rows[0].product?.id).toBe('p1')
    expect(sawExtractPrompt).not.toMatch(/Business context:/)
  })

  it('marks unknown productId from the model as source=none', async () => {
    const extract = [{ text: 'spark plug', qty: 1, description: '' }]
    const runInference = vi.fn(async ({ prompt }) => {
      if (prompt.includes('Customer message:')) return jsonResponse(extract)
      return jsonResponse([{ lineIndex: 0, productId: 'made-up-id', confidence: 50 }])
    })
    const result = await runSmartPastePipeline({
      text: 'spark plug',
      products: PRODUCTS,
      context: CONTEXT,
      runInference,
    })
    expect(result.rows[0].product).toBe(null)
    expect(result.rows[0].source).toBe('none')
    expect(result.rows[0].confidence).toBe(50)
  })

  it('throws if runInference is missing', async () => {
    await expect(runSmartPastePipeline({ text: 'x', products: PRODUCTS })).rejects.toThrow(
      /runInference/,
    )
  })
})
