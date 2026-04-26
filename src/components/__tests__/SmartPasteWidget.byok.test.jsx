/**
 * BYOK pipeline wiring for SmartPasteWidget (SMA-59).
 *
 * The widget drives the Smart Paste two-stage pipeline for BYOK users with
 * business context set. These tests stub `runCatalogSearch` to verify:
 *   - pipeline is invoked with the expected args
 *   - Stage 1 failure (fallback: true) keeps regex rows + toasts
 *   - missing business context renders the banner and short-circuits
 *   - per-batch onStage events drive spinners that resolve in batch order
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'

vi.mock('../../catalog/search.js', () => ({
  runCatalogSearch: vi.fn(),
}))

import { runCatalogSearch } from '../../catalog/search.js'
import { SmartPasteWidget } from '../SmartPasteWidget.jsx'
import { logger } from '../../utils/logger.js'

const products = [
  { id: 'p1', name: 'Blue Molar Extractor', price: 25 },
  { id: 'p2', name: 'Sterilisation Cassette', price: 40 },
  { id: 'p3', name: 'Curing Light', price: 120 },
  { id: 'p4', name: 'Endo Files 25mm', price: 18 },
  { id: 'p5', name: 'Disposable Gloves', price: 12 },
]

const FULL_CONTEXT = {
  productType: 'Dental supplies',
  shopType: 'Wholesale',
  customerType: 'Dental clinics',
  vocabulary: 'endo, molar, cassette',
  locale: 'en-GB',
}

const EMPTY_CONTEXT = {
  productType: '',
  shopType: '',
  customerType: '',
  vocabulary: '',
  locale: '',
}

function setup({
  runInference = vi.fn(),
  aiMode = 'byok',
  aiReady = true,
  toast = vi.fn(),
  smartPasteContext = FULL_CONTEXT,
  onOpenSettings = vi.fn(),
} = {}) {
  const onAddItems = vi.fn()
  const utils = render(
    <SmartPasteWidget
      products={products}
      onAddItems={onAddItems}
      aiMode={aiMode}
      aiReady={aiReady}
      runInference={runInference}
      toast={toast}
      smartPasteContext={smartPasteContext}
      onOpenSettings={onOpenSettings}
    />,
  )
  return { ...utils, onAddItems, toast, runInference, onOpenSettings }
}

function typeAndParse(text) {
  fireEvent.change(screen.getByPlaceholderText(/Paste an order/), { target: { value: text } })
  fireEvent.click(screen.getByRole('button', { name: /Parse/i }))
}

beforeEach(() => {
  runCatalogSearch.mockReset()
})

describe('SmartPasteWidget pipeline wiring', () => {
  it('invokes runCatalogSearch with text, products, context, runInference', async () => {
    runCatalogSearch.mockResolvedValue({
      extracted: [{ text: 'Mystery Item', qty: 1, description: 'Mystery' }],
      rows: [
        {
          extracted: { text: 'Mystery Item', qty: 1, description: 'Mystery' },
          product: products[0],
          confidence: 82,
          source: 'ai',
        },
      ],
      callCount: 2,
      fallback: false,
    })
    const runInference = vi.fn()
    setup({ runInference })

    typeAndParse('Mystery Item')

    await waitFor(() => {
      expect(runCatalogSearch).toHaveBeenCalledTimes(1)
    })
    const call = runCatalogSearch.mock.calls[0][0]
    expect(call.text).toContain('Mystery Item')
    expect(call.products).toEqual(products)
    expect(call.context).toEqual(FULL_CONTEXT)
    expect(call.runInference).toBe(runInference)
    expect(typeof call.onStage).toBe('function')

    await waitFor(() => {
      expect(screen.getByText(/Blue Molar Extractor/)).toBeInTheDocument()
    })
  })

  it('Stage 1 failure keeps regex rows, toasts fallback, and fires no further calls', async () => {
    runCatalogSearch.mockResolvedValue({
      extracted: [],
      rows: [],
      callCount: 1,
      fallback: true,
    })
    const { toast, runInference } = setup()

    typeAndParse('Gobbledygook Nonsense Product')

    await waitFor(() => {
      expect(screen.getByText(/No match/)).toBeInTheDocument()
    })
    await waitFor(() => {
      expect(toast).toHaveBeenCalledWith(expect.stringContaining('AI extract failed'))
    })
    // runInference is never invoked directly by the widget — the pipeline owns it.
    expect(runInference).not.toHaveBeenCalled()
    // No Stage 3 match event surfaced spinners.
    expect(screen.queryByText(/AI matching…/)).not.toBeInTheDocument()
    // Regex row name still present (both textarea + row match).
    expect(screen.getAllByText(/Gobbledygook/).length).toBeGreaterThan(0)
  })

  it('renders the context banner and does NOT call the pipeline when context is missing', () => {
    setup({ smartPasteContext: EMPTY_CONTEXT })

    expect(screen.getByTestId('smart-paste-context-banner')).toBeInTheDocument()
    typeAndParse('4 x Blue Molar Extractor\n2 x Sterilisation Cassette')

    expect(runCatalogSearch).not.toHaveBeenCalled()
  })

  it('opens settings when the banner link is clicked', () => {
    const onOpenSettings = vi.fn()
    setup({ smartPasteContext: EMPTY_CONTEXT, onOpenSettings })

    const banner = screen.getByTestId('smart-paste-context-banner')
    fireEvent.click(within(banner).getByRole('link', { name: /Open Settings/i }))
    expect(onOpenSettings).toHaveBeenCalledWith('smart-paste-ai-context')
  })

  it('dismisses the banner and keeps it dismissed', () => {
    setup({ smartPasteContext: EMPTY_CONTEXT })
    const banner = screen.getByTestId('smart-paste-context-banner')
    fireEvent.click(within(banner).getByRole('button', { name: /Dismiss AI context banner/ }))
    expect(screen.queryByTestId('smart-paste-context-banner')).not.toBeInTheDocument()
  })

  it('reveals rows incrementally as each batch-complete event arrives (SMA-99)', async () => {
    const pipelineRow = (name, qty, product, confidence) => ({
      extracted: { text: name, qty, description: name },
      product,
      confidence,
      source: 'ai',
    })

    let emit
    let resolvePipeline
    runCatalogSearch.mockImplementation(async ({ onStage }) => {
      emit = onStage
      onStage({ stage: 'extract' })
      onStage({
        stage: 'extract',
        status: 'complete',
        extractedCount: 3,
        totalBatches: 2,
      })
      return new Promise((res) => {
        resolvePipeline = res
      })
    })

    setup()
    typeAndParse(
      [
        '1 x Alpha widget that definitely does not exist',
        '1 x Beta widget that definitely does not exist',
        '1 x Gamma widget that definitely does not exist',
      ].join('\n'),
    )

    // Textarea is hidden; spinner + progress are visible.
    await waitFor(() => expect(screen.getByTestId('smart-paste-processing')).toBeInTheDocument())
    expect(screen.queryByPlaceholderText(/Paste an order/)).not.toBeInTheDocument()
    // No rows revealed yet.
    expect(screen.queryByText(/Blue Molar Extractor/)).not.toBeInTheDocument()

    // First batch completes — rows 0 and 1 appear; row 2 stays hidden.
    emit({
      stage: 'match',
      batchIndex: 0,
      totalBatches: 2,
      status: 'complete',
      offset: 0,
      batchRows: [
        pipelineRow('Alpha', 1, products[0], 90),
        pipelineRow('Beta', 1, products[1], 88),
      ],
    })
    await waitFor(() => {
      expect(screen.getByText(/1 × Blue Molar Extractor/)).toBeInTheDocument()
    })
    expect(screen.getByText(/1 × Sterilisation Cassette/)).toBeInTheDocument()
    expect(screen.queryByText(/1 × Curing Light/)).not.toBeInTheDocument()
    // Processing card still visible while batch 2 is pending.
    expect(screen.getByTestId('smart-paste-processing')).toBeInTheDocument()

    // Second batch completes — row 2 appears.
    emit({
      stage: 'match',
      batchIndex: 1,
      totalBatches: 2,
      status: 'complete',
      offset: 2,
      batchRows: [pipelineRow('Gamma', 1, products[2], 92)],
    })
    await waitFor(() => {
      expect(screen.getByText(/1 × Curing Light/)).toBeInTheDocument()
    })

    // Pipeline fully resolves — spinner clears, "Paste more" bar appears.
    resolvePipeline({
      extracted: [
        { text: 'Alpha', qty: 1, description: 'Alpha' },
        { text: 'Beta', qty: 1, description: 'Beta' },
        { text: 'Gamma', qty: 1, description: 'Gamma' },
      ],
      rows: [
        pipelineRow('Alpha', 1, products[0], 90),
        pipelineRow('Beta', 1, products[1], 88),
        pipelineRow('Gamma', 1, products[2], 92),
      ],
      callCount: 3,
      fallback: false,
    })

    await waitFor(() => {
      expect(screen.queryByTestId('smart-paste-processing')).not.toBeInTheDocument()
    })
    expect(screen.getByTestId('smart-paste-more-bar')).toBeInTheDocument()
  })

  it('marks rows with batch-failed and reveals them when onStage emits an error (SMA-99)', async () => {
    const paste = ['1 x Nope alpha xyz', '1 x Nope beta xyz'].join('\n')
    let resolvePipeline
    runCatalogSearch.mockImplementation(async ({ onStage }) => {
      onStage({ stage: 'extract' })
      onStage({
        stage: 'extract',
        status: 'complete',
        extractedCount: 2,
        totalBatches: 1,
      })
      onStage({ stage: 'match', batchIndex: 0, totalBatches: 1 })
      onStage({
        stage: 'match',
        batchIndex: 0,
        totalBatches: 1,
        error: new Error('matchBatch: bad shape'),
      })
      return new Promise((res) => {
        resolvePipeline = res
      })
    })

    setup()
    typeAndParse(paste)

    // Error on batch 0 reveals rows 0 and 1 (fuzzy fallbacks) with
    // `batch-failed` markers. Processing card remains while the pipeline
    // promise is still pending.
    await waitFor(() => {
      expect(screen.getByTestId('batch-failed-0')).toBeInTheDocument()
    })
    expect(screen.getByTestId('batch-failed-1')).toBeInTheDocument()
    expect(screen.getByTestId('smart-paste-processing')).toBeInTheDocument()

    resolvePipeline({
      extracted: [{ text: 'Nope alpha', qty: 1, description: 'x' }],
      rows: [
        {
          extracted: { text: 'Nope alpha', qty: 1, description: 'x' },
          product: null,
          confidence: 0,
          source: 'none',
        },
      ],
      callCount: 2,
      fallback: false,
    })

    await waitFor(() => {
      expect(screen.getByText(/No match/)).toBeInTheDocument()
    })
    expect(screen.queryByTestId('smart-paste-processing')).not.toBeInTheDocument()
  })

  it('progress label advances from "Reading your paste…" to a counted match label (SMA-99)', async () => {
    let emit
    runCatalogSearch.mockImplementation(async ({ onStage }) => {
      emit = onStage
      onStage({ stage: 'extract' })
      return new Promise(() => {})
    })
    setup()
    typeAndParse('1 x Unknown widget A\n1 x Unknown widget B')

    await waitFor(() =>
      expect(screen.getByTestId('smart-paste-processing-label')).toHaveTextContent(
        /Reading your paste/i,
      ),
    )
    emit({ stage: 'extract', status: 'complete', extractedCount: 2, totalBatches: 1 })
    await waitFor(() =>
      expect(screen.getByTestId('smart-paste-processing-label')).toHaveTextContent(
        /Matching items — 1 of 2/,
      ),
    )
  })

  it('"Paste more" bar clears results and restores the textarea (SMA-99)', async () => {
    runCatalogSearch.mockResolvedValue({
      extracted: [{ text: 'Mystery', qty: 1, description: 'Mystery' }],
      rows: [
        {
          extracted: { text: 'Mystery', qty: 1, description: 'Mystery' },
          product: products[0],
          confidence: 82,
          source: 'ai',
        },
      ],
      callCount: 2,
      fallback: false,
    })
    setup()
    typeAndParse('Mystery widget item')

    await waitFor(() => expect(screen.getByTestId('smart-paste-more-bar')).toBeInTheDocument())
    // Textarea is hidden while results are on screen.
    expect(screen.queryByPlaceholderText(/Paste an order/)).not.toBeInTheDocument()

    fireEvent.click(screen.getByTestId('smart-paste-more-bar'))

    // Bar clears, textarea is back and empty.
    expect(screen.queryByTestId('smart-paste-more-bar')).not.toBeInTheDocument()
    const textarea = screen.getByPlaceholderText(/Paste an order/)
    expect(textarea).toHaveValue('')
  })

  // SMA-100: auto-save invoice state as matches are added. Each auto_match
  // row flows into the invoice via onAddItems the moment the pipeline confirms
  // it — so a user who navigates away before hitting "Add N matched" does not
  // lose the matching work.
  it('auto-saves auto_match rows to the invoice per batch-complete event (SMA-100)', async () => {
    const pipelineRow = (name, qty, product, confidence) => ({
      extracted: { text: name, qty, description: name },
      product,
      confidence,
      source: 'ai',
    })

    let emit
    let resolvePipeline
    runCatalogSearch.mockImplementation(async ({ onStage }) => {
      emit = onStage
      onStage({ stage: 'extract' })
      onStage({
        stage: 'extract',
        status: 'complete',
        extractedCount: 2,
        totalBatches: 2,
      })
      return new Promise((res) => {
        resolvePipeline = res
      })
    })

    const { onAddItems } = setup()
    typeAndParse(['1 x Alpha widget xyz', '1 x Beta widget xyz'].join('\n'))

    // Batch 0 completes with a high-confidence auto_match at offset 0.
    emit({
      stage: 'match',
      batchIndex: 0,
      totalBatches: 2,
      status: 'complete',
      offset: 0,
      batchRows: [pipelineRow('Alpha', 2, products[0], 90)],
    })
    await waitFor(() => expect(onAddItems).toHaveBeenCalledTimes(1))
    expect(onAddItems).toHaveBeenLastCalledWith([
      expect.objectContaining({ desc: 'Blue Molar Extractor', qty: 2, price: 25 }),
    ])
    expect(screen.getByTestId('saved-badge-0')).toBeInTheDocument()

    // Batch 1 completes with another auto_match at offset 1.
    emit({
      stage: 'match',
      batchIndex: 1,
      totalBatches: 2,
      status: 'complete',
      offset: 1,
      batchRows: [pipelineRow('Beta', 3, products[1], 91)],
    })
    await waitFor(() => expect(onAddItems).toHaveBeenCalledTimes(2))
    expect(onAddItems).toHaveBeenLastCalledWith([
      expect.objectContaining({ desc: 'Sterilisation Cassette', qty: 3, price: 40 }),
    ])

    // Pipeline resolves — the final sweep must NOT re-add already-committed rows.
    resolvePipeline({
      extracted: [
        { text: 'Alpha', qty: 2, description: 'Alpha' },
        { text: 'Beta', qty: 3, description: 'Beta' },
      ],
      rows: [pipelineRow('Alpha', 2, products[0], 90), pipelineRow('Beta', 3, products[1], 91)],
      callCount: 3,
      fallback: false,
    })
    await waitFor(() =>
      expect(screen.queryByTestId('smart-paste-processing')).not.toBeInTheDocument(),
    )
    expect(onAddItems).toHaveBeenCalledTimes(2)
    // Rows stay visible marked as saved; the explicit Add CTA is gone.
    expect(screen.getByTestId('saved-badge-0')).toBeInTheDocument()
    expect(screen.getByTestId('saved-badge-1')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Add \d+ matched/ })).not.toBeInTheDocument()
  })

  it('does not auto-save best_guess rows — user still confirms (SMA-100)', async () => {
    const pipelineRow = (name, qty, product, confidence, source = 'ai') => ({
      extracted: { text: name, qty, description: name },
      product,
      confidence,
      source,
    })

    runCatalogSearch.mockResolvedValue({
      extracted: [{ text: 'Unsure item', qty: 1, description: 'Unsure item' }],
      // Low-confidence AI pick → convertPipelineRow routes it to bestGuess,
      // not product, so autoAddMatches must skip it.
      rows: [pipelineRow('Unsure', 1, products[0], 40)],
      callCount: 2,
      fallback: false,
    })

    const { onAddItems } = setup()
    typeAndParse('1 x Unsure item')

    // Wait for a render that reflects pipeline resolution.
    await waitFor(() =>
      expect(screen.queryByTestId('smart-paste-processing')).not.toBeInTheDocument(),
    )
    expect(onAddItems).not.toHaveBeenCalled()
    expect(screen.queryByTestId('saved-badge-0')).not.toBeInTheDocument()
    // Confirm / Discard buttons render for best_guess rows.
    expect(screen.getByRole('button', { name: /Confirm/i })).toBeInTheDocument()
  })

  it('does not double-add when the final pipeline result repeats batch rows (SMA-100)', async () => {
    const pipelineRow = (name, qty, product, confidence) => ({
      extracted: { text: name, qty, description: name },
      product,
      confidence,
      source: 'ai',
    })

    runCatalogSearch.mockImplementation(async ({ onStage }) => {
      onStage({ stage: 'extract' })
      onStage({
        stage: 'extract',
        status: 'complete',
        extractedCount: 1,
        totalBatches: 1,
      })
      onStage({
        stage: 'match',
        batchIndex: 0,
        totalBatches: 1,
        status: 'complete',
        offset: 0,
        batchRows: [pipelineRow('Alpha', 1, products[0], 92)],
      })
      return {
        extracted: [{ text: 'Alpha', qty: 1, description: 'Alpha' }],
        rows: [pipelineRow('Alpha', 1, products[0], 92)],
        callCount: 2,
        fallback: false,
      }
    })

    const { onAddItems } = setup()
    typeAndParse('1 x Alpha')

    await waitFor(() => expect(onAddItems).toHaveBeenCalledTimes(1))
    // Final sweep runs after pipeline resolves — must be a no-op because the
    // row index is already tracked in autoAddedRef.
    expect(onAddItems).toHaveBeenCalledTimes(1)
  })

  it("does not call the pipeline when aiMode is 'off'", () => {
    setup({ aiMode: 'off' })
    typeAndParse('2 x Blue Molar Extractor')
    expect(runCatalogSearch).not.toHaveBeenCalled()
  })

  it('skips the pipeline when fuzzy already matched every row above the floor', () => {
    setup()
    // Exact catalog name → auto_match at 100%, no low-confidence rows.
    typeAndParse('2 x Blue Molar Extractor')
    expect(runCatalogSearch).not.toHaveBeenCalled()
    expect(screen.getByText(/100% match/)).toBeInTheDocument()
  })
})

describe('SmartPasteWidget skip diagnostics (SMA-68)', () => {
  let infoSpy
  let warnSpy
  let errorSpy

  beforeEach(() => {
    runCatalogSearch.mockReset()
    infoSpy = vi.spyOn(logger, 'info').mockImplementation(() => {})
    warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {})
    errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {})
    infoSpy.mockClear()
    warnSpy.mockClear()
    errorSpy.mockClear()
  })

  function lastSkipReason() {
    const calls = infoSpy.mock.calls.filter(([tag]) => tag === 'smartPaste.pipeline_skipped')
    return calls[calls.length - 1]?.[1]?.reason
  }

  it('logs mode_off when aiMode is off', () => {
    setup({ aiMode: 'off' })
    typeAndParse('2 x Blue Molar Extractor')
    expect(lastSkipReason()).toBe('mode_off')
    expect(screen.queryByTestId('smart-paste-skip-hint')).not.toBeInTheDocument()
  })

  it('routes aiMode="small" with model loaded through the pipeline', async () => {
    runCatalogSearch.mockResolvedValue({
      extracted: [{ text: 'Mystery', qty: 1, description: '' }],
      rows: [
        {
          extracted: { text: 'Mystery', qty: 1, description: '' },
          product: products[0],
          confidence: 82,
          source: 'ai',
        },
      ],
      callCount: 2,
      fallback: false,
    })
    setup({ aiMode: 'small', aiReady: true })
    typeAndParse('Mystery Item')
    await waitFor(() => expect(runCatalogSearch).toHaveBeenCalledTimes(1))
    const skipCall = infoSpy.mock.calls.find(([tag]) => tag === 'smartPaste.pipeline_skipped')
    expect(skipCall).toBeFalsy()
    const started = infoSpy.mock.calls.find(([tag]) => tag === 'smartPaste.pipeline_started')
    expect(started).toBeTruthy()
  })

  it('skips the pipeline with model_not_loaded when small is selected but not loaded', () => {
    setup({ aiMode: 'small', aiReady: false })
    typeAndParse('4 x Mystery widget')
    expect(lastSkipReason()).toBe('model_not_loaded')
    expect(runCatalogSearch).not.toHaveBeenCalled()
    const hint = screen.getByTestId('smart-paste-skip-hint')
    expect(hint).toHaveTextContent(/On-device model isn.?t loaded/i)
    expect(hint).toHaveTextContent(/Settings → AI/i)
  })

  it('model_not_loaded hint link calls onOpenSettings with "ai"', () => {
    const onOpenSettings = vi.fn()
    setup({ aiMode: 'small', aiReady: false, onOpenSettings })
    typeAndParse('4 x Mystery widget')
    const hint = screen.getByTestId('smart-paste-skip-hint')
    fireEvent.click(within(hint).getByRole('link', { name: /Load into memory/i }))
    expect(onOpenSettings).toHaveBeenCalledWith('ai')
  })

  it('does not gate on context for aiMode="small" — pipeline runs without it', async () => {
    runCatalogSearch.mockResolvedValue({
      extracted: [{ text: 'Mystery', qty: 1, description: '' }],
      rows: [
        {
          extracted: { text: 'Mystery', qty: 1, description: '' },
          product: products[0],
          confidence: 70,
          source: 'ai',
        },
      ],
      callCount: 2,
      fallback: false,
    })
    setup({ aiMode: 'small', aiReady: true, smartPasteContext: EMPTY_CONTEXT })
    // The banner is BYOK-only; on-device should never render it.
    expect(screen.queryByTestId('smart-paste-context-banner')).not.toBeInTheDocument()
    typeAndParse('Mystery Item')
    await waitFor(() => expect(runCatalogSearch).toHaveBeenCalledTimes(1))
    const skipCall = infoSpy.mock.calls.find(([tag]) => tag === 'smartPaste.pipeline_skipped')
    expect(skipCall).toBeFalsy()
  })

  it('logs context_missing and renders the inline hint', () => {
    setup({ smartPasteContext: EMPTY_CONTEXT })
    typeAndParse('4 x Unknown widget')
    expect(lastSkipReason()).toBe('context_missing')
    const hint = screen.getByTestId('smart-paste-skip-hint')
    expect(hint).toHaveTextContent(/AI context missing/i)
  })

  it('inline hint "set it up in Settings" link calls onOpenSettings', () => {
    const onOpenSettings = vi.fn()
    setup({ smartPasteContext: EMPTY_CONTEXT, onOpenSettings })
    typeAndParse('4 x Unknown widget')
    const hint = screen.getByTestId('smart-paste-skip-hint')
    fireEvent.click(within(hint).getByRole('link', { name: /set it up in Settings/i }))
    expect(onOpenSettings).toHaveBeenCalledWith('smart-paste-ai-context')
  })

  it('logs no_runinference when runInference is not provided', () => {
    // Pass null so the destructure default (`runInference = vi.fn()`) does not fire.
    setup({ runInference: null })
    typeAndParse('4 x Unknown widget')
    expect(lastSkipReason()).toBe('no_runinference')
    expect(screen.queryByTestId('smart-paste-skip-hint')).not.toBeInTheDocument()
  })

  it('logs no_products and renders the catalog hint', () => {
    render(
      <SmartPasteWidget
        products={[]}
        onAddItems={vi.fn()}
        aiMode="byok"
        runInference={vi.fn()}
        toast={vi.fn()}
        smartPasteContext={FULL_CONTEXT}
        onOpenSettings={vi.fn()}
      />,
    )
    typeAndParse('4 x Something')
    expect(lastSkipReason()).toBe('no_products')
    expect(screen.getByTestId('smart-paste-skip-hint')).toHaveTextContent(/Catalog is empty/i)
  })

  it('logs no_low_confidence_rows without rendering a hint when fuzzy covered everything', () => {
    setup()
    typeAndParse('2 x Blue Molar Extractor')
    expect(lastSkipReason()).toBe('no_low_confidence_rows')
    expect(screen.queryByTestId('smart-paste-skip-hint')).not.toBeInTheDocument()
  })

  it('logs pipeline_started before invoking the pipeline on happy path', async () => {
    runCatalogSearch.mockResolvedValue({
      extracted: [{ text: 'Mystery', qty: 1, description: '' }],
      rows: [
        {
          extracted: { text: 'Mystery', qty: 1, description: '' },
          product: products[0],
          confidence: 82,
          source: 'ai',
        },
      ],
      callCount: 2,
      fallback: false,
    })
    setup()
    typeAndParse('Mystery Item')
    await waitFor(() => expect(runCatalogSearch).toHaveBeenCalledTimes(1))
    const started = infoSpy.mock.calls.find(([tag]) => tag === 'smartPaste.pipeline_started')
    expect(started).toBeTruthy()
    expect(started[1]).toMatchObject({
      rowCount: expect.any(Number),
      lowConfidenceCount: expect.any(Number),
    })
  })

  it('logs pipeline_threw with the error message when runCatalogSearch throws', async () => {
    runCatalogSearch.mockRejectedValue(new Error('quota exceeded'))
    const toast = vi.fn()
    setup({ toast })
    typeAndParse('Mystery Item')
    await waitFor(() => {
      const call = errorSpy.mock.calls.find(([tag]) => tag === 'smartPaste.pipeline_threw')
      expect(call).toBeTruthy()
      expect(call[1]).toMatchObject({ message: expect.stringContaining('quota exceeded') })
    })
    expect(toast).toHaveBeenCalledWith(expect.stringContaining('AI extract failed'))
  })

  it('retries once and warns when runCatalogSearch throws "API key not configured"', async () => {
    runCatalogSearch
      .mockRejectedValueOnce(new Error('BYOK: API key not configured'))
      .mockResolvedValueOnce({
        extracted: [{ text: 'Mystery', qty: 1, description: '' }],
        rows: [
          {
            extracted: { text: 'Mystery', qty: 1, description: '' },
            product: products[0],
            confidence: 82,
            source: 'ai',
          },
        ],
        callCount: 2,
        fallback: false,
      })
    setup()
    typeAndParse('Mystery Item')
    await waitFor(() => expect(runCatalogSearch).toHaveBeenCalledTimes(2))
    const warnCall = warnSpy.mock.calls.find(
      ([tag]) => tag === 'smartPaste.byok_key_not_hydrated_yet',
    )
    expect(warnCall).toBeTruthy()
    expect(errorSpy.mock.calls.find(([tag]) => tag === 'smartPaste.pipeline_threw')).toBeFalsy()
  })
})
