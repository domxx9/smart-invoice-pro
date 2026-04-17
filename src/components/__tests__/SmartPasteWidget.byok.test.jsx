/**
 * BYOK wiring for SmartPasteWidget (SMA-49).
 *
 * When aiMode is non-off and a row lands with confidence < 65, the widget
 * kicks runInference in the background, surfaces a pending indicator, and
 * upgrades the row with the AI-picked catalog product. Failures must toast.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { SmartPasteWidget } from '../SmartPasteWidget.jsx'

const products = [
  { id: 'p1', name: 'Blue Molar Extractor', price: 25 },
  { id: 'p2', name: 'Sterilisation Cassette', price: 40 },
]

function setup({ runInference, aiMode = 'byok', toast = vi.fn() } = {}) {
  const onAddItems = vi.fn()
  const utils = render(
    <SmartPasteWidget
      products={products}
      onAddItems={onAddItems}
      aiMode={aiMode}
      runInference={runInference}
      toast={toast}
    />,
  )
  return { ...utils, onAddItems, toast }
}

function typeAndParse(text) {
  fireEvent.change(screen.getByPlaceholderText(/Paste an order/), { target: { value: text } })
  fireEvent.click(screen.getByRole('button', { name: /Parse/i }))
}

describe('SmartPasteWidget BYOK refinement', () => {
  it('fires runInference for low-confidence rows and upgrades them with the AI pick', async () => {
    let resolveCall
    const runInference = vi.fn(
      () =>
        new Promise((res) => {
          resolveCall = res
        }),
    )
    setup({ runInference })

    typeAndParse('2 x Gobbledygook Nonsense Product')

    // No-match row appears and shows the pending AI indicator.
    await waitFor(() => {
      expect(screen.getByText(/No match/)).toBeInTheDocument()
    })
    expect(screen.getByText(/AI matching…/)).toBeInTheDocument()
    expect(runInference).toHaveBeenCalledTimes(1)
    const [[call]] = runInference.mock.calls
    expect(call.prompt).toContain('Blue Molar Extractor')
    expect(call.maxTokens).toBe(8)

    // Model picks catalog item #1 → row should promote to best_guess with AI label.
    resolveCall({ text: '1', source: 'byok' })
    await waitFor(() => {
      expect(screen.getByText(/AI suggested:/)).toBeInTheDocument()
    })
    expect(screen.getByText(/Blue Molar Extractor/)).toBeInTheDocument()
    expect(screen.queryByText(/AI matching…/)).not.toBeInTheDocument()
  })

  it('surfaces a toast when runInference rejects', async () => {
    const runInference = vi.fn().mockRejectedValue(new Error('BYOK 401: Invalid API key'))
    const { toast } = setup({ runInference })

    typeAndParse('Mystery Item')

    await waitFor(() => {
      expect(toast).toHaveBeenCalledWith(expect.stringContaining('Invalid API key'), 'error')
    })
    expect(screen.queryByText(/AI matching…/)).not.toBeInTheDocument()
  })

  it("does not call runInference when aiMode is 'off'", async () => {
    const runInference = vi.fn()
    setup({ runInference, aiMode: 'off' })

    typeAndParse('2 x Blue Molar Extractor')
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Add 1 matched/ })).toBeInTheDocument()
    })
    expect(runInference).not.toHaveBeenCalled()
  })

  it('does not call runInference for rows that already match above the threshold', async () => {
    const runInference = vi.fn()
    setup({ runInference, aiMode: 'byok' })

    // Exact catalog name → auto_match (confidence 100%).
    typeAndParse('2 x Blue Molar Extractor')
    await waitFor(() => {
      expect(screen.getByText(/100% match/)).toBeInTheDocument()
    })
    expect(runInference).not.toHaveBeenCalled()
  })

  it('clears bestGuess when the model responds with 0 (no match)', async () => {
    const runInference = vi.fn().mockResolvedValue({ text: '0', source: 'byok' })
    setup({ runInference, aiMode: 'byok' })

    typeAndParse('Totally unrelated thing xyzzy')

    await waitFor(() => {
      expect(runInference).toHaveBeenCalled()
    })
    // No spinner left; still shown as no_match.
    await waitFor(() => {
      expect(screen.queryByText(/AI matching…/)).not.toBeInTheDocument()
    })
    expect(screen.getByText(/No match/)).toBeInTheDocument()
    expect(screen.queryByText(/AI suggested:/)).not.toBeInTheDocument()
  })
})
