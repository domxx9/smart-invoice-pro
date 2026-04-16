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
})
