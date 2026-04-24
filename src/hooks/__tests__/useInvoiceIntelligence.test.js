import { describe, it, expect } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useInvoiceIntelligence } from '../useInvoiceIntelligence.js'

function makeInvoice(overrides = {}) {
  return {
    customer: 'Acme Corp',
    items: [{ desc: 'Widget', qty: 1, price: 10 }],
    date: '2026-01-01',
    due: '2026-01-15',
    ...overrides,
  }
}

function run(invoice, products = []) {
  const { result } = renderHook(() => useInvoiceIntelligence({ invoice, products }))
  return result.current
}

describe('useInvoiceIntelligence — happy path', () => {
  it('returns no issues for a well-formed invoice', () => {
    const { issues, hasIssues } = run(makeInvoice())
    expect(issues).toEqual([])
    expect(hasIssues).toBe(false)
  })

  it('returns no issues when called with no arguments', () => {
    const { result } = renderHook(() => useInvoiceIntelligence())
    expect(result.current.issues).toEqual([])
    expect(result.current.hasIssues).toBe(false)
  })
})

describe('useInvoiceIntelligence — customer detection', () => {
  it('flags missing customer', () => {
    const { issues } = run(makeInvoice({ customer: '' }))
    expect(issues).toContain('Customer name is missing')
  })

  it('flags whitespace-only customer', () => {
    const { issues } = run(makeInvoice({ customer: '   ' }))
    expect(issues).toContain('Customer name is missing')
  })
})

describe('useInvoiceIntelligence — line item detection', () => {
  it('flags invoice with no line items', () => {
    const { issues } = run(makeInvoice({ items: [] }))
    expect(issues).toContain('Invoice has no line items')
  })

  it('flags line item with no description', () => {
    const { issues } = run(makeInvoice({ items: [{ desc: '', qty: 1, price: 10 }] }))
    expect(issues).toContain('Line item 1 has no description')
  })

  it('flags line item with whitespace-only description', () => {
    const { issues } = run(makeInvoice({ items: [{ desc: '  ', qty: 1, price: 10 }] }))
    expect(issues).toContain('Line item 1 has no description')
  })

  it('flags line item with empty price string', () => {
    const { issues } = run(makeInvoice({ items: [{ desc: 'Widget', qty: 1, price: '' }] }))
    expect(issues).toContain('Line item 1 has no price')
  })

  it('flags line item with zero price', () => {
    const { issues } = run(makeInvoice({ items: [{ desc: 'Widget', qty: 1, price: 0 }] }))
    expect(issues).toContain('Line item 1 has no price')
  })

  it('flags line item with negative price', () => {
    const { issues } = run(makeInvoice({ items: [{ desc: 'Widget', qty: 1, price: -5 }] }))
    expect(issues).toContain('Line item 1 has no price')
  })

  it('flags line item with zero quantity', () => {
    const { issues } = run(makeInvoice({ items: [{ desc: 'Widget', qty: 0, price: 10 }] }))
    expect(issues).toContain('Line item 1 has zero or negative quantity')
  })

  it('flags line item with negative quantity', () => {
    const { issues } = run(makeInvoice({ items: [{ desc: 'Widget', qty: -1, price: 10 }] }))
    expect(issues).toContain('Line item 1 has zero or negative quantity')
  })

  it('uses 1-based numbering across multiple items', () => {
    const { issues } = run(
      makeInvoice({
        items: [
          { desc: 'Widget', qty: 1, price: 10 },
          { desc: '', qty: 1, price: 10 },
          { desc: 'Gadget', qty: 1, price: '' },
        ],
      }),
    )
    expect(issues).toContain('Line item 2 has no description')
    expect(issues).toContain('Line item 3 has no price')
    expect(issues).not.toContain('Line item 1 has no description')
  })
})

describe('useInvoiceIntelligence — date detection', () => {
  it('flags due date before invoice date', () => {
    const { issues } = run(makeInvoice({ date: '2026-02-01', due: '2026-01-15' }))
    expect(issues).toContain('Due date is before the invoice date')
  })

  it('does not flag when due date equals invoice date', () => {
    const { issues } = run(makeInvoice({ date: '2026-01-15', due: '2026-01-15' }))
    expect(issues).not.toContain('Due date is before the invoice date')
  })

  it('does not flag when dates are absent', () => {
    const { issues } = run(makeInvoice({ date: '', due: '' }))
    expect(issues).not.toContain('Due date is before the invoice date')
  })
})

describe('useInvoiceIntelligence — hasIssues', () => {
  it('is true when any issue exists', () => {
    const { hasIssues } = run(makeInvoice({ customer: '' }))
    expect(hasIssues).toBe(true)
  })

  it('accumulates multiple issues simultaneously', () => {
    const { issues } = run(
      makeInvoice({
        customer: '',
        items: [{ desc: '', qty: 0, price: '' }],
        date: '2026-03-01',
        due: '2026-01-01',
      }),
    )
    expect(issues.length).toBeGreaterThanOrEqual(4)
  })
})
