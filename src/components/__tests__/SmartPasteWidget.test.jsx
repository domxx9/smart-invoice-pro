import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SmartPasteWidget } from '../SmartPasteWidget.jsx'
import { ToastProvider } from '../../contexts/ToastContext.jsx'

function renderWithToast(ui) {
  return render(<ToastProvider>{ui}</ToastProvider>)
}

describe('SmartPasteWidget', () => {
  it('renders header and disabled parse button when empty', () => {
    renderWithToast(<SmartPasteWidget products={[]} aiReady={false} onAddItems={vi.fn()} />)
    expect(screen.getByText('Smart Paste')).toBeInTheDocument()
    const btn = screen.getByRole('button', { name: /Parse/i })
    expect(btn).toBeDisabled()
  })

  it('enables parse once the textarea has content', () => {
    renderWithToast(<SmartPasteWidget products={[]} aiReady={false} onAddItems={vi.fn()} />)
    const textarea = screen.getByPlaceholderText(/Paste an order/)
    fireEvent.change(textarea, { target: { value: '2 x Widget' } })
    expect(screen.getByRole('button', { name: /Parse/i })).not.toBeDisabled()
  })

  it('runs regex match and shows auto_match row for an exact product name', () => {
    const products = [{ id: 'p1', name: 'Widget', price: 10 }]
    renderWithToast(<SmartPasteWidget products={products} aiReady={false} onAddItems={vi.fn()} />)
    fireEvent.change(screen.getByPlaceholderText(/Paste an order/), {
      target: { value: '2 x Widget' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Parse/i }))
    expect(screen.getByText(/2 × Widget/)).toBeInTheDocument()
  })

  // SMA-100: auto_match rows flow into the invoice on Parse (via onAddItems)
  // without requiring an "Add N matched" click — prevents data loss if the
  // user navigates away mid-session.
  it('auto-saves fuzzy auto_matches to the invoice on Parse (SMA-100)', () => {
    const products = [{ id: 'p1', name: 'Widget', price: 10 }]
    const onAddItems = vi.fn()
    renderWithToast(
      <SmartPasteWidget products={products} aiReady={false} onAddItems={onAddItems} />,
    )
    fireEvent.change(screen.getByPlaceholderText(/Paste an order/), {
      target: { value: '2 x Widget' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Parse/i }))
    expect(onAddItems).toHaveBeenCalledTimes(1)
    expect(onAddItems).toHaveBeenCalledWith([
      expect.objectContaining({ desc: 'Widget', qty: 2, price: 10 }),
    ])
    // Row still visible with a "Saved to invoice" badge, but the "Add N
    // matched" CTA is gone (nothing left to add explicitly).
    expect(screen.getByTestId('saved-badge-0')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Add \d+ matched/ })).not.toBeInTheDocument()
  })
})
