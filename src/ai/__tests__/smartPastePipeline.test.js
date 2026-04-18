/**
 * Smart Paste pipeline tests (SMA-58 / SMA-56 Stages 1-3).
 *
 * The pipeline takes `runInference` as a dependency, so each test feeds it a
 * stub that returns either canned JSON for the extract call or canned JSON
 * for each match batch. We exercise the public surface only — the prompt
 * builders are validated indirectly through the prompt strings the stub sees.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

import {
  extractLineItems,
  filterCandidates,
  matchBatch,
  runSmartPastePipeline,
  safeParseJsonArray,
} from '../smartPastePipeline.js'
import { logger } from '../../utils/logger.js'

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

  // ── SMA-71: truncation salvage folded into safeParseJsonArray ──

  it('salvages a truncated array missing its closing ] and marks salvaged=true (SMA-71)', () => {
    // Mirrors the real dogfood trace — array opens, two complete items, then
    // cuts off mid-third with no closing `]`. Salvage should recover items 1-2.
    const truncated =
      '[{"text":"blade holder","qty":1,"description":""},{"text":"anvil","qty":2,"description":"longs ones"},{"text":"unc probe","qty":1,"description":"'
    const extractSchema = (item) =>
      item &&
      typeof item.text === 'string' &&
      typeof item.qty === 'number' &&
      typeof item.description === 'string'
        ? true
        : 'bad shape'
    const r = safeParseJsonArray(truncated, { schema: extractSchema })
    expect(r.ok).toBe(true)
    expect(r.salvaged).toBe(true)
    expect(r.value).toEqual([
      { text: 'blade holder', qty: 1, description: '' },
      { text: 'anvil', qty: 2, description: 'longs ones' },
    ])
    expect(r.salvagedCount).toBe(2)
    expect(r.attemptedCount).toBe(2)
  })

  it('does not mark salvaged when the clean parse succeeds (SMA-71)', () => {
    const r = safeParseJsonArray('[{"a":1}]')
    expect(r.ok).toBe(true)
    expect(r.salvaged).toBeUndefined()
  })

  it('trims back past a truncated final string, returning N-1 items (SMA-71)', () => {
    // Only one complete object closes; the partial second object must be
    // dropped so the candidate re-parses cleanly.
    const truncated = '[{"text":"first","qty":1,"description":""},{"text":"partia'
    const r = safeParseJsonArray(truncated)
    expect(r.ok).toBe(true)
    expect(r.salvaged).toBe(true)
    expect(r.value).toHaveLength(1)
    expect(r.value[0]).toMatchObject({ text: 'first', qty: 1 })
  })

  it('falls back to failure when no complete object has closed (SMA-71)', () => {
    const r = safeParseJsonArray('[{"text":"only started')
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/no complete object|no JSON array/)
  })

  it('is not fooled by a `}` inside a string literal (SMA-71)', () => {
    // Without string-awareness the inner `}` inside the description would
    // close the outer object prematurely, producing garbled items. With
    // string-awareness, only the real closing brace counts.
    const truncated =
      '[{"text":"widget","qty":1,"description":"weird } inside"},{"text":"next","qty":2,"description":"'
    const r = safeParseJsonArray(truncated)
    expect(r.ok).toBe(true)
    expect(r.salvaged).toBe(true)
    expect(r.value).toEqual([{ text: 'widget', qty: 1, description: 'weird } inside' }])
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
    expect(out.items).toEqual([
      { text: '5100 fronts', qty: 2, description: 'lifted Tacoma' },
      { text: 'oil filter', qty: 1, description: '' },
    ])
    expect(out.callCount).toBe(1)
  })

  it('returns items when response has a prose preamble wrapping the JSON array', async () => {
    const runInference = vi.fn().mockResolvedValue({
      text: 'Sure! Here you go:\n[{"text":"front shock","qty":1,"description":""}]',
      source: 'test',
    })
    const out = await extractLineItems({ text: 'front shock', runInference })
    expect(runInference).toHaveBeenCalledTimes(1)
    expect(out.items).toEqual([{ text: 'front shock', qty: 1, description: '' }])
    expect(out.callCount).toBe(1)
  })

  it('returns items when response is wrapped in a ```json code fence', async () => {
    const runInference = vi.fn().mockResolvedValue({
      text: '```json\n[{"text":"oil filter","qty":3,"description":""}]\n```',
      source: 'test',
    })
    const out = await extractLineItems({ text: 'three oil filters', runInference })
    expect(runInference).toHaveBeenCalledTimes(1)
    expect(out.items).toEqual([{ text: 'oil filter', qty: 3, description: '' }])
  })

  it('retries once when the first response has no JSON array and returns items on retry success', async () => {
    const runInference = vi
      .fn()
      .mockResolvedValueOnce({ text: 'I cannot comply', source: 'test' })
      .mockResolvedValueOnce(jsonResponse([{ text: 'brake pad', qty: 1, description: 'front' }]))
    const out = await extractLineItems({ text: 'brake pad front', runInference })
    expect(runInference).toHaveBeenCalledTimes(2)
    expect(out.items).toEqual([{ text: 'brake pad', qty: 1, description: 'front' }])
    expect(out.callCount).toBe(2)
  })

  it('returns empty items after the retry also fails to parse', async () => {
    const runInference = vi.fn().mockResolvedValue({ text: 'still no json', source: 'test' })
    const out = await extractLineItems({ text: 'nonsense', runInference })
    expect(runInference).toHaveBeenCalledTimes(2)
    expect(out.items).toEqual([])
    expect(out.callCount).toBe(2)
  })

  it('does not retry when runInference throws a runtime error on the first attempt', async () => {
    const runInference = vi.fn().mockRejectedValue(new Error('boom'))
    const out = await extractLineItems({ text: 'hi', runInference })
    expect(runInference).toHaveBeenCalledTimes(1)
    expect(out.items).toEqual([])
    expect(out.callCount).toBe(1)
  })

  it('retries then falls through cleanly when the small model parrots its input (SMA-78)', async () => {
    // The failure mode that motivated SMA-78: small Gemma echoes the paste
    // instead of producing JSON. safeParseJsonArray fails ("no JSON array
    // found"), the retry fails the same way, and extractLineItems must
    // return items=[] with callCount=2 rather than loop or throw.
    const parroted = '1 x 10 and 15 wire cassette\n'.repeat(40) + '1 x spark plug\n'.repeat(20)
    const runInference = vi.fn().mockResolvedValue({
      text: parroted,
      source: 'test',
      stopReason: 'length',
    })
    const out = await extractLineItems({ text: 'paste', runInference })
    expect(runInference).toHaveBeenCalledTimes(2)
    expect(out.items).toEqual([])
    expect(out.callCount).toBe(2)
  })

  it('fails fast without retry when runInference throws stage1_timeout (SMA-78)', async () => {
    const timeoutErr = Object.assign(new Error('On-device inference exceeded 60000ms — aborted'), {
      code: 'stage1_timeout',
      timeoutMs: 60000,
    })
    const runInference = vi.fn().mockRejectedValue(timeoutErr)
    const out = await extractLineItems({ text: 'paste', runInference })
    expect(runInference).toHaveBeenCalledTimes(1)
    expect(out.items).toEqual([])
    expect(out.callCount).toBe(1)
    expect(out.timedOut).toBe(true)
    expect(out.timeoutMs).toBe(60000)
  })

  it('returns empty without calling the model for blank input', async () => {
    const runInference = vi.fn()
    const out = await extractLineItems({ text: '   ', runInference })
    expect(out.items).toEqual([])
    expect(out.callCount).toBe(0)
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

  it('falls back when extract returns non-JSON on both the first try and the retry', async () => {
    const runInference = vi.fn().mockResolvedValue({ text: 'sorry no', source: 'test' })
    const result = await runSmartPastePipeline({
      text: 'whatever',
      products: PRODUCTS,
      context: CONTEXT,
      runInference,
    })
    expect(runInference).toHaveBeenCalledTimes(2)
    expect(result).toEqual({ extracted: [], rows: [], callCount: 2, fallback: true })
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

  it('surfaces fallbackReason=stage1_timeout when the small model wall-clock fires (SMA-78)', async () => {
    const timeoutErr = Object.assign(new Error('On-device inference exceeded 60000ms — aborted'), {
      code: 'stage1_timeout',
      timeoutMs: 60000,
    })
    const runInference = vi.fn().mockRejectedValue(timeoutErr)
    const result = await runSmartPastePipeline({
      text: 'paste',
      products: PRODUCTS,
      context: CONTEXT,
      runInference,
    })
    expect(runInference).toHaveBeenCalledTimes(1)
    expect(result).toMatchObject({
      extracted: [],
      rows: [],
      callCount: 1,
      fallback: true,
      fallbackReason: 'stage1_timeout',
    })
  })
})

describe('smartPastePipeline logger instrumentation (SMA-68)', () => {
  let infoSpy
  let warnSpy
  let debugSpy

  beforeEach(() => {
    infoSpy = vi.spyOn(logger, 'info').mockImplementation(() => {})
    warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {})
    debugSpy = vi.spyOn(logger, 'debug').mockImplementation(() => {})
    infoSpy.mockClear()
    warnSpy.mockClear()
    debugSpy.mockClear()
  })

  it('logs stage1 parse failure when extract response is not JSON', async () => {
    const runInference = vi.fn().mockResolvedValue({ text: 'no idea, sorry', source: 'test' })
    await extractLineItems({ text: 'nonsense', context: CONTEXT, runInference })
    const tags = warnSpy.mock.calls.map(([tag]) => tag)
    expect(tags).toContain('smartPaste.stage1_parse_failed')
  })

  it('logs stage1 runtime error when runInference throws', async () => {
    const runInference = vi.fn().mockRejectedValue(new Error('network down'))
    await extractLineItems({ text: 'hi', runInference })
    const call = warnSpy.mock.calls.find(([tag]) => tag === 'smartPaste.stage1_runtime_error')
    expect(call).toBeTruthy()
    expect(call[1]).toMatchObject({ message: expect.stringContaining('network down') })
  })

  it('emits stage1/stage3 lifecycle logs on a successful run', async () => {
    const extract = [
      { text: 'a', qty: 1, description: '' },
      { text: 'b', qty: 1, description: '' },
      { text: 'c', qty: 1, description: '' },
    ]
    let call = 0
    const runInference = vi.fn(async ({ prompt }) => {
      if (prompt.includes('Customer message:')) return jsonResponse(extract)
      call += 1
      if (call === 1) {
        return jsonResponse([
          { lineIndex: 0, productId: 'p1', confidence: 90 },
          { lineIndex: 1, productId: 'p2', confidence: 85 },
        ])
      }
      return jsonResponse([{ lineIndex: 0, productId: 'p3', confidence: 70 }])
    })
    await runSmartPastePipeline({
      text: 'order',
      products: PRODUCTS,
      context: CONTEXT,
      runInference,
    })
    const tags = infoSpy.mock.calls.map(([tag]) => tag)
    expect(tags).toContain('smartPaste.stage1_start')
    expect(tags).toContain('smartPaste.stage1_complete')
    expect(tags).toContain('smartPaste.stage3_batch_start')
    expect(tags).toContain('smartPaste.stage3_batch_complete')
    const completion = infoSpy.mock.calls.find(([tag]) => tag === 'smartPaste.pipeline_complete')
    expect(completion?.[1]).toMatchObject({ fallback: false, callCount: 3 })
  })

  it('warns on stage3 batch failure with batchIndex and reason', async () => {
    const extract = [{ text: 'front shock', qty: 1, description: '' }]
    let call = 0
    const runInference = vi.fn(async ({ prompt }) => {
      if (prompt.includes('Customer message:')) return jsonResponse(extract)
      call += 1
      throw new Error('rate limit')
    })
    await runSmartPastePipeline({
      text: 'order',
      products: PRODUCTS,
      context: CONTEXT,
      runInference,
    })
    const failed = warnSpy.mock.calls.find(([tag]) => tag === 'smartPaste.stage3_batch_failed')
    expect(failed).toBeTruthy()
    expect(failed[1]).toMatchObject({ batchIndex: 0, message: expect.stringContaining('rate') })
    expect(call).toBeGreaterThan(0)
  })

  it('logs retry lifecycle when the first parse fails and the retry succeeds (SMA-70)', async () => {
    const runInference = vi
      .fn()
      .mockResolvedValueOnce({ text: 'no array here', source: 'test' })
      .mockResolvedValueOnce(jsonResponse([{ text: 'item', qty: 1, description: '' }]))
    await extractLineItems({ text: 'anything', runInference })
    const warnTags = warnSpy.mock.calls.map(([tag]) => tag)
    const infoTags = infoSpy.mock.calls.map(([tag]) => tag)
    expect(warnTags).toContain('smartPaste.stage1_parse_failed')
    expect(infoTags).toContain('smartPaste.stage1_retry_attempt')
    expect(infoTags).toContain('smartPaste.stage1_retry_succeeded')
    expect(warnTags).not.toContain('smartPaste.stage1_retry_failed')
  })

  it('logs stage1_retry_failed when both the first parse and the retry parse fail (SMA-70)', async () => {
    const runInference = vi.fn().mockResolvedValue({ text: 'still no json', source: 'test' })
    await extractLineItems({ text: 'anything', runInference })
    const retryFailed = warnSpy.mock.calls.find(([tag]) => tag === 'smartPaste.stage1_retry_failed')
    expect(retryFailed).toBeTruthy()
    expect(retryFailed[1]).toMatchObject({ reason: expect.any(String) })
  })

  it('does not retry when the first call throws a runtime error (SMA-70)', async () => {
    const runInference = vi.fn().mockRejectedValue(new Error('network down'))
    await extractLineItems({ text: 'hi', runInference })
    expect(runInference).toHaveBeenCalledTimes(1)
    const infoTags = infoSpy.mock.calls.map(([tag]) => tag)
    expect(infoTags).not.toContain('smartPaste.stage1_retry_attempt')
  })

  it('emits debug response-shape diagnostic on stage1 parse failure (SMA-70)', async () => {
    const runInference = vi.fn().mockResolvedValue({
      text: 'Hello! I would love to help but I cannot follow that format today.',
      source: 'test',
    })
    await extractLineItems({ text: 'hi', runInference })
    const shape = debugSpy.mock.calls.find(
      ([tag]) => tag === 'smartPaste.stage1_parse_failed_shape',
    )
    expect(shape).toBeTruthy()
    const payload = shape[1]
    expect(payload).toMatchObject({
      rawLength: expect.any(Number),
      head: expect.any(String),
      tail: expect.any(String),
    })
    expect(payload.rawLength).toBeGreaterThan(0)
    expect(payload.head.length).toBeLessThanOrEqual(60)
    expect(payload.tail.length).toBeLessThanOrEqual(60)
  })

  it('logs pipeline_complete with fallback=true when extract is empty', async () => {
    const runInference = vi.fn().mockResolvedValue(jsonResponse([]))
    await runSmartPastePipeline({
      text: 'hi',
      products: PRODUCTS,
      context: CONTEXT,
      runInference,
    })
    const completion = infoSpy.mock.calls.find(([tag]) => tag === 'smartPaste.pipeline_complete')
    expect(completion?.[1]).toMatchObject({ fallback: true })
    const emptyWarn = warnSpy.mock.calls.find(([tag]) => tag === 'smartPaste.stage1_empty')
    expect(emptyWarn).toBeTruthy()
  })

  it('logs stage1_timeout (not stage1_empty) and pipeline_complete with fallbackReason (SMA-78)', async () => {
    const timeoutErr = Object.assign(new Error('On-device inference exceeded 60000ms — aborted'), {
      code: 'stage1_timeout',
      timeoutMs: 60000,
    })
    const runInference = vi.fn().mockRejectedValue(timeoutErr)
    await runSmartPastePipeline({
      text: 'paste',
      products: PRODUCTS,
      context: CONTEXT,
      runInference,
    })
    const timeoutWarn = warnSpy.mock.calls.find(([tag]) => tag === 'smartPaste.stage1_timeout')
    expect(timeoutWarn).toBeTruthy()
    expect(timeoutWarn[1]).toMatchObject({ timeoutMs: 60000 })
    // Timeout is not the same as "model returned []" — no stage1_empty.
    const emptyWarn = warnSpy.mock.calls.find(([tag]) => tag === 'smartPaste.stage1_empty')
    expect(emptyWarn).toBeFalsy()
    const completion = infoSpy.mock.calls.find(([tag]) => tag === 'smartPaste.pipeline_complete')
    expect(completion?.[1]).toMatchObject({ fallback: true, fallbackReason: 'stage1_timeout' })
  })

  // ── SMA-71: stop-reason aware salvage logging ──

  it('logs stage1_salvaged with counts when the first response is truncated (SMA-71)', async () => {
    const truncated =
      '[{"text":"a","qty":1,"description":""},{"text":"b","qty":2,"description":""},{"text":"c'
    const runInference = vi.fn().mockResolvedValue({ text: truncated, source: 'test' })
    const out = await extractLineItems({ text: 'paste', runInference })
    expect(runInference).toHaveBeenCalledTimes(1)
    expect(out.items).toHaveLength(2)
    const salvaged = infoSpy.mock.calls.find(([tag]) => tag === 'smartPaste.stage1_salvaged')
    expect(salvaged).toBeTruthy()
    expect(salvaged[1]).toMatchObject({
      attempt: 'first',
      salvagedCount: 2,
      attemptedCount: 2,
    })
    // Salvage on first attempt means no retry fires.
    const infoTags = infoSpy.mock.calls.map(([tag]) => tag)
    expect(infoTags).not.toContain('smartPaste.stage1_retry_attempt')
  })

  it('warns stage1_truncated when salvage + stopReason=max_tokens line up (SMA-71)', async () => {
    const truncated =
      '[{"text":"a","qty":1,"description":""},{"text":"b","qty":2,"description":""},{"text":"c'
    const runInference = vi.fn().mockResolvedValue({
      text: truncated,
      source: 'test',
      stopReason: 'max_tokens',
    })
    const out = await extractLineItems({ text: 'paste', runInference })
    expect(out.items).toHaveLength(2)
    const truncatedWarn = warnSpy.mock.calls.find(([tag]) => tag === 'smartPaste.stage1_truncated')
    expect(truncatedWarn).toBeTruthy()
    expect(truncatedWarn[1]).toMatchObject({
      stopReason: 'max_tokens',
      rawLength: truncated.length,
      salvagedItems: 2,
    })
  })

  it('also warns stage1_truncated for stopReason=length (OpenAI) (SMA-71)', async () => {
    const truncated = '[{"text":"one","qty":1,"description":""},{"text":"tw'
    const runInference = vi.fn().mockResolvedValue({
      text: truncated,
      source: 'test',
      stopReason: 'length',
    })
    await extractLineItems({ text: 'paste', runInference })
    const truncatedWarn = warnSpy.mock.calls.find(([tag]) => tag === 'smartPaste.stage1_truncated')
    expect(truncatedWarn).toBeTruthy()
    expect(truncatedWarn[1]).toMatchObject({ stopReason: 'length' })
  })

  it('skips stage1_truncated when salvage fires but stopReason is not a length cap (SMA-71)', async () => {
    // Some providers report a natural-stop reason even on truncated output
    // (model bug, prompt-edge case). If the reason isn't a length cap, don't
    // cry truncation — we can't prove it.
    const truncated = '[{"text":"one","qty":1,"description":""},{"text":"tw'
    const runInference = vi.fn().mockResolvedValue({
      text: truncated,
      source: 'test',
      stopReason: 'stop',
    })
    await extractLineItems({ text: 'paste', runInference })
    const salvaged = infoSpy.mock.calls.find(([tag]) => tag === 'smartPaste.stage1_salvaged')
    expect(salvaged).toBeTruthy()
    const truncatedWarn = warnSpy.mock.calls.find(([tag]) => tag === 'smartPaste.stage1_truncated')
    expect(truncatedWarn).toBeFalsy()
  })

  it('skips stage1_truncated when the clean response parses without salvage (SMA-71)', async () => {
    // Even if the provider reports stopReason=length on a clean response,
    // we don't warn — the text parsed as-is so there was no truncation.
    const runInference = vi.fn().mockResolvedValue({
      text: JSON.stringify([{ text: 'x', qty: 1, description: '' }]),
      source: 'test',
      stopReason: 'length',
    })
    await extractLineItems({ text: 'paste', runInference })
    const truncatedWarn = warnSpy.mock.calls.find(([tag]) => tag === 'smartPaste.stage1_truncated')
    expect(truncatedWarn).toBeFalsy()
  })

  it('requests 2048 max tokens for Stage 1 by default (SMA-71)', async () => {
    const runInference = vi.fn().mockResolvedValue(jsonResponse([]))
    await extractLineItems({ text: 'hi', runInference })
    expect(runInference.mock.calls[0][0].maxTokens).toBe(2048)
  })

  // ── SMA-75: Stage 3 parse-failure diagnostic + retry ──

  it('emits debug stage3_parse_failed_shape with batchIndex/stopReason/head/tail when matchBatch parse fails (SMA-75)', async () => {
    const extract = [{ text: 'front shock', qty: 1, description: '' }]
    const runInference = vi.fn(async ({ prompt }) => {
      if (prompt.includes('Customer message:')) return jsonResponse(extract)
      return { text: 'Sorry, I cannot follow that format.', source: 'test', stopReason: 'stop' }
    })
    await runSmartPastePipeline({
      text: 'order',
      products: PRODUCTS,
      context: CONTEXT,
      runInference,
    })
    const shape = debugSpy.mock.calls.find(
      ([tag]) => tag === 'smartPaste.stage3_parse_failed_shape',
    )
    expect(shape).toBeTruthy()
    const payload = shape[1]
    expect(payload).toMatchObject({
      batchIndex: 0,
      stopReason: 'stop',
      rawLength: expect.any(Number),
      head: expect.any(String),
      tail: expect.any(String),
    })
    expect(payload.rawLength).toBeGreaterThan(0)
    expect(payload.head.length).toBeLessThanOrEqual(60)
    expect(payload.tail.length).toBeLessThanOrEqual(60)
  })

  it('logs stage3_retry_attempt + stage3_retry_succeeded when retry parses cleanly (SMA-75)', async () => {
    const extract = [{ text: 'front shock', qty: 1, description: '' }]
    let stage3Call = 0
    const runInference = vi.fn(async ({ prompt }) => {
      if (prompt.includes('Customer message:')) return jsonResponse(extract)
      stage3Call += 1
      if (stage3Call === 1) {
        return { text: 'no array here', source: 'test' }
      }
      return jsonResponse([{ lineIndex: 0, productId: 'p1', confidence: 91 }])
    })
    const result = await runSmartPastePipeline({
      text: 'order',
      products: PRODUCTS,
      context: CONTEXT,
      runInference,
    })
    expect(stage3Call).toBe(2)
    // 1 extract + 2 stage3 calls (first parse failed, retry succeeded)
    expect(result.callCount).toBe(3)
    expect(result.rows[0].source).toBe('ai')
    expect(result.rows[0].product?.id).toBe('p1')

    const infoTags = infoSpy.mock.calls.map(([tag]) => tag)
    expect(infoTags).toContain('smartPaste.stage3_retry_attempt')
    expect(infoTags).toContain('smartPaste.stage3_retry_succeeded')
    const retryAttempt = infoSpy.mock.calls.find(
      ([tag]) => tag === 'smartPaste.stage3_retry_attempt',
    )
    expect(retryAttempt[1]).toMatchObject({ batchIndex: 0 })

    const warnTags = warnSpy.mock.calls.map(([tag]) => tag)
    expect(warnTags).toContain('smartPaste.stage3_parse_failed')
    // Retry succeeded → no batch failure log.
    expect(warnTags).not.toContain('smartPaste.stage3_batch_failed')
  })

  it('still warns stage3_batch_failed after both attempts fail to parse, with shape logged on each (SMA-75)', async () => {
    const extract = [{ text: 'front shock', qty: 1, description: '' }]
    const runInference = vi.fn(async ({ prompt }) => {
      if (prompt.includes('Customer message:')) return jsonResponse(extract)
      return { text: 'still no json', source: 'test' }
    })
    const result = await runSmartPastePipeline({
      text: 'order',
      products: PRODUCTS,
      context: CONTEXT,
      runInference,
    })
    // Retry burns one call → 1 extract + 2 stage3 = 3 total.
    expect(result.callCount).toBe(3)
    expect(result.rows[0].source).toBe('fuzzy')

    const infoTags = infoSpy.mock.calls.map(([tag]) => tag)
    expect(infoTags).toContain('smartPaste.stage3_retry_attempt')
    expect(infoTags).not.toContain('smartPaste.stage3_retry_succeeded')

    const failed = warnSpy.mock.calls.find(([tag]) => tag === 'smartPaste.stage3_batch_failed')
    expect(failed).toBeTruthy()
    expect(failed[1]).toMatchObject({
      batchIndex: 0,
      message: expect.stringContaining('matchBatch'),
    })

    // Shape log fires on both first parse failure and retry failure.
    const shapeLogs = debugSpy.mock.calls.filter(
      ([tag]) => tag === 'smartPaste.stage3_parse_failed_shape',
    )
    expect(shapeLogs).toHaveLength(2)
  })

  it('does not retry stage3 when runInference throws a runtime error — keeps existing behavior (SMA-75)', async () => {
    const extract = [{ text: 'front shock', qty: 1, description: '' }]
    let stage3Call = 0
    const runInference = vi.fn(async ({ prompt }) => {
      if (prompt.includes('Customer message:')) return jsonResponse(extract)
      stage3Call += 1
      throw new Error('rate limit')
    })
    const result = await runSmartPastePipeline({
      text: 'order',
      products: PRODUCTS,
      context: CONTEXT,
      runInference,
    })
    // No retry on runtime error → 1 extract + 1 stage3 = 2 total.
    expect(stage3Call).toBe(1)
    expect(result.callCount).toBe(2)

    const infoTags = infoSpy.mock.calls.map(([tag]) => tag)
    expect(infoTags).not.toContain('smartPaste.stage3_retry_attempt')

    const failed = warnSpy.mock.calls.find(([tag]) => tag === 'smartPaste.stage3_batch_failed')
    expect(failed).toBeTruthy()
    expect(failed[1]).toMatchObject({ batchIndex: 0, message: expect.stringContaining('rate') })
  })

  it('matchBatch salvage path covers Stage 3 truncation (no regression from SMA-71) (SMA-75)', async () => {
    // Provider truncates the array mid-second-object — first object is complete
    // and matches a real productId, so salvage should yield a usable match
    // without retry.
    const extract = [
      { text: 'front shock', qty: 1, description: '' },
      { text: 'rear shock', qty: 1, description: '' },
    ]
    const truncated =
      '[{"lineIndex":0,"productId":"p1","confidence":92},{"lineIndex":1,"productId":"p2","confide'
    const runInference = vi.fn(async ({ prompt }) => {
      if (prompt.includes('Customer message:')) return jsonResponse(extract)
      return { text: truncated, source: 'test', stopReason: 'max_tokens' }
    })
    const result = await runSmartPastePipeline({
      text: 'order',
      products: PRODUCTS,
      context: CONTEXT,
      runInference,
    })
    // Salvage succeeds → no retry, no batch failure.
    expect(result.callCount).toBe(2)
    expect(result.rows[0].product?.id).toBe('p1')
    const warnTags = warnSpy.mock.calls.map(([tag]) => tag)
    expect(warnTags).not.toContain('smartPaste.stage3_parse_failed')
    expect(warnTags).not.toContain('smartPaste.stage3_batch_failed')
  })

  it('requests 512 max tokens for Stage 3 by default (SMA-75)', async () => {
    const extract = [{ text: 'front shock', qty: 1, description: '' }]
    const runInference = vi.fn(async ({ prompt }) => {
      if (prompt.includes('Customer message:')) return jsonResponse(extract)
      return jsonResponse([{ lineIndex: 0, productId: 'p1', confidence: 90 }])
    })
    await runSmartPastePipeline({
      text: 'order',
      products: PRODUCTS,
      context: CONTEXT,
      runInference,
    })
    const stage3Call = runInference.mock.calls.find(
      ([args]) => !args.prompt.includes('Customer message:'),
    )
    expect(stage3Call?.[0].maxTokens).toBe(512)
  })
})
