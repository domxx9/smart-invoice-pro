import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Dashboard } from '../Dashboard.jsx'

describe('Dashboard', () => {
  it('renders without crashing with empty invoices', () => {
    render(<Dashboard invoices={[]} onNewInvoice={vi.fn()} onOpenInvoice={vi.fn()} />)
    expect(screen.getByText('Dashboard')).toBeInTheDocument()
    expect(screen.getByText('No invoices yet.')).toBeInTheDocument()
  })

  it('renders stat cards and invoice data', () => {
    const invoices = [
      {
        id: 'INV0001',
        customer: 'Acme Corp',
        date: new Date().toISOString().slice(0, 10),
        due: '',
        status: 'paid',
        items: [{ desc: 'Widget', qty: 2, price: 50 }],
        tax: 10,
      },
    ]
    render(<Dashboard invoices={invoices} onNewInvoice={vi.fn()} onOpenInvoice={vi.fn()} />)
    expect(screen.getAllByText('Total Revenue').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('INV0001')).toBeInTheDocument()
    expect(screen.getByText('Acme Corp')).toBeInTheDocument()
  })
})
