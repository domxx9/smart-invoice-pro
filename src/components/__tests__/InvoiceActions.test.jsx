import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { InvoiceActions } from '../InvoiceActions.jsx'
import { ToastProvider } from '../../contexts/ToastContext.jsx'
import { SettingsProvider } from '../../contexts/SettingsContext.jsx'

function renderWithProviders(ui) {
  return render(
    <SettingsProvider>
      <ToastProvider>{ui}</ToastProvider>
    </SettingsProvider>,
  )
}

const baseInv = {
  id: 'INV0001',
  customer: 'Acme',
  status: 'new',
  items: [{ desc: 'Widget', qty: 1, price: 10 }],
  tax: 10,
  date: '2026-01-01',
  due: '2026-01-15',
}

describe('InvoiceActions', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('renders the workflow button for the current status', () => {
    renderWithProviders(
      <InvoiceActions inv={baseInv} onSave={vi.fn()} onClose={vi.fn()} onDelete={vi.fn()} />,
    )
    expect(screen.getByRole('button', { name: 'Mark as Sent' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument()
  })

  it('advances status via onSave when workflow button is clicked', () => {
    const onSave = vi.fn()
    renderWithProviders(
      <InvoiceActions inv={baseInv} onSave={onSave} onClose={vi.fn()} onDelete={vi.fn()} />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Mark as Sent' }))
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ status: 'pending' }))
  })

  it('opens delete confirmation and calls onDelete with invoice id', () => {
    const onDelete = vi.fn()
    const { container } = renderWithProviders(
      <InvoiceActions inv={baseInv} onSave={vi.fn()} onClose={vi.fn()} onDelete={onDelete} />,
    )
    const deleteIconBtn = container.querySelector('button[style*="var(--danger)"]')
    fireEvent.click(deleteIconBtn)
    expect(screen.getByText('Delete Invoice?')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(onDelete).toHaveBeenCalledWith('INV0001')
  })

  it('calls onClose when the Close button is clicked', () => {
    const onClose = vi.fn()
    renderWithProviders(
      <InvoiceActions inv={baseInv} onSave={vi.fn()} onClose={onClose} onDelete={vi.fn()} />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalledWith(baseInv)
  })
})
