import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { InvoiceFields } from '../InvoiceFields.jsx'

const baseInv = {
  customer: 'Jane Smith',
  customerBusiness: '',
  email: '',
  address1: '',
  address2: '',
  city: '',
  postcode: '',
  country: '',
  date: '2026-01-01',
  due: '2026-01-15',
  tax: 20,
}

describe('InvoiceFields', () => {
  it('renders customer, date, tax inputs with current values', () => {
    render(<InvoiceFields inv={baseInv} setField={vi.fn()} />)
    expect(screen.getByDisplayValue('Jane Smith')).toBeInTheDocument()
    expect(screen.getByDisplayValue('2026-01-01')).toBeInTheDocument()
    expect(screen.getByDisplayValue('20')).toBeInTheDocument()
  })

  it('calls setField when a text input changes', () => {
    const setField = vi.fn()
    render(<InvoiceFields inv={baseInv} setField={setField} />)
    fireEvent.change(screen.getByPlaceholderText('Jane Smith'), {
      target: { value: 'John Doe' },
    })
    expect(setField).toHaveBeenCalledWith('customer', 'John Doe')
  })

  it('calls setField when tax % changes', () => {
    const setField = vi.fn()
    render(<InvoiceFields inv={baseInv} setField={setField} />)
    const taxInput = screen.getByDisplayValue('20')
    fireEvent.change(taxInput, { target: { value: '10' } })
    expect(setField).toHaveBeenCalledWith('tax', '10')
  })
})
