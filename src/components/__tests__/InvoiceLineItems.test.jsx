import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { InvoiceLineItems } from '../InvoiceLineItems.jsx'

const baseInv = {
  items: [{ desc: 'Widget', qty: 2, price: 50 }],
  tax: 10,
}

describe('InvoiceLineItems', () => {
  it('renders a row per line item and the totals', () => {
    render(
      <InvoiceLineItems
        inv={baseInv}
        products={[]}
        setItem={vi.fn()}
        addItem={vi.fn()}
        removeItem={vi.fn()}
        addProduct={vi.fn()}
      />,
    )
    expect(screen.getByDisplayValue('Widget')).toBeInTheDocument()
    expect(screen.getByText('Subtotal')).toBeInTheDocument()
    expect(screen.getByText('Tax (10%)')).toBeInTheDocument()
    expect(screen.getByText('Total')).toBeInTheDocument()
  })

  it('calls setItem when the description is edited', () => {
    const setItem = vi.fn()
    render(
      <InvoiceLineItems
        inv={baseInv}
        products={[]}
        setItem={setItem}
        addItem={vi.fn()}
        removeItem={vi.fn()}
        addProduct={vi.fn()}
      />,
    )
    fireEvent.change(screen.getByDisplayValue('Widget'), {
      target: { value: 'Updated desc' },
    })
    expect(setItem).toHaveBeenCalledWith(0, 'desc', 'Updated desc')
  })

  it('calls addItem when Add Line Item is clicked', () => {
    const addItem = vi.fn()
    render(
      <InvoiceLineItems
        inv={baseInv}
        products={[]}
        setItem={vi.fn()}
        addItem={addItem}
        removeItem={vi.fn()}
        addProduct={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByText(/Add Line Item/))
    expect(addItem).toHaveBeenCalled()
  })

  it('renders a discount line per applied discount and adjusts totals', () => {
    const invWithDiscount = {
      items: [{ desc: 'Widget', qty: 4, price: 25 }],
      tax: 10,
      discounts: [{ id: 'd1', name: 'Promo', type: 'percent', value: 10 }],
    }
    render(
      <InvoiceLineItems
        inv={invWithDiscount}
        products={[]}
        setItem={vi.fn()}
        addItem={vi.fn()}
        removeItem={vi.fn()}
        addProduct={vi.fn()}
        addDiscount={vi.fn()}
        setDiscount={vi.fn()}
        removeDiscount={vi.fn()}
      />,
    )
    const discountRows = screen.getAllByTestId('discount-line')
    expect(discountRows).toHaveLength(1)
    expect(discountRows[0]).toHaveTextContent('Promo')
    // Existing Add Discount button is present
    expect(screen.getByText(/Add Discount/i)).toBeInTheDocument()
  })

  it('renders no discount lines when the invoice has none', () => {
    render(
      <InvoiceLineItems
        inv={baseInv}
        products={[]}
        setItem={vi.fn()}
        addItem={vi.fn()}
        removeItem={vi.fn()}
        addProduct={vi.fn()}
      />,
    )
    expect(screen.queryAllByTestId('discount-line')).toHaveLength(0)
  })
})
