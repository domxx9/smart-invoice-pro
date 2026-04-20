import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { InvoiceDiscounts } from '../InvoiceDiscounts.jsx'

describe('InvoiceDiscounts', () => {
  it('renders the Add Discount button when there are none', () => {
    render(
      <InvoiceDiscounts
        discounts={[]}
        addDiscount={vi.fn()}
        setDiscount={vi.fn()}
        removeDiscount={vi.fn()}
      />,
    )
    expect(screen.getByText(/Add Discount/i)).toBeInTheDocument()
    expect(screen.queryByText(/Discounts/)).not.toBeInTheDocument()
  })

  it('calls addDiscount when the button is clicked', () => {
    const addDiscount = vi.fn()
    render(
      <InvoiceDiscounts
        discounts={[]}
        addDiscount={addDiscount}
        setDiscount={vi.fn()}
        removeDiscount={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByText(/Add Discount/i))
    expect(addDiscount).toHaveBeenCalled()
  })

  it('renders a row per discount with name, type, and value inputs', () => {
    render(
      <InvoiceDiscounts
        discounts={[
          { id: 'd1', name: 'Promo', type: 'percent', value: 10 },
          { id: 'd2', name: 'Goodwill', type: 'fixed', value: 5 },
        ]}
        addDiscount={vi.fn()}
        setDiscount={vi.fn()}
        removeDiscount={vi.fn()}
      />,
    )
    expect(screen.getByDisplayValue('Promo')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Goodwill')).toBeInTheDocument()
    expect(screen.getByLabelText('Discount 1 type')).toHaveValue('percent')
    expect(screen.getByLabelText('Discount 2 type')).toHaveValue('fixed')
    expect(screen.getByLabelText('Discount 1 value')).toHaveValue(10)
    expect(screen.getByLabelText('Discount 2 value')).toHaveValue(5)
  })

  it('calls setDiscount when a field is edited', () => {
    const setDiscount = vi.fn()
    render(
      <InvoiceDiscounts
        discounts={[{ id: 'd1', name: '', type: 'percent', value: '' }]}
        addDiscount={vi.fn()}
        setDiscount={setDiscount}
        removeDiscount={vi.fn()}
      />,
    )
    fireEvent.change(screen.getByLabelText('Discount 1 value'), {
      target: { value: '15' },
    })
    expect(setDiscount).toHaveBeenCalledWith(0, 'value', '15')

    fireEvent.change(screen.getByLabelText('Discount 1 type'), {
      target: { value: 'fixed' },
    })
    expect(setDiscount).toHaveBeenCalledWith(0, 'type', 'fixed')
  })

  it('calls removeDiscount with the row index', () => {
    const removeDiscount = vi.fn()
    render(
      <InvoiceDiscounts
        discounts={[
          { id: 'd1', name: 'A', type: 'percent', value: 10 },
          { id: 'd2', name: 'B', type: 'fixed', value: 5 },
        ]}
        addDiscount={vi.fn()}
        setDiscount={vi.fn()}
        removeDiscount={removeDiscount}
      />,
    )
    fireEvent.click(screen.getByLabelText('Remove discount 2'))
    expect(removeDiscount).toHaveBeenCalledWith(1)
  })

  it('tolerates undefined or non-array discounts input', () => {
    render(
      <InvoiceDiscounts
        discounts={undefined}
        addDiscount={vi.fn()}
        setDiscount={vi.fn()}
        removeDiscount={vi.fn()}
      />,
    )
    expect(screen.getByText(/Add Discount/i)).toBeInTheDocument()
  })
})
