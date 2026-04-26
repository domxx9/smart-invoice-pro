import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { InvoiceContext } from '../../contexts/InvoiceContext.jsx'
import { Invoices } from '../InvoiceList.jsx'

function makeInvoice(overrides = {}) {
  return {
    id: 'INV-001',
    customer: 'Alice',
    customerBusiness: '',
    email: 'alice@example.com',
    status: 'pending',
    due: '2099-12-31',
    items: [{ qty: 1, price: 100, name: 'Widget' }],
    tax: 0,
    ...overrides,
  }
}

function makeContext(overrides = {}) {
  return {
    invoices: [],
    handleNewInvoice: vi.fn(),
    handleEdit: vi.fn(),
    handleDuplicateInvoice: vi.fn(),
    editing: null,
    ...overrides,
  }
}

function renderInvoices(ctx = {}) {
  const value = makeContext(ctx)
  return {
    ...render(
      <InvoiceContext.Provider value={value}>
        <Invoices />
      </InvoiceContext.Provider>,
    ),
    ctx: value,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('Invoices — empty state', () => {
  it('shows "No invoices." when list is empty', () => {
    renderInvoices()
    expect(screen.getByText('No invoices.')).toBeInTheDocument()
  })

  it('renders a New button', () => {
    renderInvoices()
    const btn = screen
      .getAllByRole('button', { name: /new/i })
      .find((b) => b.classList.contains('btn-primary'))
    expect(btn).toBeInTheDocument()
  })

  it('calls handleNewInvoice when New is clicked', () => {
    const { ctx } = renderInvoices()
    const btn = screen
      .getAllByRole('button', { name: /new/i })
      .find((b) => b.classList.contains('btn-primary'))
    fireEvent.click(btn)
    expect(ctx.handleNewInvoice).toHaveBeenCalledOnce()
  })
})

describe('Invoices — rendering invoices', () => {
  it('renders each invoice id', () => {
    renderInvoices({ invoices: [makeInvoice({ id: 'INV-001' }), makeInvoice({ id: 'INV-002' })] })
    expect(screen.getByText('INV-001')).toBeInTheDocument()
    expect(screen.getByText('INV-002')).toBeInTheDocument()
  })

  it('renders customer name', () => {
    renderInvoices({ invoices: [makeInvoice({ customer: 'Bob' })] })
    expect(screen.getByText(/Bob/)).toBeInTheDocument()
  })

  it('shows "Unsaved draft" label for draft invoices', () => {
    renderInvoices({ invoices: [makeInvoice({ status: 'draft' })] })
    expect(screen.getByText(/Unsaved draft/i)).toBeInTheDocument()
  })

  it('calls handleEdit when invoice row is clicked', () => {
    const inv = makeInvoice()
    const { ctx } = renderInvoices({ invoices: [inv] })
    fireEvent.click(screen.getByRole('button', { name: /open invoice INV-001/i }))
    expect(ctx.handleEdit).toHaveBeenCalledWith(inv)
  })

  it('calls handleDuplicateInvoice when duplicate button is clicked', () => {
    const inv = makeInvoice({ status: 'paid' })
    const { ctx } = renderInvoices({ invoices: [inv] })
    fireEvent.click(screen.getByRole('button', { name: /duplicate invoice INV-001/i }))
    expect(ctx.handleDuplicateInvoice).toHaveBeenCalledWith(inv)
  })
})

describe('Invoices — search', () => {
  const invoices = [
    makeInvoice({ id: 'INV-001', customer: 'Alice', email: 'alice@example.com' }),
    makeInvoice({ id: 'INV-002', customer: 'Bob', email: 'bob@example.com' }),
  ]

  it('filters by customer name', () => {
    renderInvoices({ invoices })
    fireEvent.change(screen.getByPlaceholderText(/search/i), { target: { value: 'alice' } })
    expect(screen.getByText('INV-001')).toBeInTheDocument()
    expect(screen.queryByText('INV-002')).toBeNull()
  })

  it('filters by invoice id', () => {
    renderInvoices({ invoices })
    fireEvent.change(screen.getByPlaceholderText(/search/i), { target: { value: 'INV-002' } })
    expect(screen.queryByText('INV-001')).toBeNull()
    expect(screen.getByText('INV-002')).toBeInTheDocument()
  })

  it('shows clear button when search has text', () => {
    renderInvoices({ invoices })
    const input = screen.getByPlaceholderText(/search/i)
    expect(screen.queryByRole('button', { name: /clear search/i })).toBeNull()
    fireEvent.change(input, { target: { value: 'x' } })
    expect(screen.getByRole('button', { name: /clear search/i })).toBeInTheDocument()
  })

  it('clear button resets search', () => {
    renderInvoices({ invoices })
    fireEvent.change(screen.getByPlaceholderText(/search/i), { target: { value: 'alice' } })
    fireEvent.click(screen.getByRole('button', { name: /clear search/i }))
    expect(screen.getByText('INV-001')).toBeInTheDocument()
    expect(screen.getByText('INV-002')).toBeInTheDocument()
  })
})

describe('Invoices — filter chips', () => {
  it('renders filter buttons for all statuses', () => {
    renderInvoices()
    const group = screen.getByRole('group', { name: /filter invoices/i })
    expect(group.querySelectorAll('button')).toHaveLength(8)
  })

  it('All filter chip is pressed by default', () => {
    renderInvoices()
    const allChip = screen.getAllByRole('button').find((b) => b.textContent === 'All')
    expect(allChip).toHaveAttribute('aria-pressed', 'true')
  })

  it('filters invoices by status chip', () => {
    const invoices = [
      makeInvoice({ id: 'INV-001', status: 'paid' }),
      makeInvoice({ id: 'INV-002', status: 'pending' }),
    ]
    renderInvoices({ invoices })
    const paidChip = screen.getAllByRole('button').find((b) => b.textContent === 'Paid')
    fireEvent.click(paidChip)
    expect(screen.getByText('INV-001')).toBeInTheDocument()
    expect(screen.queryByText('INV-002')).toBeNull()
  })
})

describe('Invoices — overdue', () => {
  it('shows overdue badge for past-due pending invoices', () => {
    renderInvoices({
      invoices: [makeInvoice({ status: 'pending', due: '2020-01-01' })],
    })
    expect(screen.getByText('overdue')).toBeInTheDocument()
  })

  it('shows days overdue count', () => {
    renderInvoices({
      invoices: [makeInvoice({ status: 'pending', due: '2020-01-01' })],
    })
    expect(screen.getByText(/\d+ days? overdue/i)).toBeInTheDocument()
  })
})

describe('Invoices — editing draft injection', () => {
  it('injects editing invoice as draft at top when not in list', () => {
    const editing = makeInvoice({ id: 'INV-NEW', customer: 'Draft Customer', status: 'pending' })
    renderInvoices({ invoices: [], editing })
    expect(screen.getByText('INV-NEW')).toBeInTheDocument()
    expect(screen.getByText(/Unsaved draft/i)).toBeInTheDocument()
  })

  it('replaces existing invoice with editing version when id matches', () => {
    const original = makeInvoice({ id: 'INV-001', customer: 'Alice', status: 'paid' })
    const editing = { ...original, customer: 'Alice Edited', status: 'paid' }
    renderInvoices({ invoices: [original], editing })
    expect(screen.getByText(/Alice Edited/)).toBeInTheDocument()
    expect(screen.getByText(/Unsaved draft/i)).toBeInTheDocument()
  })
})
