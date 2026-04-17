/**
 * BYOK pipeline wiring for SmartPasteWidget (SMA-59).
 *
 * The widget drives the Smart Paste two-stage pipeline for BYOK users with
 * business context set. These tests stub `runSmartPastePipeline` to verify:
 *   - pipeline is invoked with the expected args
 *   - Stage 1 failure (fallback: true) keeps regex rows + toasts
 *   - missing business context renders the banner and short-circuits
 *   - per-batch onStage events drive spinners that resolve in batch order
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'

vi.mock('../../ai/smartPastePipeline.js', () => ({
  runSmartPastePipeline: vi.fn(),
}))

import { runSmartPastePipeline } from '../../ai/smartPastePipeline.js'
import { SmartPasteWidget } from '../SmartPasteWidget.jsx'

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
  runSmartPastePipeline.mockReset()
})

describe('SmartPasteWidget pipeline wiring', () => {
  it('invokes runSmartPastePipeline with text, products, context, runInference', async () => {
    runSmartPastePipeline.mockResolvedValue({
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
      expect(runSmartPastePipeline).toHaveBeenCalledTimes(1)
    })
    const call = runSmartPastePipeline.mock.calls[0][0]
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
    runSmartPastePipeline.mockResolvedValue({
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

    expect(runSmartPastePipeline).not.toHaveBeenCalled()
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

  it('drives per-batch spinners via onStage and resolves them in batch order', async () => {
    const paste = [
      '1 x Alpha widget that definitely does not exist',
      '1 x Beta widget that definitely does not exist',
      '1 x Gamma widget that definitely does not exist',
      '1 x Delta widget that definitely does not exist',
      '1 x Epsilon widget that definitely does not exist',
    ].join('\n')

    let resolvePipeline
    runSmartPastePipeline.mockImplementation(async ({ onStage }) => {
      onStage({ stage: 'extract' })
      onStage({ stage: 'match', batchIndex: 0, totalBatches: 3 })
      onStage({ stage: 'match', batchIndex: 1, totalBatches: 3 })
      onStage({ stage: 'match', batchIndex: 2, totalBatches: 3 })
      return new Promise((res) => {
        resolvePipeline = res
      })
    })

    setup()
    typeAndParse(paste)

    await waitFor(() => expect(runSmartPastePipeline).toHaveBeenCalledTimes(1))
    // Only the most recent batch's rows remain pending.
    await waitFor(() => {
      expect(screen.getByTestId('ai-pending-4')).toBeInTheDocument()
    })
    expect(screen.queryByTestId('ai-pending-0')).not.toBeInTheDocument()
    expect(screen.queryByTestId('ai-pending-1')).not.toBeInTheDocument()
    expect(screen.queryByTestId('ai-pending-2')).not.toBeInTheDocument()
    expect(screen.queryByTestId('ai-pending-3')).not.toBeInTheDocument()

    resolvePipeline({
      extracted: [{ text: 'Alpha', qty: 1, description: 'Alpha' }],
      rows: [
        {
          extracted: { text: 'Alpha', qty: 1, description: 'Alpha' },
          product: products[0],
          confidence: 90,
          source: 'ai',
        },
      ],
      callCount: 4,
      fallback: false,
    })

    await waitFor(() => {
      expect(screen.queryByTestId('ai-pending-4')).not.toBeInTheDocument()
    })
  })

  it('marks rows with batch-failed when onStage emits an error for that batch', async () => {
    const paste = ['1 x Nope alpha xyz', '1 x Nope beta xyz'].join('\n')
    let resolvePipeline
    runSmartPastePipeline.mockImplementation(async ({ onStage }) => {
      onStage({ stage: 'extract' })
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

    await waitFor(() => {
      expect(screen.getByTestId('batch-failed-0')).toBeInTheDocument()
    })
    expect(screen.getByTestId('batch-failed-1')).toBeInTheDocument()
    expect(screen.queryByTestId('ai-pending-0')).not.toBeInTheDocument()

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

    // Pipeline resolution replaces regex rows with pipeline rows — the new
    // single no-match row should render.
    await waitFor(() => {
      expect(screen.getByText(/No match/)).toBeInTheDocument()
    })
  })

  it("does not call the pipeline when aiMode is 'off'", () => {
    setup({ aiMode: 'off' })
    typeAndParse('2 x Blue Molar Extractor')
    expect(runSmartPastePipeline).not.toHaveBeenCalled()
  })

  it('skips the pipeline when fuzzy already matched every row above the floor', () => {
    setup()
    // Exact catalog name → auto_match at 100%, no low-confidence rows.
    typeAndParse('2 x Blue Molar Extractor')
    expect(runSmartPastePipeline).not.toHaveBeenCalled()
    expect(screen.getByText(/100% match/)).toBeInTheDocument()
  })
})
