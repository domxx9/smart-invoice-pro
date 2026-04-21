import { describe, it, expect, vi, beforeEach } from 'vitest'
import { make869, make8k } from './fixtures.js'
import { pickTier } from '../tier.js'

vi.mock('../../ai/smartPastePipeline.js', async () => {
  const actual = await vi.importActual('../../ai/smartPastePipeline.js')
  return {
    ...actual,
    runSmartPastePipeline: vi.fn(async () => ({
      extracted: [{ text: 'sample', qty: 1, description: '' }],
      rows: [
        {
          extracted: { text: 'sample', qty: 1, description: '' },
          product: null,
          confidence: 0,
          source: 'none',
        },
      ],
      callCount: 1,
      fallback: false,
    })),
  }
})

vi.mock('../byokSearch.js', async () => {
  const actual = await vi.importActual('../byokSearch.js')
  return {
    ...actual,
    runByokCatalogSearch: vi.fn(async ({ runInference }) => {
      // Minimal stand-in: prove the dispatcher actually routed to the BYOK
      // path and surfaced a BYOK adapter call.
      await runInference({ prompt: 'test', maxTokens: 32 })
      return {
        extracted: [{ text: 'sample', qty: 1, description: '' }],
        rows: [
          {
            extracted: { text: 'sample', qty: 1, description: '' },
            product: null,
            confidence: 0,
            source: 'ai',
          },
        ],
        mode: 'byok',
      }
    }),
  }
})

import { runCatalogSearch } from '../search.js'
import { runSmartPastePipeline } from '../../ai/smartPastePipeline.js'
import { runByokCatalogSearch } from '../byokSearch.js'

const runInferenceStub = vi.fn(async () => ({ text: '[]', source: 'byok', stopReason: 'stop' }))

beforeEach(() => {
  runSmartPastePipeline.mockClear()
  runByokCatalogSearch.mockClear()
  runInferenceStub.mockClear()
})

describe('runCatalogSearch dispatcher (SMA-123)', () => {
  it('869-product fixture → tier=local, search uses SMA-117 stack', async () => {
    const { products, stats } = make869()
    const tier = pickTier(stats)
    expect(tier).toBe('local')

    const result = await runCatalogSearch({
      tier,
      byok: { aiMode: 'small', byokProvider: '', byokApiKeyConfigured: false },
      text: '2 x Product 1',
      products,
      runInference: runInferenceStub,
    })

    expect(result.mode).toBe('local')
    expect(runSmartPastePipeline).toHaveBeenCalledTimes(1)
    expect(runByokCatalogSearch).not.toHaveBeenCalled()
  })

  it('8k-product synthetic fixture → tier=byok, search calls BYOK adapter', async () => {
    const { products, stats } = make8k()
    const tier = pickTier(stats)
    expect(tier).toBe('byok')

    const result = await runCatalogSearch({
      tier,
      byok: { aiMode: 'byok', byokProvider: 'openai', byokApiKeyConfigured: true },
      text: '2 x Product 1',
      products,
      runInference: runInferenceStub,
    })

    expect(result.mode).toBe('byok')
    expect(runByokCatalogSearch).toHaveBeenCalledTimes(1)
    // BYOK adapter (via runInference) must have been invoked.
    expect(runInferenceStub).toHaveBeenCalled()
    expect(runSmartPastePipeline).not.toHaveBeenCalled()
  })

  it('8k catalog without BYOK key → BM25 fallback + needsBYOKKey flag', async () => {
    const { products, stats } = make8k()
    const tier = pickTier(stats)

    const result = await runCatalogSearch({
      tier,
      byok: { aiMode: 'byok', byokProvider: 'openai', byokApiKeyConfigured: false },
      text: '2 x Product 1',
      products,
      runInference: runInferenceStub,
    })

    expect(result.mode).toBe('bm25_fallback')
    expect(result.needsBYOKKey).toBe(true)
    expect(result.rows.length).toBeGreaterThan(0)
    // No LLM / byok adapter call when the BM25 fallback fires.
    expect(runInferenceStub).not.toHaveBeenCalled()
    expect(runByokCatalogSearch).not.toHaveBeenCalled()
    expect(runSmartPastePipeline).not.toHaveBeenCalled()
  })

  it('byok tier + wrong aiMode → BM25 fallback (key presence gated on aiMode)', async () => {
    const { products, stats } = make8k()
    const tier = pickTier(stats)

    const result = await runCatalogSearch({
      tier,
      byok: { aiMode: 'small', byokProvider: 'openai', byokApiKeyConfigured: true },
      text: '2 x Product 1',
      products,
      runInference: runInferenceStub,
    })

    expect(result.mode).toBe('bm25_fallback')
    expect(result.needsBYOKKey).toBe(true)
  })

  it('unknown tier values fall back to local (safe default)', async () => {
    const { products } = make869()
    const result = await runCatalogSearch({
      tier: 'mystery',
      byok: { aiMode: 'small', byokProvider: '', byokApiKeyConfigured: false },
      text: '1 x Product 1',
      products,
      runInference: runInferenceStub,
    })
    expect(result.mode).toBe('local')
  })
})
