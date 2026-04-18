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

  describe('truncation salvage (SMA-71)', () => {
    const extractSchema = (item) =>
      item &&
      typeof item.text === 'string' &&
      typeof item.qty === 'number' &&
      typeof item.description === 'string'
        ? true
        : 'bad shape'

    it('salvages complete items when the array is cut off mid-element (dogfood-trace shape)', () => {
      // The exact shape from the SMA-70 dogfood trace: two complete items, a
      // third started with its description string unterminated, no closing `]`.
      const truncated =
        '[{"text":"blade holder","qty":1,"description":""},{"text":"anvil","qty":2,"description":"longs ones"},{"text":"unc probe","qty":1,"description":"'
      const r = safeParseJsonArray(truncated, { schema: extractSchema })
      expect(r.ok).toBe(true)
      expect(r.salvaged).toBe(true)
      expect(r.value).toEqual([
        { text: 'blade holder', qty: 1, description: '' },
        { text: 'anvil', qty: 2, description: 'longs ones' },
      ])
    })

    it('trims back to the last complete `}` when truncated mid-string', () => {
      // Three complete items; fourth started but never closed. Walk should
      // keep the first three and slice off the dangling start.
      const truncated =
        '[{"text":"a","qty":1,"description":""},{"text":"b","qty":2,"description":""},{"text":"c","qty":3,"description":""},{"text":"dpartial'
      const r = safeParseJsonArray(truncated, { schema: extractSchema })
      expect(r.ok).toBe(true)
      expect(r.salvaged).toBe(true)
      expect(r.value).toHaveLength(3)
      expect(r.value.map((i) => i.text)).toEqual(['a', 'b', 'c'])
    })

    it('does not get fooled by `}` characters inside a quoted string', () => {
      // A literal `}` inside a description must not trigger a false object
      // close. The salvage walk is string-aware.
      const truncated =
        '[{"text":"widget","qty":1,"description":"oh no } inside"},{"text":"gadget","qty":2,"description":"another } here"},{"text":"partial'
      const r = safeParseJsonArray(truncated, { schema: extractSchema })
      expect(r.ok).toBe(true)
      expect(r.salvaged).toBe(true)
      expect(r.value).toEqual([
        { text: 'widget', qty: 1, description: 'oh no } inside' },
        { text: 'gadget', qty: 2, description: 'another } here' },
      ])
    })

    it('falls back to "no JSON array found" when no complete object has closed', () => {
      // `[` present but not a single object has finished yet — nothing to
      // salvage, so the helper returns the original failure.
      const r = safeParseJsonArray('[{"text":"only started')
      expect(r.ok).toBe(false)
      expect(r.error).toMatch(/no JSON array found/)
    })

    it('does not mark well-formed responses as salvaged', () => {
      // Happy path must not set `salvaged: true` — only truncation paths do.
      const r = safeParseJsonArray('[{"text":"fine","qty":1,"description":""}]', {
        schema: extractSchema,
      })
      expect(r.ok).toBe(true)
      expect(r.salvaged).toBeUndefined()
    })

    it('handles escaped quotes inside strings during the salvage walk', () => {
      const truncated =
        '[{"text":"quote \\"inside\\" here","qty":1,"description":""},{"text":"partial'
      const r = safeParseJsonArray(truncated, { schema: extractSchema })
      expect(r.ok).toBe(true)
      expect(r.salvaged).toBe(true)
      expect(r.value).toEqual([{ text: 'quote "inside" here', qty: 1, description: '' }])
    })
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

  it('logs stage1_truncated with stopReason + counts when salvaged and stopReason is length (SMA-71)', async () => {
    // Dogfood shape: Gemini returns a truncated array with finishReason=MAX_TOKENS.
    // The pipeline should salvage the complete items and warn so the trace is actionable.
    const truncated =
      '[{"text":"a","qty":1,"description":""},{"text":"b","qty":2,"description":""},{"text":"c'
    const runInference = vi.fn().mockResolvedValue({
      text: truncated,
      source: 'byok',
      stopReason: 'MAX_TOKENS',
    })
    const out = await extractLineItems({ text: 'paste', runInference })
    expect(out.items).toEqual([
      { text: 'a', qty: 1, description: '' },
      { text: 'b', qty: 2, description: '' },
    ])
    const truncated1 = warnSpy.mock.calls.find(([tag]) => tag === 'smartPaste.stage1_truncated')
    expect(truncated1).toBeTruthy()
    expect(truncated1[1]).toMatchObject({
      stopReason: 'MAX_TOKENS',
      rawLength: truncated.length,
      salvagedItems: 2,
    })
  })

  it("also fires stage1_truncated for OpenAI's 'length' finish reason (SMA-71)", async () => {
    const truncated = '[{"text":"x","qty":1,"description":""},{"text":"partial'
    const runInference = vi.fn().mockResolvedValue({
      text: truncated,
      source: 'byok',
      stopReason: 'length',
    })
    await extractLineItems({ text: 'paste', runInference })
    const truncated1 = warnSpy.mock.calls.find(([tag]) => tag === 'smartPaste.stage1_truncated')
    expect(truncated1).toBeTruthy()
    expect(truncated1[1]).toMatchObject({ stopReason: 'length', salvagedItems: 1 })
  })

  it("also fires stage1_truncated for Anthropic's 'max_tokens' stop_reason (SMA-71)", async () => {
    const truncated = '[{"text":"x","qty":1,"description":""},{"text":"partial'
    const runInference = vi.fn().mockResolvedValue({
      text: truncated,
      source: 'byok',
      stopReason: 'max_tokens',
    })
    await extractLineItems({ text: 'paste', runInference })
    const truncated1 = warnSpy.mock.calls.find(([tag]) => tag === 'smartPaste.stage1_truncated')
    expect(truncated1).toBeTruthy()
    expect(truncated1[1]).toMatchObject({ stopReason: 'max_tokens' })
  })

  it('does not fire stage1_truncated on a normal well-formed response (SMA-71)', async () => {
    // Well-formed response that happens to have stopReason=stop → not truncation.
    const runInference = vi.fn().mockResolvedValue({
      text: JSON.stringify([{ text: 'ok', qty: 1, description: '' }]),
      source: 'byok',
      stopReason: 'stop',
    })
    await extractLineItems({ text: 'paste', runInference })
    const truncated1 = warnSpy.mock.calls.find(([tag]) => tag === 'smartPaste.stage1_truncated')
    expect(truncated1).toBeFalsy()
  })

  it('does not fire stage1_truncated when salvaged but stopReason is not length-cap (SMA-71)', async () => {
    // Edge: response was truncated mid-stream due to a stop sequence or other
    // non-length reason. We salvage what we can but don't claim truncation.
    const truncated = '[{"text":"a","qty":1,"description":""},{"text":"partial'
    const runInference = vi.fn().mockResolvedValue({
      text: truncated,
      source: 'byok',
      stopReason: 'stop',
    })
    const out = await extractLineItems({ text: 'paste', runInference })
    expect(out.items).toEqual([{ text: 'a', qty: 1, description: '' }])
    const truncated1 = warnSpy.mock.calls.find(([tag]) => tag === 'smartPaste.stage1_truncated')
    expect(truncated1).toBeFalsy()
  })
})
